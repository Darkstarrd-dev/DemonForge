// 沉浸式阅读器 · 主组件（重构自 1023 行巨组件）。
// 状态分层：
//   - 编排级：fontSize/theme/scrollSpeed/playSpeed/findOpen/findMode/cleanChapterId 等 UI 状态
//   - 导航级：useBookNavigation（currentId/progress/auto-play/auto-scroll/键盘）
//   - 内容渲染：panels/ReaderContent、panels/AiCleanPanel、panels/SearchReplacePanel
// 持久化：fontSize/theme/scrollSpeed/playSpeed/bookmarks 经 localStorage。
import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Input, Popover, Slider, Tooltip } from 'antd'
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
  CheckOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useAppStore, pushStoreNow } from '../../store/appStore'
import type { Chapter, LineDecision, ResolvedProviderNode } from '../../services/types'
import { alignedDiff, applyLineDecisions } from '../../utils/alignedDiff'
import { streamSingleChapter, type CleanNode, type CleanQueueCallbacks } from '../../services/api'
import { resolveProviderNode, resolveProviderNodes } from '../../utils/providerResolver'
import { useBookNavigation, type ReaderMode } from './hooks/useBookNavigation'
import ReaderContent from './panels/ReaderContent'
import AiCleanPanel, { type CleanPhase } from './panels/AiCleanPanel'
import SearchReplacePanel, { type ReplaceMode } from './panels/SearchReplacePanel'
import LeftSlidePanel, { type Bookmark, type LeftPanel } from './panels/LeftSlidePanel'
import { buildFindRegex, buildFindResults, type FindResult } from './panels/searchUtils'
import './ImmersiveReader.css'

/** 单章清理适配：ResolvedProviderNode 的字段已满足 SchedulableNode，只需覆写单章特化参数 */
function toSingleNodeClean(node: ResolvedProviderNode): CleanNode {
  return {
    id: node.id,
    name: node.name,
    baseURL: node.baseURL,
    apiKey: node.apiKey || undefined,
    model: node.model,
    maxConcurrency: 1,
    batchChars: 999999,
    intervalSec: 0,
  }
}

interface ImmersiveReaderProps {
  chapters: Chapter[]
  initialChapterId: string
  bookId: string
  onExit: () => void
}

type ReaderTheme = 'light' | 'dark'

export default function ImmersiveReader({ chapters, initialChapterId, bookId, onExit }: ImmersiveReaderProps) {
  const { message } = App.useApp()
  const updateChapter = useAppStore((s) => s.updateChapter)
  const globalTheme = useAppStore((s) => s.theme)
  const providers = useAppStore((s) => s.providers)
  const providerNodes = useAppStore((s) => s.providerNodes)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const consumeProviderUsage = useAppStore((s) => s.consumeProviderUsage)
  const resolvedNodes = useMemo(
    () => resolveProviderNodes({ providers, providerNodes }),
    [providers, providerNodes],
  )

  // ── Reading UI 状态 ──
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
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(null)
  const [fontOpen, setFontOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [playOpen, setPlayOpen] = useState(false)
  const [editingContent, setEditingContent] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState<{ id: string; title: string } | null>(null)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`imm-bm-${bookId}`) || '[]')
    } catch {
      return []
    }
  })

  // ── Find/Replace 状态 ──
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [replaceMode, setReplaceMode] = useState<ReplaceMode>('preview')
  const [findWindowStart, setFindWindowStart] = useState(0)

  // ── Single-chapter AI Clean 状态 ──
  const [cleanChapterId, setCleanChapterId] = useState<string | null>(null)
  const [cleanPhase, setCleanPhase] = useState<CleanPhase>('selecting')
  const [cleanedContent, setCleanedContent] = useState<string | null>(null)
  const [liveAcc, setLiveAcc] = useState('')
  const [lineDecisions, setLineDecisions] = useState<Record<number, LineDecision>>({})
  const [cleanError, setCleanError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const cleanAbortRef = useRef<AbortController | null>(null)

  // ── 派生 ──
  const cleanChapter = cleanChapterId ? (chapters.find((c) => c.id === cleanChapterId) ?? null) : null
  const readerMode: ReaderMode = cleanChapterId ? 'clean' : 'read'

  // ── 持久化效果 ──
  useEffect(() => void localStorage.setItem('imm-font-size', String(fontSize)), [fontSize])
  useEffect(() => void localStorage.setItem('imm-theme', theme), [theme])
  useEffect(() => void localStorage.setItem('imm-scroll-speed', String(scrollSpeed)), [scrollSpeed])
  useEffect(() => void localStorage.setItem('imm-play-speed', String(playSpeed)), [playSpeed])
  useEffect(() => {
    localStorage.setItem(`imm-bm-${bookId}`, JSON.stringify(bookmarks))
  }, [bookmarks, bookId])

  // ── 键盘 Esc 行为桥接：监听 useBookNavigation 派发的 imm-escape 事件 ──
  useEffect(() => {
    const onEsc = () => setLeftPanel(null)
    window.addEventListener('imm-escape', onEsc)
    return () => window.removeEventListener('imm-escape', onEsc)
  }, [])

  // ── 导航 hook ──
  const {
    currentId,
    goToChapter,
    goPrev,
    goNext,
    progress,
    contentRef,
    pendingProgressRef,
    pendingParaRef,
    isAutoPlaying,
    setIsAutoPlaying,
    isAutoScrolling,
    setIsAutoScrolling,
  } = useBookNavigation({
    chapters,
    initialChapterId,
    mode: readerMode,
    isCleanStreaming: cleanPhase === 'streaming',
    playSpeed,
    scrollSpeed,
    onExit,
    onCancelClean: () => {
      cleanAbortRef.current?.abort()
      setCleanPhase('selecting')
      setLiveAcc('')
    },
    onCloseLeftPanel: () => setLeftPanel(null),
    isBlocked: editingContent !== null || titleDraft !== null,
  })

  const current = (chapters.find((c) => c.id === currentId) ?? null) as Chapter | null
  const currentIndex = chapters.findIndex((c) => c.id === currentId)
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null
  const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null

  // ── Find regex（保留在主组件，因为 SearchReplacePanel 内部也算一份，外部用同一份做 jump）──
  const findRegex = useMemo(
    () => (findText.trim() ? buildFindRegex(findText, useRegex, caseSensitive) : null),
    [findText, useRegex, caseSensitive],
  )

  // ── 书签 ──
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
      goToChapter(bm.chapterId)
    }
    setLeftPanel(null)
  }

  // ── 编辑正文/标题 ──
  const startEditContent = () => current && setEditingContent(current.content)
  const saveContent = () => {
    if (!current || editingContent === null) return
    updateChapter(current.id, { content: editingContent, updatedAt: new Date().toISOString() })
    pushStoreNow()
    setEditingContent(null)
    message.success('正文已保存')
  }
  const saveTitle = () => {
    if (!titleDraft) return
    updateChapter(titleDraft.id, { title: titleDraft.title })
    pushStoreNow()
    setTitleDraft(null)
    message.success('章节标题已保存')
  }

  // ── 查找替换跳转 ──
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
    const chapterIds = [...new Set(buildFindResults(chapters, findRegex).map((r) => r.chapterId))]
    for (const chId of chapterIds) {
      const ch = chapters.find((c) => c.id === chId)
      if (!ch) continue
      updateChapter(chId, { content: ch.content.replace(findRegex, replaceText), updatedAt: new Date().toISOString() })
    }
    pushStoreNow()
    message.success(`已替换 ${chapterIds.length} 个章节中的匹配项`)
  }

  // ── AI 清理入口 ──
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
  const exitCleanMode = () => {
    cleanAbortRef.current?.abort()
    setCleanChapterId(null)
    setLeftPanel(null)
  }
  const startClean = async () => {
    if (!cleanChapter || !selectedNodeId) return
    const node = resolveProviderNode(
      { providers: useAppStore.getState().providers, providerNodes: useAppStore.getState().providerNodes },
      selectedNodeId,
    )
    if (!node) {
      message.error('节点不存在')
      return
    }
    if (!consumeProviderUsage(node.id)) {
      message.error('该节点今日额度已用完')
      return
    }
    const cleanNode = toSingleNodeClean(node)
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

  // ── 进度条 seek ──
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = contentRef.current
    if (!el) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
    setIsAutoPlaying(false)
    setIsAutoScrolling(false)
  }

  // ── Toolbar visibility ──
  const [hovering, setHovering] = useState(false)
  useEffect(() => {
    const onMove = (e: MouseEvent) => setHovering(e.clientY > window.innerHeight - 170)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  const pinned = leftPanel !== null || fontOpen || speedOpen || playOpen || findOpen || readerMode === 'clean'
  const showControls = hovering || pinned
  const popClass = `imm-pop imm-pop-${theme}`

  return (
    <div className={`immersive-reader theme-${theme}${readerMode === 'clean' ? ' imm-clean-active' : ''}`}>
      {/* 预读取隐藏层 */}
      <div className="immersive-preload" aria-hidden style={{ fontSize }}>
        {prevChapter && <div className="immersive-text">{prevChapter.content}</div>}
        {nextChapter && <div className="immersive-text">{nextChapter.content}</div>}
      </div>

      {/* 正文区 */}
      {readerMode === 'clean' ? (
        <AiCleanPanel
          cleanChapter={cleanChapter}
          cleanPhase={cleanPhase}
          cleanedContent={cleanedContent}
          liveAcc={liveAcc}
          fontSize={fontSize}
          lineDecisions={lineDecisions}
          onLineDecide={onLineDecide}
          cleanError={cleanError}
          onRetry={retryClean}
        />
      ) : (
        <ReaderContent current={current} fontSize={fontSize} findOpen={findOpen} findRegex={findRegex} ref={contentRef} />
      )}

      {/* 编辑正文浮层 */}
      {editingContent !== null && (
        <div className="imm-edit-overlay">
          <div className="imm-edit-head">
            <span className="imm-edit-title">编辑正文 · {current?.title}</span>
            <span style={{ flex: 1 }} />
            <Button type="primary" icon={<CheckOutlined />} onClick={saveContent}>
              保存
            </Button>
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
      {leftPanel && (
        <LeftSlidePanel
          mode={readerMode}
          panel={leftPanel}
          onClose={() => setLeftPanel(null)}
          cleanChapter={cleanChapter}
          cleanPhase={cleanPhase}
          liveAcc={liveAcc}
          cleanError={cleanError}
          resolvedNodes={resolvedNodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={(id) => {
            setSelectedNodeId(id)
            startClean()
          }}
          onAccept={acceptClean}
          onReject={rejectClean}
          onRetry={retryClean}
          onCancel={cancelClean}
          onExitClean={exitCleanMode}
          chapters={chapters}
          currentId={currentId}
          titleDraft={titleDraft}
          onTitleDraftChange={setTitleDraft}
          onSaveTitle={saveTitle}
          onGoToChapter={(id) => {
            goToChapter(id)
            setLeftPanel(null)
          }}
          onEnterClean={enterCleanMode}
          bookmarks={bookmarks}
          onAddBookmark={addBookmark}
          onDeleteBookmark={deleteBookmark}
          onJumpBookmark={jumpToBookmark}
        />
      )}

      {/* 查找替换面板 */}
      {findOpen && (
        <SearchReplacePanel
          chapters={chapters}
          findText={findText}
          setFindText={setFindText}
          replaceText={replaceText}
          setReplaceText={setReplaceText}
          useRegex={useRegex}
          setUseRegex={setUseRegex}
          caseSensitive={caseSensitive}
          setCaseSensitive={setCaseSensitive}
          replaceMode={replaceMode}
          setReplaceMode={setReplaceMode}
          onJumpToResult={jumpToFindResult}
          onApplyAll={doReplaceAll}
          findWindowStart={findWindowStart}
          setFindWindowStart={setFindWindowStart}
        />
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
                  <Button
                    type="text"
                    className="toolbar-btn"
                    icon={<LeftOutlined />}
                    disabled={currentIndex <= 0}
                    onClick={goPrev}
                  />
                </Tooltip>
                <Tooltip title="下一章">
                  <Button
                    type="text"
                    className="toolbar-btn"
                    icon={<RightOutlined />}
                    disabled={currentIndex >= chapters.length - 1}
                    onClick={goNext}
                  />
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
                <Button type="text" className="toolbar-btn" icon={<FontSizeOutlined />}>
                  字体
                </Button>
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
                  onClick={() => {
                    setIsAutoPlaying((v) => !v)
                    setIsAutoScrolling(false)
                  }}
                >
                  自动播放
                </Button>
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
                  onClick={() => {
                    setIsAutoScrolling((v) => !v)
                    setIsAutoPlaying(false)
                  }}
                >
                  自动翻页
                </Button>
              </Popover>
              <Tooltip title="语音朗读（即将上线）">
                <Button type="text" className="toolbar-btn" icon={<SoundOutlined />} disabled>
                  TTS
                </Button>
              </Tooltip>
              <Button type="text" className="toolbar-btn" icon={<EditOutlined />} onClick={startEditContent}>
                编辑正文
              </Button>
              <Tooltip title="查找替换">
                <Button
                  type="text"
                  className={`toolbar-btn${findOpen ? ' on' : ''}`}
                  icon={<SearchOutlined />}
                  onClick={() => {
                    setFindOpen((v) => !v)
                    if (!findOpen) {
                      setFindText('')
                      setReplaceText('')
                      setFindWindowStart(0)
                    }
                  }}
                >
                  查找
                </Button>
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
              >
                书签
              </Button>
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
