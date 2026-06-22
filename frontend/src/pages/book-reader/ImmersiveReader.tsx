import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
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
  DeleteOutlined,
  PlusOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { useAppStore, pushStoreNow } from '../../store/appStore'
import type { Chapter } from '../../services/types'
import './ImmersiveReader.css'

interface Bookmark {
  id: string
  chapterId: string
  chapterTitle: string
  progress: number // 0-100
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

/**
 * 沉浸式全屏阅读器
 *
 * 交互总览：
 *  - 全屏黑/浅底正文，鼠标移到屏幕底部浮现进度条 + 工具栏
 *  - 工具栏：返回书库 / 章节列表(左侧抽屉) / 上下章(预读取) / 字体(滑条) /
 *            自动播放(逐屏) / 自动翻页(连续滚动+调速) / TTS(占位) / 编辑正文 /
 *            书签(左侧抽屉,可增删) / 主题切换 / 退出
 *  - 章节与书签均从左侧滑出面板；章节面板内可改章节名
 *
 * 写入复用 store：updateChapter + pushStoreNow（与原 book-reader 一致）。
 */
export default function ImmersiveReader({
  chapters,
  initialChapterId,
  bookId,
  onExit,
}: ImmersiveReaderProps) {
  const { message } = App.useApp()
  const updateChapter = useAppStore((s) => s.updateChapter)
  const globalTheme = useAppStore((s) => s.theme)

  const readerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // 章节跳转后要恢复到的进度（书签跳转用）；null 表示回到顶部
  const pendingProgressRef = useRef<number | null>(null)
  const scrollAccRef = useRef(0) // 连续滚动的小数像素累加

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

  const [progress, setProgress] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(null)
  const [fontOpen, setFontOpen] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)

  const [isAutoPlaying, setIsAutoPlaying] = useState(false) // 逐屏翻页
  const [isAutoScrolling, setIsAutoScrolling] = useState(false) // 连续滚动

  const [editingContent, setEditingContent] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState<{ id: string; title: string } | null>(null)

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`imm-bm-${bookId}`) || '[]')
    } catch {
      return []
    }
  })

  const currentIndex = chapters.findIndex((c) => c.id === currentId)
  const current = chapters[currentIndex] ?? chapters[0] ?? null
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null
  const nextChapter =
    currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null

  // ---- 持久化 ----
  useEffect(() => void localStorage.setItem('imm-font-size', String(fontSize)), [fontSize])
  useEffect(() => void localStorage.setItem('imm-theme', theme), [theme])
  useEffect(() => void localStorage.setItem('imm-scroll-speed', String(scrollSpeed)), [scrollSpeed])
  useEffect(() => {
    localStorage.setItem(`imm-bm-${bookId}`, JSON.stringify(bookmarks))
  }, [bookmarks, bookId])

  // ---- 进度计算 ----
  const recalcProgress = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setProgress(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0)
  }, [])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    el.addEventListener('scroll', recalcProgress, { passive: true })
    return () => el.removeEventListener('scroll', recalcProgress)
  }, [recalcProgress])

  // ---- 切章后定位（顶部 / 书签进度），useLayoutEffect 避免闪烁 ----
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (pendingProgressRef.current != null) {
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = max > 0 ? (pendingProgressRef.current / 100) * max : 0
      pendingProgressRef.current = null
    } else {
      el.scrollTop = 0
    }
    recalcProgress()
  }, [currentId, recalcProgress])

  // ---- 章节切换 ----
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

  // ---- 自动播放（逐屏，每 3 秒翻一屏）----
  useEffect(() => {
    if (!isAutoPlaying) return
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
    }, 3000)
    return () => clearInterval(timer)
  }, [isAutoPlaying, currentIndex, chapters, goToChapter])

  // ---- 自动翻页（连续滚动，rAF）----
  useEffect(() => {
    if (!isAutoScrolling) return
    let raf = 0
    const pxPerFrame = scrollSpeed * 0.4
    const step = () => {
      const el = contentRef.current
      if (el) {
        const max = el.scrollHeight - el.clientHeight
        if (el.scrollTop >= max - 1) {
          if (currentIndex < chapters.length - 1) {
            goToChapter(chapters[currentIndex + 1].id, { keepAuto: true })
            return // 切章后本 effect 会重建，停止当前循环
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
  }, [isAutoScrolling, scrollSpeed, currentIndex, chapters, goToChapter])

  const toggleAutoPlay = () => {
    setIsAutoPlaying((v) => !v)
    setIsAutoScrolling(false)
  }
  const toggleAutoScroll = () => {
    setIsAutoScrolling((v) => !v)
    setIsAutoPlaying(false)
  }

  // ---- 工具栏显隐：靠近底部或有面板/弹层打开时显示 ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => setHovering(e.clientY > window.innerHeight - 170)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  const pinned = leftPanel !== null || fontOpen || speedOpen
  const showControls = hovering || pinned

  // ---- 键盘：Esc 退出 / 左右切章 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingContent !== null || titleDraft) return
      if (e.key === 'Escape') {
        if (leftPanel) setLeftPanel(null)
        else onExit()
      } else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingContent, titleDraft, leftPanel, onExit, goPrev, goNext])

  // ---- 进度条点击跳转 ----
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = contentRef.current
    if (!el) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
    setIsAutoPlaying(false)
    setIsAutoScrolling(false)
  }

  // ---- 书签 ----
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

  // ---- 编辑正文 ----
  const startEditContent = () => current && setEditingContent(current.content)
  const saveContent = () => {
    if (!current || editingContent === null) return
    updateChapter(current.id, { content: editingContent, updatedAt: new Date().toISOString() })
    pushStoreNow()
    setEditingContent(null)
    message.success('正文已保存')
  }

  // ---- 编辑章节名（在章节面板内）----
  const saveTitle = () => {
    if (!titleDraft) return
    updateChapter(titleDraft.id, { title: titleDraft.title })
    pushStoreNow()
    setTitleDraft(null)
    message.success('章节标题已保存')
  }

  // 正文渲染独立 memo：滚动驱动的 progress 变化不重排大段文字
  const contentBody = useMemo(
    () => (
      <div className="immersive-content-inner" style={{ fontSize, lineHeight: 1.85 }}>
        <h1 className="immersive-title">{current?.title}</h1>
        <div className="immersive-text">{current?.content}</div>
      </div>
    ),
    [current?.id, current?.title, current?.content, fontSize],
  )

  const popClass = `imm-pop imm-pop-${theme}`

  return (
    <div ref={readerRef} className={`immersive-reader theme-${theme}`}>
      {/* 预读取相邻章节：隐藏渲染，预热 CJK 字形/布局，切章近乎无延迟 */}
      <div className="immersive-preload" aria-hidden style={{ fontSize }}>
        {prevChapter && <div className="immersive-text">{prevChapter.content}</div>}
        {nextChapter && <div className="immersive-text">{nextChapter.content}</div>}
      </div>

      {/* 正文滚动区 */}
      <div ref={contentRef} className="immersive-content">
        {contentBody}
      </div>

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

      {/* 左侧滑出面板（章节 / 书签） */}
      {leftPanel && (
        <>
          <div className="imm-panel-backdrop" onClick={() => setLeftPanel(null)} />
          <div className="imm-panel">
            <div className="imm-panel-head">
              <span className="imm-panel-title">
                {leftPanel === 'chapters' ? `章节列表（${chapters.length}）` : `书签（${bookmarks.length}）`}
              </span>
              {leftPanel === 'bookmarks' && (
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={addBookmark}>
                  添加当前位置
                </Button>
              )}
              <Button
                size="small"
                type="text"
                icon={<CloseOutlined />}
                className="imm-panel-close"
                onClick={() => setLeftPanel(null)}
              />
            </div>

            <div className="imm-panel-body">
              {leftPanel === 'chapters' &&
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
                          <Button size="small" type="primary" onClick={saveTitle}>
                            存
                          </Button>
                          <Button size="small" onClick={() => setTitleDraft(null)}>
                            消
                          </Button>
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
                        </>
                      )}
                    </div>
                  )
                })}

              {leftPanel === 'bookmarks' &&
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
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteBookmark(bm.id)
                        }}
                      />
                    </div>
                  ))
                ))}
            </div>
          </div>
        </>
      )}

      {/* 底部控制栏 */}
      <div className={`immersive-controls${showControls ? ' visible' : ''}`}>
        <div className="immersive-progress-bar" onClick={seek}>
          <div className="immersive-progress-fill" style={{ width: `${progress}%` }} />
          <div className="immersive-progress-label">
            {currentIndex + 1}/{chapters.length} · {progress}%
          </div>
        </div>

        <div className="immersive-toolbar">
          {/* 左：返回 + 章节导航 */}
          <div className="toolbar-section">
            <Tooltip title="返回书库">
              <Button type="text" className="toolbar-btn" icon={<ArrowLeftOutlined />} onClick={onExit} />
            </Tooltip>
            <Button
              type="text"
              className="toolbar-btn"
              icon={<UnorderedListOutlined />}
              onClick={() => setLeftPanel((p) => (p === 'chapters' ? null : 'chapters'))}
            >
              章节
            </Button>
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
          </div>

          {/* 中：阅读功能 */}
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
                  <Slider
                    min={14}
                    max={40}
                    value={fontSize}
                    onChange={setFontSize}
                    style={{ width: 220 }}
                  />
                </div>
              }
            >
              <Button type="text" className="toolbar-btn" icon={<FontSizeOutlined />}>
                字体
              </Button>
            </Popover>

            <Tooltip title="自动播放（逐屏）">
              <Button
                type="text"
                className={`toolbar-btn${isAutoPlaying ? ' on' : ''}`}
                icon={isAutoPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={toggleAutoPlay}
              >
                自动播放
              </Button>
            </Tooltip>

            <Popover
              trigger="hover"
              placement="top"
              rootClassName={popClass}
              onOpenChange={setSpeedOpen}
              content={
                <div className="imm-slider-pop">
                  <div className="imm-slider-label">滚动速度 {scrollSpeed}</div>
                  <Slider
                    min={1}
                    max={10}
                    value={scrollSpeed}
                    onChange={setScrollSpeed}
                    style={{ width: 200 }}
                  />
                </div>
              }
            >
              <Button
                type="text"
                className={`toolbar-btn${isAutoScrolling ? ' on' : ''}`}
                icon={isAutoScrolling ? <PauseOutlined /> : <VerticalAlignBottomOutlined />}
                onClick={toggleAutoScroll}
              >
                自动翻页
              </Button>
            </Popover>

            <Tooltip title="语音朗读（即将上线）">
              <Button type="text" className="toolbar-btn" icon={<SoundOutlined />} disabled>
                TTS
              </Button>
            </Tooltip>

            <Button
              type="text"
              className="toolbar-btn"
              icon={<EditOutlined />}
              onClick={startEditContent}
            >
              编辑正文
            </Button>
          </div>

          {/* 右：书签 + 主题 + 退出 */}
          <div className="toolbar-section">
            <Button
              type="text"
              className="toolbar-btn"
              icon={<BookOutlined />}
              onClick={() => setLeftPanel((p) => (p === 'bookmarks' ? null : 'bookmarks'))}
            >
              书签
            </Button>
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
