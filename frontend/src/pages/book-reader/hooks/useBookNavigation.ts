// 沉浸式阅读器 · 导航与播放 hook。
// 封装：currentId 状态、prev/next/goToChapter、自动播放/滚动、进度跟踪、键盘快捷键。
// 不涉及查找替换与 AI 清理（各有独立模块）。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Chapter } from '../../../services/types'

export type ReaderMode = 'read' | 'clean'

export interface UseBookNavigationParams {
  chapters: Chapter[]
  initialChapterId: string
  /** 键盘 Esc 行为：read 模式时按面板/退出分层，clean 流式中按取消 */
  mode: ReaderMode
  /** clean 流式状态（仅当 mode==='clean' 时） */
  isCleanStreaming: boolean
  /** 翻页速度（1-10），由父级 UI 维护 */
  playSpeed: number
  /** 滚动速度（1-10），由父级 UI 维护 */
  scrollSpeed: number
  /** Esc 顶层回调：未在面板/流式时调用（一般是 onExit） */
  onExit: () => void
  /** clean 流式被 Esc 触发时调用 */
  onCancelClean: () => void
  /** Esc 二级回调：clean 流式不在时若有左面板则调用 */
  onCloseLeftPanel: () => void
  /** 其他输入模式（编辑正文/标题）开启时屏蔽键盘 */
  isBlocked: boolean
}

export interface UseBookNavigationResult {
  currentId: string
  goToChapter: (id: string, opts?: { keepAuto?: boolean }) => void
  goPrev: () => void
  goNext: () => void
  progress: number
  recalcProgress: () => void
  contentRef: React.RefObject<HTMLDivElement | null>
  pendingProgressRef: React.MutableRefObject<number | null>
  pendingParaRef: React.MutableRefObject<number | null>
  scrollAccRef: React.MutableRefObject<number>
  isAutoPlaying: boolean
  setIsAutoPlaying: React.Dispatch<React.SetStateAction<boolean>>
  isAutoScrolling: boolean
  setIsAutoScrolling: React.Dispatch<React.SetStateAction<boolean>>
}

export function useBookNavigation(params: UseBookNavigationParams): UseBookNavigationResult {
  const {
    chapters,
    initialChapterId,
    mode,
    isCleanStreaming,
    playSpeed,
    scrollSpeed,
    onExit,
    onCancelClean,
    onCloseLeftPanel,
    isBlocked,
  } = params

  const [currentId, setCurrentId] = useState(initialChapterId)
  const [progress, setProgress] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [isAutoScrolling, setIsAutoScrolling] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const pendingProgressRef = useRef<number | null>(null)
  const pendingParaRef = useRef<number | null>(null)
  const scrollAccRef = useRef(0)

  const goToChapter = useCallback(
    (id: string, opts?: { keepAuto?: boolean }) => {
      setCurrentId(id)
      if (!opts?.keepAuto) {
        setIsAutoPlaying(false)
        setIsAutoScrolling(false)
      }
    },
    [],
  )

  const goPrev = useCallback(() => {
    const idx = chapters.findIndex((c) => c.id === currentId)
    if (idx > 0) goToChapter(chapters[idx - 1].id)
  }, [currentId, chapters, goToChapter])

  const goNext = useCallback(() => {
    const idx = chapters.findIndex((c) => c.id === currentId)
    if (idx >= 0 && idx < chapters.length - 1) goToChapter(chapters[idx + 1].id)
  }, [currentId, chapters, goToChapter])

  const recalcProgress = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setProgress(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0)
  }, [])

  useEffect(() => {
    if (mode !== 'read') return
    const el = contentRef.current
    if (!el) return
    el.addEventListener('scroll', recalcProgress, { passive: true })
    return () => el.removeEventListener('scroll', recalcProgress)
  }, [recalcProgress, mode])

  useLayoutEffect(() => {
    if (mode !== 'read') return
    const el = contentRef.current
    if (!el) return
    if (pendingProgressRef.current != null) {
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = max > 0 ? (pendingProgressRef.current / 100) * max : 0
      pendingProgressRef.current = null
    } else if (pendingParaRef.current != null) {
      const paraEl = el.querySelector(`[data-para-idx="${pendingParaRef.current}"]`)
      if (paraEl) paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      pendingParaRef.current = null
    } else {
      el.scrollTop = 0
    }
    recalcProgress()
  }, [currentId, recalcProgress, mode])

  // 自动播放（read 模式）
  useEffect(() => {
    if (!isAutoPlaying || mode !== 'read') return
    const timer = window.setInterval(() => {
      const el = contentRef.current
      if (!el) return
      const max = el.scrollHeight - el.clientHeight
      if (el.scrollTop >= max - 4) {
        const idx = chapters.findIndex((c) => c.id === currentId)
        if (idx < chapters.length - 1) goToChapter(chapters[idx + 1].id, { keepAuto: true })
        else setIsAutoPlaying(false)
      } else {
        el.scrollBy({ top: el.clientHeight * 0.9, behavior: 'smooth' })
      }
    }, (11 - playSpeed) * 1000)
    return () => clearInterval(timer)
  }, [isAutoPlaying, playSpeed, currentId, chapters, goToChapter, mode])

  // 自动滚动（read 模式）
  useEffect(() => {
    if (!isAutoScrolling || mode !== 'read') return
    let raf = 0
    const pxPerFrame = scrollSpeed * 0.4
    const step = () => {
      const el = contentRef.current
      if (el) {
        const max = el.scrollHeight - el.clientHeight
        if (el.scrollTop >= max - 1) {
          const idx = chapters.findIndex((c) => c.id === currentId)
          if (idx < chapters.length - 1) {
            goToChapter(chapters[idx + 1].id, { keepAuto: true })
            return
          } else {
            setIsAutoScrolling(false)
            return
          }
        }
        scrollAccRef.current += pxPerFrame
        const whole = Math.floor(scrollAccRef.current)
        if (whole >= 1) {
          el.scrollTop += whole
          scrollAccRef.current -= whole
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [isAutoScrolling, scrollSpeed, currentId, chapters, goToChapter, mode])

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isBlocked) return
      if (e.key === 'Escape') {
        if (mode === 'clean') {
          if (isCleanStreaming) onCancelClean()
          else onCloseLeftPanel()
        } else if (mode === 'read') {
          onCloseLeftPanel() // 关闭左面板
        } else {
          onExit()
        }
      } else if (e.key === 'ArrowLeft' && mode === 'read') {
        goPrev()
      } else if (e.key === 'ArrowRight' && mode === 'read') {
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isBlocked, mode, isCleanStreaming, onCancelClean, onCloseLeftPanel, onExit, goPrev, goNext])

  return {
    currentId,
    goToChapter,
    goPrev,
    goNext,
    progress,
    recalcProgress,
    contentRef,
    pendingProgressRef,
    pendingParaRef,
    scrollAccRef,
    isAutoPlaying,
    setIsAutoPlaying,
    isAutoScrolling,
    setIsAutoScrolling,
  }
}
