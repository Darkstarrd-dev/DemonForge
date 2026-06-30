// 沉浸式阅读器 · 左侧滑出面板容器。
// 包含三个独立子区域：clean mode 控制（节点选择+阶段按钮）、章节列表（含内联标题编辑）、书签列表。
// 完全受控：所有状态由父级管，本组件只做 JSX 编排 + 事件转发。
import { Button, Input, Tooltip } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { Chapter, ResolvedProviderNode } from '../../../services/types'
import type { CleanPhase } from './AiCleanPanel'
import type { ReaderMode } from '../hooks/useBookNavigation'

export type LeftPanel = 'chapters' | 'bookmarks' | null

export interface Bookmark {
  id: string
  chapterId: string
  chapterTitle: string
  progress: number
  createdAt: string
}

export interface LeftSlidePanelProps {
  // 容器
  mode: ReaderMode
  panel: LeftPanel
  onClose: () => void
  // clean mode 域
  cleanChapter: Chapter | null
  cleanPhase: CleanPhase
  liveAcc: string
  cleanError: string | null
  resolvedNodes: ResolvedProviderNode[]
  selectedNodeId: string | null
  onSelectNode: (id: string) => void
  onAccept: () => void
  onReject: () => void
  onRetry: () => void
  onCancel: () => void
  onExitClean: () => void
  // chapters list 域
  chapters: Chapter[]
  currentId: string
  titleDraft: { id: string; title: string } | null
  onTitleDraftChange: (d: { id: string; title: string } | null) => void
  onSaveTitle: () => void
  onGoToChapter: (id: string) => void
  onEnterClean: (chId: string) => void
  // bookmarks 域
  bookmarks: Bookmark[]
  onAddBookmark: () => void
  onDeleteBookmark: (id: string) => void
  onJumpBookmark: (bm: Bookmark) => void
}

export default function LeftSlidePanel({
  mode,
  panel,
  onClose,
  cleanChapter,
  cleanPhase,
  liveAcc,
  cleanError,
  resolvedNodes,
  selectedNodeId,
  onSelectNode,
  onAccept,
  onReject,
  onRetry,
  onCancel,
  onExitClean,
  chapters,
  currentId,
  titleDraft,
  onTitleDraftChange,
  onSaveTitle,
  onGoToChapter,
  onEnterClean,
  bookmarks,
  onAddBookmark,
  onDeleteBookmark,
  onJumpBookmark,
}: LeftSlidePanelProps) {
  return (
    <>
      {mode !== 'clean' && <div className="imm-panel-backdrop" onClick={onClose} />}
      <div className="imm-panel">
        <div className="imm-panel-head">
          <span className="imm-panel-title">
            {mode === 'clean'
              ? `AI 清理 · ${cleanChapter?.title ?? ''}`
              : panel === 'chapters'
                ? `章节列表（${chapters.length}）`
                : `书签（${bookmarks.length}）`}
          </span>
          {mode !== 'clean' && panel === 'bookmarks' && (
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={onAddBookmark}>
              添加当前位置
            </Button>
          )}
          {mode !== 'clean' && (
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              className="imm-panel-close"
              onClick={onClose}
            />
          )}
        </div>

        <div className="imm-panel-body">
          {/* Clean mode panel content */}
          {mode === 'clean' && (
            <div className="imm-clean-panel">
              {cleanPhase === 'review' && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--imm-border)' }}>
                  <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--imm-muted)' }}>
                    审阅下方对比结果，逐行决定接受或拒绝。
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button type="primary" icon={<CheckOutlined />} onClick={onAccept}>
                      接受
                    </Button>
                    <Button danger icon={<CloseOutlined />} onClick={onReject}>
                      拒绝
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={onRetry}>
                      重新清理
                    </Button>
                  </div>
                </div>
              )}

              {cleanPhase === 'streaming' && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--imm-border)' }}>
                  <div style={{ fontSize: 13, color: 'var(--imm-accent)', marginBottom: 8 }}>
                    正在清理…{liveAcc ? `（已收到 ${liveAcc.length} 字符）` : ''}
                  </div>
                  <Button size="small" danger icon={<StopOutlined />} onClick={onCancel}>
                    取消
                  </Button>
                </div>
              )}

              {cleanPhase === 'error' && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--imm-border)' }}>
                  <div style={{ fontSize: 13, color: '#ff4d4f', marginBottom: 8 }}>
                    {cleanError || '清理失败，请重试'}
                  </div>
                  <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
                    重选节点
                  </Button>
                </div>
              )}

              {/* 节点列表 */}
              {(cleanPhase === 'selecting' || cleanPhase === 'streaming' || cleanPhase === 'error') && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--imm-muted)', marginBottom: 4 }}>
                    选择清理节点：
                  </div>
                  {resolvedNodes
                    .filter((p) => p.enabled && p.nodeType === 'text')
                    .map((node) => {
                      const disabled = cleanPhase !== 'selecting'
                      const active = selectedNodeId === node.id
                      return (
                        <div
                          key={node.id}
                          className={`imm-node-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
                          onClick={() => {
                            if (disabled) return
                            onSelectNode(node.id)
                          }}
                        >
                          <span className="imm-node-name">{node.name}</span>
                          <span className="imm-node-model">{node.model}</span>
                        </div>
                      )
                    })}
                  {resolvedNodes.filter((p) => p.enabled && p.nodeType === 'text').length === 0 && (
                    <div
                      style={{
                        padding: 16,
                        color: 'var(--imm-muted)',
                        fontSize: 13,
                        textAlign: 'center',
                      }}
                    >
                      暂无已启用的 Provider 节点。
                      <br />
                      请先在设置中配置并测试。
                    </div>
                  )}
                </div>
              )}

              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--imm-border)' }}>
                <Button size="small" type="text" icon={<CloseOutlined />} onClick={onExitClean} block>
                  退出清理模式
                </Button>
              </div>
            </div>
          )}

          {/* Normal chapters list */}
          {mode !== 'clean' && panel === 'chapters' &&
            chapters.map((c, i) => {
              const editing = titleDraft?.id === c.id
              const active = c.id === currentId
              return (
                <div
                  key={c.id}
                  className={`imm-chapter-item${active ? ' active' : ''}`}
                  onClick={() => {
                    if (editing) return
                    onGoToChapter(c.id)
                  }}
                >
                  {editing ? (
                    <div className="imm-title-edit" onClick={(e) => e.stopPropagation()}>
                      <Input
                        size="small"
                        value={titleDraft!.title}
                        autoFocus
                        onChange={(e) => onTitleDraftChange({ id: c.id, title: e.target.value })}
                        onPressEnter={onSaveTitle}
                      />
                      <Button size="small" type="primary" onClick={onSaveTitle}>
                        存
                      </Button>
                      <Button size="small" onClick={() => onTitleDraftChange(null)}>
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
                          onTitleDraftChange({ id: c.id, title: c.title })
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
                            onEnterClean(c.id)
                          }}
                        />
                      </Tooltip>
                    </>
                  )}
                </div>
              )
            })}

          {/* Normal bookmarks list */}
          {mode !== 'clean' && panel === 'bookmarks' &&
            (bookmarks.length === 0 ? (
              <div className="imm-empty">暂无书签，点上方「添加当前位置」</div>
            ) : (
              bookmarks.map((bm) => (
                <div key={bm.id} className="imm-bm-item" onClick={() => onJumpBookmark(bm)}>
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
                      onDeleteBookmark(bm.id)
                    }}
                  />
                </div>
              ))
            ))}
        </div>
      </div>
    </>
  )
}
