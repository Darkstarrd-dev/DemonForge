import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { App, Button, Input, Popover, Slider, Tooltip, Tag } from 'antd'
import {
  ArrowLeftOutlined,
  UnorderedListOutlined,
  LeftOutlined,
  RightOutlined,
  FontSizeOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  VerticalAlignBottomOutlined,
  PauseOutlined,
  SoundOutlined,
  EditOutlined,
  BookOutlined,
  BulbOutlined,
  BulbFilled,
  CloseOutlined,
  DeleteOutlined,
  PlusOutlined,
  CheckOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  StopOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useAppStore, pushStoreNow } from '../../store/appStore'
import type { Chapter, LineDecision } from '../../services/types'
import DiffView from '../m1-import/DiffView'
import { alignedDiff, applyLineDecisions } from '../../utils/alignedDiff'
import { streamSingleChapter } from '../../services/api'
import type { CleanNode, CleanQueueCallbacks } from '../../services/api'
import './ImmersiveReader.css'

// ── Find/Replace types ──
interface FindResult {
  chapterId: string
  chapterTitle: string
  paraIdx: number
  paraText: string
}

// ── Helpers ──
function buildFindRegex(pattern: string, useRegex: boolean, caseSensitive: boolean): RegExp | null {
  try {
    const src = useRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(src, caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

function highlightParts(text: string, regex: RegExp | null): { text: string; hl: boolean }[] {
  if (!regex) return [{ text, hl: false }]
  const parts: { text: string; hl: boolean }[] = []
  const re = new RegExp(regex.source, regex.flags)
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), hl: false })
    parts.push({ text: m[0], hl: true })
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++
  }
  if (last < text.length) parts.push({ text: text.slice(last), hl: false })
  return parts.length > 0 ? parts : [{ text, hl: false }]
}

function buildFindResults(chapters: Chapter[], regex: RegExp): FindResult[] {
  const out: FindResult[] = []
  for (const ch of chapters) {
    const paras = ch.content.split('\n')
    for (let i = 0; i < paras.length; i++) {
      const clone = new RegExp(regex.source, regex.flags)
      if (clone.test(paras[i])) out.push({ chapterId: ch.id, chapterTitle: ch.title, paraIdx: i, paraText: paras[i] })
    }
  }
  return out
}

interface Bookmark {
  id: string
  chapterId: string
  chapterTitle: string
  progress: number
  createdAt: string
}

interface ImmersiveReaderProps {
  chapters: Chapter[]
  initialChapterId: string
  bookId: string
  onExit: () => void
}

type ReaderTheme = 'light' | 'dark'
type LeftPanel = 'chapters' | 'bookmarks' | null
type CleanPhase = 'selecting' | 'streaming' | 'review' | 'error'
type ReplaceMode = 'preview' | 'apply'

export default function ImmersiveReader({
  chapters,
  initialChapterId,
  bookId,
  onExit,
}: ImmersiveReaderProps) {
  const { message } = App.useApp()
  const updateChapter = useAppStore((s) => s.updateChapter)
  const globalTheme = useAppStore((s) => s.theme)
  const providers = useAppStore((s) => s.providers)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const consumeProviderUsage = useAppStore((s) => s.consumeProviderUsage)

  const readerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pendingProgressRef = useRef<number | null>(null)
  const pendingParaRef = useRef<number | null>(null)
  const scrollAccRef = useRef(0)
  const cleanAbortRef = useRef<AbortController | null>(null)

  // ── Reading state ──
  const [currentId, setCurrentId] = useState(initialChapterId)
  const [fontSize, setFontSize] = useState(() => {
    const v = Number(localStorage.getItem('imm-font-size'))
    return v >= 14 && v <= 40 ? v : 20
  })
  const [theme, setTheme] = useState<ReaderTheme>(
    () => (localStorage.getItem('imm-theme') as ReaderTheme) || globalTheme,
  )
  const [scrollSpeed, setScrollSpeed] = useState(() => {
    const v = Number(localStorage.getItem('imm-scroll-speed'))
    return v >= 1 && v <= 10 ? v : 3
  })
  const [playSpeed, setPlaySpeed] = useState(() => {
    const v = Number(localStorage.getItem('imm-play-speed'))
    return v >= 1 && v <= 10 ? v : 8
  })
  const [progress, setProgress] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(null)
  const [fontOpen, setFontOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [playOpen, setPlayOpen] = useState(false)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [isAutoScrolling, setIsAutoScrolling] = useState(false)
  const [editingContent, setEditingContent] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState<{ id: string; title: string } | null>(null)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try { return JSON.parse(localStorage.getItem(`imm-bm-${bookId}`) || '[]') } catch { return [] }
  })

  // ── Find/Replace state ──
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [replaceMode, setReplaceMode] = useState<ReplaceMode>('preview')
  const [findWindowStart, setFindWindowStart] = useState(0)
  const PAGE_SIZE = 30

  // ── Single-chapter AI Clean state ──
  const [cleanChapterId, setCleanChapterId] = useState<string | null>(null)
  const [cleanPhase, setCleanPhase] = useState<CleanPhase>('selecting')
  const [cleanedContent, setCleanedContent] = useState<string | null>(null)
  const [liveAcc, setLiveAcc] = useState('')
  const [lineDecisions, setLineDecisions] = useState<Record<number, LineDecision>>({})
  const [cleanError, setCleanError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // ── Computed ──
  const currentIndex = chapters.findIndex((c) => c.id === currentId)
  const current = chapters[currentIndex] ?? chapters[0] ?? null
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null
  const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null
  const cleanChapter = cleanChapterId ? chapters.find((c) => c.id === cleanChapterId) : null
  const readerMode: 'read' | 'clean' = cleanChapterId ? 'clean' : 'read'

  // ── Find regex ──
  const findRegex = useMemo(
    () => (findText.trim() ? buildFindRegex(findText, useRegex, caseSensitive) : null),
    [findText, useRegex, caseSensitive],
  )
  const findResults = useMemo(
    () => (findRegex ? buildFindResults(chapters, findRegex) : []),
    [chapters, findRegex],
  )

  // ── Persistence effects ──
  useEffect(() => void localStorage.setItem('imm-font-size', String(fontSize)), [fontSize])
  useEffect(() => void localStorage.setItem('imm-theme', theme), [theme])
  useEffect(() => void localStorage.setItem('imm-scroll-speed', String(scrollSpeed)), [scrollSpeed])
  useEffect(() => void localStorage.setItem('imm-play-speed', String(playSpeed)), [playSpeed])
  useEffect(() => {
    localStorage.setItem(`imm-bm-${bookId}`, JSON.stringify(bookmarks))
  }, [bookmarks, bookId])

  // ── Progress ──
  const recalcProgress = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setProgress(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0)
  }, [])

  useEffect(() => {
    if (readerMode !== 'read') return
    const el = contentRef.current
    if (!el) return
    el.addEventListener('scroll', recalcProgress, { passive: true })
    return () => el.removeEventListener('scroll', recalcProgress)
  }, [recalcProgress, readerMode])

  useLayoutEffect(() => {
    if (readerMode !== 'read') return
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
  }, [currentId, recalcProgress, readerMode])

  // ── Navigation ──
  const goToChapter = useCallback((id: string, opts?: { keepAuto?: boolean }) => {
    setCurrentId(id)
    if (!opts?.keepAuto) {
      setIsAutoPlaying(false)
      setIsAutoScrolling(false)
    }
  }, [])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goToChapter(chapters[currentIndex - 1].id)
  }, [currentIndex, chapters, goToChapter])
  const goNext = useCallback(() => {
    if (currentIndex < chapters.length - 1) goToChapter(chapters[currentIndex + 1].id)
  }, [currentIndex, chapters, goToChapter])

  // ── Auto-play / auto-scroll ──
  useEffect(() => {
    if (!isAutoPlaying || readerMode !== 'read') return
    const timer = window.setInterval(() => {
      const el = contentRef.current
      if (!el) return
      const max = el.scrollHeight - el.clientHeight
      if (el.scrollTop >= max - 4) {
        if (currentIndex < chapters.length - 1) goToChapter(chapters[currentIndex + 1].id, { keepAuto: true })
        else setIsAutoPlaying(false)
      } else {
        el.scrollBy({ top: el.clientHeight * 0.9, behavior: 'smooth' })
      }
    }, (11 - playSpeed) * 1000)
    return () => clearInterval(timer)
  }, [isAutoPlaying, playSpeed, currentIndex, chapters, goToChapter, readerMode])

  useEffect(() => {
    if (!isAutoScrolling || readerMode !== 'read') return
    let raf = 0
    const pxPerFrame = scrollSpeed * 0.4
    const step = () => {
      const el = contentRef.current
      if (el) {
        const max = el.scrollHeight - el.clientHeight
        if (el.scrollTop >= max - 1) {
          if (currentIndex < chapters.length - 1) {
            goToChapter(chapters[currentIndex + 1].id, { keepAuto: true })
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
  }, [isAutoScrolling, scrollSpeed, currentIndex, chapters, goToChapter, readerMode])

  const toggleAutoPlay = () => {
    setIsAutoPlaying((v) => !v)
    setIsAutoScrolling(false)
  }
  const toggleAutoScroll = () => {
    setIsAutoScrolling((v) => !v)
    setIsAutoPlaying(false)
  }

  // ── Toolbar visibility ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => setHovering(e.clientY > window.innerHeight - 170)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  const pinned = leftPanel !== null || fontOpen || speedOpen || playOpen || findOpen || readerMode === 'clean'
  const showControls = hovering || pinned

  // ── Progress bar seek ──
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = contentRef.current
    if (!el) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
    setIsAutoPlaying(false)
    setIsAutoScrolling(false)
  }

  // ── Bookmarks ──
  const addBookmark = () => {
    if (!current) return
    const bm: Bookmark = {
      id: `${current.id}-${progress}-${bookmarks.length}`,
      chapterId: current.id,
      chapterTitle: current.title,
      progress,
      createdAt: new Date().toISOString(),
    }
    setBookmarks((list) => [bm, ...list].slice(0, 50))
    message.success(`已添加书签：${current.title}（${progress}%）`)
  }
  const deleteBookmark = (id: string) => setBookmarks((list) => list.filter((b) => b.id !== id))
  const jumpToBookmark = (bm: Bookmark) => {
    setIsAutoPlaying(false)
    setIsAutoScrolling(false)
    if (bm.chapterId === currentId) {
      const el = contentRef.current
      if (el) el.scrollTop = (bm.progress / 100) * (el.scrollHeight - el.clientHeight)
    } else {
      pendingProgressRef.current = bm.progress
      setCurrentId(bm.chapterId)
    }
    setLeftPanel(null)
  }

  // ── Edit content ──
  const startEditContent = () => current && setEditingContent(current.content)
  const saveContent = () => {
    if (!current || editingContent === null) return
    updateChapter(current.id, { content: editingContent, updatedAt: new Date().toISOString() })
    pushStoreNow()
    setEditingContent(null)
    message.success('正文已保存')
  }

  // ── Edit title ──
  const saveTitle = () => {
    if (!titleDraft) return
    updateChapter(titleDraft.id, { title: titleDraft.title })
    pushStoreNow()
    setTitleDraft(null)
    message.success('章节标题已保存')
  }

  // ── Find/Replace logic ──
  const jumpToFindResult = (r: FindResult) => {
    if (r.chapterId !== currentId) {
      pendingParaRef.current = r.paraIdx
      goToChapter(r.chapterId)
    } else {
      pendingParaRef.current = r.paraIdx
      const el = contentRef.current
      if (el) {
        const paraEl = el.querySelector(`[data-para-idx="${r.paraIdx}"]`)
        if (paraEl) paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  const doReplaceAll = () => {
    if (!findRegex) return
    const chapterIds = [...new Set(findResults.map((r) => r.chapterId))]
    for (const chId of chapterIds) {
      const ch = chapters.find((c) => c.id === chId)
      if (!ch) continue
      updateChapter(chId, { content: ch.content.replace(findRegex, replaceText), updatedAt: new Date().toISOString() })
    }
    pushStoreNow()
    message.success(`已替换 ${chapterIds.length} 个章节中的匹配项`)
  }

  // ── Clean mode logic ──
  const exitCleanMode = useCallback(() => {
    cleanAbortRef.current?.abort()
    setCleanChapterId(null)
    setLeftPanel(null)
  }, [])

  const enterCleanMode = (chId: string) => {
    setCleanChapterId(chId)
    setCleanPhase('selecting')
    setCleanedContent(null)
    setLiveAcc('')
    setLineDecisions({})
    setCleanError(null)
    setSelectedNodeId(null)
    setLeftPanel('chapters')
  }

  const startClean = async () => {
    if (!cleanChapter || !selectedNodeId) return
    const node = providers.find((p) => p.id === selectedNodeId)
    if (!node) { message.error('节点不存在'); return }
    if (!consumeProviderUsage(node.id)) { message.error('该节点今日额度已用完'); return }

    const cleanNode: CleanNode = {
      id: node.id, name: node.name, baseURL: node.baseURL, apiKey: node.apiKey || undefined,
      model: node.model, maxConcurrency: 1, batchChars: 999999, intervalSec: 0,
    }

    const ac = new AbortController()
    cleanAbortRef.current = ac
    setCleanPhase('streaming')
    setLiveAcc('')
    setCleanError(null)
    setCleanedContent(null)
    setLineDecisions({})

    const cb: CleanQueueCallbacks = {
      onStart: () => {},
      onChunk: (_id, acc) => setLiveAcc(acc),
      onDone: (_id, cleaned) => {
        setCleanedContent(cleaned)
        setCleanPhase('review')
        setLiveAcc('')
      },
      onError: () => {},
      onFinish: () => {},
    }

    try {
      await streamSingleChapter(cleanNode, cleanChapter.content, cleanChapter.id, cb, ac.signal, m1SystemPrompt || undefined)
    } catch (e) {
      if (ac.signal.aborted) return
      setCleanPhase('error')
      setCleanError(e instanceof Error ? e.message : String(e))
    }
  }

  const cancelClean = () => {
    cleanAbortRef.current?.abort()
    setCleanPhase('selecting')
    setLiveAcc('')
  }

  const acceptClean = () => {
    if (!cleanChapter || !cleanedContent) return
    const rows = alignedDiff(cleanChapter.content, cleanedContent)
    const finalText = applyLineDecisions(rows, lineDecisions)
    updateChapter(cleanChapter.id, { content: finalText, updatedAt: new Date().toISOString() })
    pushStoreNow()
    message.success('已接受清理结果')
    exitCleanMode()
  }

  const rejectClean = () => {
    exitCleanMode()
  }

  const retryClean = () => {
    setCleanPhase('selecting')
    setCleanedContent(null)
    setLiveAcc('')
    setLineDecisions({})
    setCleanError(null)
    setSelectedNodeId(null)
  }

  const onLineDecide = (idx: number, decision: LineDecision | null) => {
    setLineDecisions((prev) => {
      if (decision === null) {
        const next = { ...prev }
        delete next[idx]
        return next
      }
      return { ...prev, [idx]: decision }
    })
  }

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingContent !== null || titleDraft) return
      if (e.key === 'Escape') {
        if (readerMode === 'clean') {
          if (cleanPhase === 'streaming') {
            cleanAbortRef.current?.abort()
            setCleanPhase('selecting')
            setLiveAcc('')
            setCleanError('已取消')
          } else {
            exitCleanMode()
          }
        } else if (leftPanel) {
          setLeftPanel(null)
        } else {
          onExit()
        }
      } else if (e.key === 'ArrowLeft' && readerMode === 'read') goPrev()
      else if (e.key === 'ArrowRight' && readerMode === 'read') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingContent, titleDraft, leftPanel, onExit, goPrev, goNext, readerMode, cleanPhase, exitCleanMode])

  // ── Content rendering ──
  const contentBody = useMemo(() => {
    if (!current) return null
    const textBody = findOpen && findRegex ? (
      <div className="immersive-text-para">
        {current.content.split('\n').map((p, i) => {
          const parts = highlightParts(p, findRegex)
          return (
            <p key={i} data-para-idx={i}>
              {parts.map((pt, j) =>
                pt.hl ? <mark key={j} className="imm-find-hl">{pt.text}</mark> : pt.text,
              )}
            </p>
          )
        })}
      </div>
    ) : (
      <div className="immersive-text">{current.content}</div>
    )

    return (
      <div className="immersive-content-inner" style={{ fontSize, lineHeight: 1.85 }}>
        <h1 className="immersive-title">{current.title}</h1>
        {textBody}
      </div>
    )
  }, [current, fontSize, findOpen, findRegex])

  // ── Content body for reading vs clean mode ──
  const readingContent = (
    <div ref={contentRef} className="immersive-content">
      {contentBody}
    </div>
  )

  const cleanContent = cleanChapter ? (
    <div className="imm-clean-wrapper">
      <div className="imm-dual-pane">
        <div className="imm-clean-left">
          <div className="imm-clean-pane-head">原文</div>
          <div className="imm-clean-pane-body">
            <div style={{ whiteSpace: 'pre-wrap', fontSize: Math.max(13, fontSize - 2), lineHeight: 1.6 }}>
              {cleanChapter.content}
            </div>
          </div>
        </div>
        <div className="imm-clean-right">
          <div className="imm-clean-pane-head">审阅后</div>
          <div className="imm-clean-pane-body">
            {cleanPhase === 'streaming' && (
              <div className="imm-clean-stream">
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: Math.max(13, fontSize - 2), lineHeight: 1.6, margin: 0 }}>
                  {liveAcc || '等待响应…'}
                </pre>
              </div>
            )}
            {cleanPhase === 'review' && cleanedContent && (
              <DiffView
                original={cleanChapter.content}
                cleaned={cleanedContent}
                decisions={lineDecisions}
                onDecide={onLineDecide}
                autoScrollToFirstDiff
              />
            )}
            {cleanPhase === 'error' && (
              <div style={{ padding: 24, color: 'var(--imm-muted)', textAlign: 'center' }}>
                <div style={{ marginBottom: 12, color: '#ff4d4f' }}>清理失败：{cleanError || '未知错误'}</div>
                <Button size="small" icon={<ReloadOutlined />} onClick={retryClean}>重选节点</Button>
              </div>
            )}
            {cleanPhase === 'selecting' && (
              <div style={{ padding: 24, color: 'var(--imm-muted)', textAlign: 'center' }}>
                请在左侧面板选择清理节点
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null

  // ── Left panel override for clean mode ──
  const effectiveLeftPanel = readerMode === 'clean' ? 'chapters' : leftPanel

  // ── Find result pagination ──
  const findWindowEnd = Math.min(findWindowStart + PAGE_SIZE, findResults.length)
  const findPage = findResults.slice(findWindowStart, findWindowEnd)

  const popClass = `imm-pop imm-pop-${theme}`

  return (
    <div ref={readerRef} className={`immersive-reader theme-${theme}${readerMode === 'clean' ? ' imm-clean-active' : ''}`}>
      {/* 预读取隐藏层 */}
      <div className="immersive-preload" aria-hidden style={{ fontSize }}>
        {prevChapter && <div className="immersive-text">{prevChapter.content}</div>}
        {nextChapter && <div className="immersive-text">{nextChapter.content}</div>}
      </div>

      {/* 正文区：阅读模式 / 清理对比模式 */}
      {readerMode === 'clean' ? cleanContent : readingContent}

      {/* 编辑正文浮层 */}
      {editingContent !== null && (
        <div className="imm-edit-overlay">
          <div className="imm-edit-head">
            <span className="imm-edit-title">编辑正文 · {current?.title}</span>
            <span style={{ flex: 1 }} />
            <Button type="primary" icon={<CheckOutlined />} onClick={saveContent}>保存</Button>
            <Button onClick={() => setEditingContent(null)}>取消</Button>
          </div>
          <Input.TextArea
            className="imm-edit-textarea"
            value={editingContent}
            onChange={(e) => setEditingContent(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {/* 左侧滑出面板 */}
      {effectiveLeftPanel && (
        <>
          {readerMode !== 'clean' && <div className="imm-panel-backdrop" onClick={() => setLeftPanel(null)} />}
          <div className="imm-panel">
            <div className="imm-panel-head">
              <span className="imm-panel-title">
                {readerMode === 'clean'
                  ? `AI 清理 · ${cleanChapter?.title ?? ''}`
                  : leftPanel === 'chapters'
                    ? `章节列表（${chapters.length}）`
                    : `书签（${bookmarks.length}）`}
              </span>
              {readerMode !== 'clean' && leftPanel === 'bookmarks' && (
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={addBookmark}>添加当前位置</Button>
              )}
              {readerMode !== 'clean' && (
                <Button size="small" type="text" icon={<CloseOutlined />} className="imm-panel-close" onClick={() => setLeftPanel(null)} />
              )}
            </div>

            <div className="imm-panel-body">
              {/* Clean mode panel content */}
              {readerMode === 'clean' && (
                <div className="imm-clean-panel">
                  {/* Review phase: accept/reject controls */}
                  {cleanPhase === 'review' && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--imm-border)' }}>
                      <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--imm-muted)' }}>
                        审阅下方对比结果，逐行决定接受或拒绝。
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button type="primary" icon={<CheckOutlined />} onClick={acceptClean}>接受</Button>
                        <Button danger icon={<CloseOutlined />} onClick={rejectClean}>拒绝</Button>
                        <Button icon={<ReloadOutlined />} onClick={retryClean}>重新清理</Button>
                      </div>
                    </div>
                  )}

                  {/* Streaming phase: progress */}
                  {cleanPhase === 'streaming' && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--imm-border)' }}>
                      <div style={{ fontSize: 13, color: 'var(--imm-accent)', marginBottom: 8 }}>
                        正在清理…{liveAcc ? `（已收到 ${liveAcc.length} 字符）` : ''}
                      </div>
                      <Button size="small" danger icon={<StopOutlined />} onClick={cancelClean}>取消</Button>
                    </div>
                  )}

                  {/* Error phase */}
                  {cleanPhase === 'error' && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--imm-border)' }}>
                      <div style={{ fontSize: 13, color: '#ff4d4f', marginBottom: 8 }}>
                        {cleanError || '清理失败，请重试'}
                      </div>
                      <Button size="small" icon={<ReloadOutlined />} onClick={retryClean}>重选节点</Button>
                    </div>
                  )}

                  {/* Node list (selecting / streaming / error) */}
                  {(cleanPhase === 'selecting' || cleanPhase === 'streaming' || cleanPhase === 'error') && (
                    <div style={{ padding: '8px 0' }}>
                      <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--imm-muted)', marginBottom: 4 }}>
                        选择清理节点：
                      </div>
                      {providers.filter((p) => p.enabled).map((node) => {
                        const disabled = cleanPhase !== 'selecting'
                        const active = selectedNodeId === node.id
                        return (
                          <div
                            key={node.id}
                            className={`imm-node-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
                            onClick={() => {
                              if (disabled) return
                              setSelectedNodeId(node.id)
                              startClean()
                            }}
                          >
                            <span className="imm-node-name">{node.name}</span>
                            <span className="imm-node-model">{node.model}</span>
                          </div>
                        )
                      })}
                      {providers.filter((p) => p.enabled).length === 0 && (
                        <div style={{ padding: 16, color: 'var(--imm-muted)', fontSize: 13, textAlign: 'center' }}>
                          暂无已启用的 Provider 节点。<br />请先在设置中配置并测试。
                        </div>
                      )}
                    </div>
                  )}

                  {/* Back to reading */}
                  <div style={{ padding: '12px 16px', borderTop: '1px solid var(--imm-border)' }}>
                    <Button size="small" type="text" icon={<CloseOutlined />} onClick={exitCleanMode} block>
                      退出清理模式
                    </Button>
                  </div>
                </div>
              )}

              {/* Normal chapters list */}
              {readerMode !== 'clean' && leftPanel === 'chapters' &&
                chapters.map((c, i) => {
                  const editing = titleDraft?.id === c.id
                  const active = c.id === currentId
                  return (
                    <div
                      key={c.id}
                      className={`imm-chapter-item${active ? ' active' : ''}`}
                      onClick={() => {
                        if (editing) return
                        goToChapter(c.id)
                        setLeftPanel(null)
                      }}
                    >
                      {editing ? (
                        <div className="imm-title-edit" onClick={(e) => e.stopPropagation()}>
                          <Input
                            size="small"
                            value={titleDraft!.title}
                            autoFocus
                            onChange={(e) => setTitleDraft({ id: c.id, title: e.target.value })}
                            onPressEnter={saveTitle}
                          />
                          <Button size="small" type="primary" onClick={saveTitle}>存</Button>
                          <Button size="small" onClick={() => setTitleDraft(null)}>消</Button>
                        </div>
                      ) : (
                        <>
                          <span className="imm-chapter-idx">{i + 1}</span>
                          <span className="imm-chapter-name">{c.title}</span>
                          <span className="imm-chapter-len">{c.content.length} 字</span>
                          <Button
                            size="small"
                            type="text"
                            className="imm-chapter-edit"
                            icon={<EditOutlined />}
                            onClick={(e) => {
                              e.stopPropagation()
                              setTitleDraft({ id: c.id, title: c.title })
                            }}
                          />
                          <Tooltip title="AI 清理本章">
                            <Button
                              size="small"
                              type="text"
                              className="imm-chapter-clean"
                              icon={<ThunderboltOutlined />}
                              onClick={(e) => {
                                e.stopPropagation()
                                enterCleanMode(c.id)
                              }}
                            />
                          </Tooltip>
                        </>
                      )}
                    </div>
                  )
                })}

              {/* Normal bookmarks list */}
              {readerMode !== 'clean' && leftPanel === 'bookmarks' &&
                (bookmarks.length === 0 ? (
                  <div className="imm-empty">暂无书签，点上方「添加当前位置」</div>
                ) : (
                  bookmarks.map((bm) => (
                    <div key={bm.id} className="imm-bm-item" onClick={() => jumpToBookmark(bm)}>
                      <div className="imm-bm-main">
                        <div className="imm-bm-name">{bm.chapterTitle}</div>
                        <div className="imm-bm-meta">
                          {bm.progress}% · {bm.createdAt.slice(5, 16).replace('T', ' ')}
                        </div>
                      </div>
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => { e.stopPropagation(); deleteBookmark(bm.id) }}
                      />
                    </div>
                  ))
                ))}
            </div>
          </div>
        </>
      )}

      {/* 查找替换面板 */}
      {findOpen && (
        <div className="imm-find-panel">
          <div className="imm-find-row">
            <Input
              className="imm-find-input"
              placeholder={useRegex ? '正则表达式 · 例如：第[一二三四五六七八九十]章' : '查找文本'}
              value={findText}
              onChange={(e) => { setFindText(e.target.value); setFindWindowStart(0) }}
              allowClear
              autoFocus
              prefix={<SearchOutlined style={{ color: 'var(--imm-muted)' }} />}
            />
            <Tooltip title="区分大小写">
              <Button
                size="small"
                type={caseSensitive ? 'primary' : 'text'}
                className="imm-find-opt"
                onClick={() => { setCaseSensitive((v) => !v); setFindWindowStart(0) }}
              >Aa</Button>
            </Tooltip>
            <Tooltip title="正则表达式模式">
              <Button
                size="small"
                type={useRegex ? 'primary' : 'text'}
                className="imm-find-opt"
                onClick={() => { setUseRegex((v) => !v); setFindWindowStart(0) }}
              >.*</Button>
            </Tooltip>
            <span className="imm-find-stat">
              {findRegex
                ? `匹配 ${findResults.length} 处 / ${new Set(findResults.map((r) => r.chapterId)).size} 章`
                : findText.trim() ? '正则无效' : '输入以开始查找'}
            </span>
          </div>

          <div className="imm-find-row">
            <Input
              className="imm-find-input"
              placeholder={useRegex ? '替换文本 · 支持 $1/$2 捕获组' : '替换为'}
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              allowClear
            />
            <Tooltip title={replaceMode === 'preview' ? '预览模式：仅显示替换结果' : '实际修改：写入文本'}>
              <Button
                size="small"
                type={replaceMode === 'apply' ? 'primary' : 'text'}
                className="imm-find-opt"
                onClick={() => setReplaceMode((m) => (m === 'preview' ? 'apply' : 'preview'))}
              >
                {replaceMode === 'preview' ? '预览' : '修改'}
              </Button>
            </Tooltip>
            {replaceMode === 'apply' && findRegex && replaceText && findResults.length > 0 && (
              <Button size="small" type="primary" onClick={doReplaceAll}>全部替换</Button>
            )}
          </div>

          {findResults.length > 0 && (
            <>
              <div className="imm-find-list-head">
                <span>
                  第 {findWindowStart + 1}–{findWindowEnd} 条 / 共 {findResults.length} 条
                </span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <Button size="small" disabled={findWindowStart === 0} onClick={() => setFindWindowStart((w) => Math.max(0, w - PAGE_SIZE))}>上一批</Button>
                  <Button size="small" disabled={findWindowEnd >= findResults.length} onClick={() => setFindWindowStart((w) => w + PAGE_SIZE)}>下一批</Button>
                </span>
              </div>
              <div
                className="imm-find-list"
                onScroll={(e) => {
                  const el = e.currentTarget
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30 && findWindowEnd < findResults.length) {
                    setFindWindowStart((w) => w + PAGE_SIZE)
                  }
                }}
              >
                {findPage.map((r, fi) => {
                  const displayText = replaceMode === 'preview' && findRegex && replaceText
                    ? r.paraText.replace(findRegex, replaceText)
                    : r.paraText
                  const parts = replaceMode === 'preview'
                    ? highlightParts(displayText, null) // no highlight in preview mode
                    : highlightParts(r.paraText, findRegex)
                  return (
                    <div
                      key={`${findWindowStart + fi}`}
                      className="imm-find-item"
                      onClick={() => jumpToFindResult(r)}
                    >
                      <div className="imm-find-item-head">
                        <Tag>{r.chapterTitle}</Tag>
                        <span className="imm-find-item-idx">段 {r.paraIdx + 1}</span>
                        {replaceMode === 'preview' && findRegex && replaceText && (
                          <Tag color="purple">预览</Tag>
                        )}
                      </div>
                      <div className="imm-find-item-text">
                        {parts.map((p, j) =>
                          p.hl ? <mark key={j} className="imm-find-hl">{p.text}</mark> : p.text,
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* 底部控制栏 */}
      <div className={`immersive-controls${showControls ? ' visible' : ''}`}>
        {readerMode === 'read' && (
          <div className="immersive-progress-bar" onClick={seek}>
            <div className="immersive-progress-fill" style={{ width: `${progress}%` }} />
            <div className="immersive-progress-label">
              {currentIndex + 1}/{chapters.length} · {progress}%
            </div>
          </div>
        )}

        <div className="immersive-toolbar">
          <div className="toolbar-section">
            <Tooltip title="返回书库">
              <Button type="text" className="toolbar-btn" icon={<ArrowLeftOutlined />} onClick={onExit} />
            </Tooltip>
            {readerMode === 'clean' ? (
              <Tooltip title="清理控制面板">
                <Button type="text" className="toolbar-btn" icon={<ThunderboltOutlined />}>
                  清理中
                </Button>
              </Tooltip>
            ) : (
              <Button
                type="text"
                className="toolbar-btn"
                icon={<UnorderedListOutlined />}
                onClick={() => setLeftPanel((p) => (p === 'chapters' ? null : 'chapters'))}
              >
                章节
              </Button>
            )}
            {readerMode === 'read' && (
              <>
                <Tooltip title="上一章">
                  <Button type="text" className="toolbar-btn" icon={<LeftOutlined />} disabled={currentIndex <= 0} onClick={goPrev} />
                </Tooltip>
                <Tooltip title="下一章">
                  <Button type="text" className="toolbar-btn" icon={<RightOutlined />} disabled={currentIndex >= chapters.length - 1} onClick={goNext} />
                </Tooltip>
              </>
            )}
          </div>

          {readerMode === 'read' && (
            <div className="toolbar-section">
              <Popover
                trigger="click"
                placement="top"
                rootClassName={popClass}
                open={fontOpen}
                onOpenChange={setFontOpen}
                content={
                  <div className="imm-slider-pop">
                    <div className="imm-slider-label">字体大小 {fontSize}px</div>
                    <Slider min={14} max={40} value={fontSize} onChange={setFontSize} style={{ width: 220 }} />
                  </div>
                }
              >
                <Button type="text" className="toolbar-btn" icon={<FontSizeOutlined />}>字体</Button>
              </Popover>
              <Popover
                trigger="hover"
                placement="top"
                rootClassName={popClass}
                onOpenChange={setPlayOpen}
                content={
                  <div className="imm-slider-pop">
                    <div className="imm-slider-label">翻页速度 {playSpeed}</div>
                    <Slider min={1} max={10} value={playSpeed} onChange={setPlaySpeed} style={{ width: 200 }} />
                  </div>
                }
              >
                <Button
                  type="text"
                  className={`toolbar-btn${isAutoPlaying ? ' on' : ''}`}
                  icon={isAutoPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={toggleAutoPlay}
                >自动播放</Button>
              </Popover>
              <Popover
                trigger="hover"
                placement="top"
                rootClassName={popClass}
                onOpenChange={setSpeedOpen}
                content={
                  <div className="imm-slider-pop">
                    <div className="imm-slider-label">滚动速度 {scrollSpeed}</div>
                    <Slider min={1} max={10} value={scrollSpeed} onChange={setScrollSpeed} style={{ width: 200 }} />
                  </div>
                }
              >
                <Button
                  type="text"
                  className={`toolbar-btn${isAutoScrolling ? ' on' : ''}`}
                  icon={isAutoScrolling ? <PauseOutlined /> : <VerticalAlignBottomOutlined />}
                  onClick={toggleAutoScroll}
                >自动翻页</Button>
              </Popover>
              <Tooltip title="语音朗读（即将上线）">
                <Button type="text" className="toolbar-btn" icon={<SoundOutlined />} disabled>TTS</Button>
              </Tooltip>
              <Button type="text" className="toolbar-btn" icon={<EditOutlined />} onClick={startEditContent}>编辑正文</Button>
              <Tooltip title="查找替换">
                <Button
                  type="text"
                  className={`toolbar-btn${findOpen ? ' on' : ''}`}
                  icon={<SearchOutlined />}
                  onClick={() => { setFindOpen((v) => !v); if (!findOpen) { setFindText(''); setReplaceText(''); setFindWindowStart(0) } }}
                >查找</Button>
              </Tooltip>
            </div>
          )}

          <div className="toolbar-section">
            {readerMode === 'read' && (
              <Button
                type="text"
                className="toolbar-btn"
                icon={<BookOutlined />}
                onClick={() => setLeftPanel((p) => (p === 'bookmarks' ? null : 'bookmarks'))}
              >书签</Button>
            )}
            <Tooltip title={theme === 'dark' ? '切换浅色' : '切换深色'}>
              <Button
                type="text"
                className="toolbar-btn"
                icon={theme === 'dark' ? <BulbOutlined /> : <BulbFilled />}
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              />
            </Tooltip>
            <Tooltip title="退出阅读（Esc）">
              <Button type="text" className="toolbar-btn" icon={<CloseOutlined />} onClick={onExit} />
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}
