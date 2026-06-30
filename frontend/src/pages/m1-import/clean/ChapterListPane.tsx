// 章节列表面板 —— Step3Clean 左侧 Tabs 中的"待处理"/"完成"/"节点任务"子面板共用。
// 受控组件：从父级拿 chapters + activeIds + doneSet + selectedTask。
import { memo } from 'react'
import { Empty, Space, Tag, Typography } from 'antd'
import type { ImportChapter } from '../../../services/types'

export interface ChapterListPaneProps {
  chapters: ImportChapter[]
  emptyText: string
  selectedTask: string | null
  activeIds: Set<string>
  onPick: (chapterId: string) => void
  statusColor: (st: string) => string
  doneSet?: Set<string>
}

const TRUNCATE_AT = 300

function ChapterListPaneInner({
  chapters,
  emptyText,
  selectedTask,
  activeIds,
  onPick,
  statusColor,
  doneSet,
}: ChapterListPaneProps) {
  const truncated = chapters.length > TRUNCATE_AT
  const visible = truncated ? chapters.slice(0, TRUNCATE_AT) : chapters
  return (
    <div style={{ height: '100%', overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
      {chapters.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} style={{ marginTop: 40 }} />
      ) : (
        <>
          {visible.map((c) => {
            const isActive = activeIds.has(c.id)
            const isDone = doneSet?.has(c.id)
            const outLen = c.cleanedContent?.length
            return (
              <div
                key={c.id}
                onClick={() => onPick(c.id)}
                style={{
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderBottom: '1px solid #f0f0f0',
                  background: selectedTask === c.id ? '#e6f4ff' : undefined,
                  opacity: isDone ? 0.7 : 1,
                }}
              >
                <Typography.Text ellipsis style={{ maxWidth: 180, display: 'block', fontSize: 13 }}>
                  {c.title}
                </Typography.Text>
                <Space size={4}>
                  {c.processedByNode && (
                    <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>
                      {c.processedByNode.nodeName}
                    </Tag>
                  )}
                  <Tag color={statusColor(c.cleanStatus)} style={{ margin: 0, fontSize: 11 }}>
                    {isActive
                      ? '处理中'
                      : c.cleanStatus === 'completed'
                        ? '已完成'
                        : c.cleanStatus === 'accepted'
                          ? '已采纳'
                          : c.cleanStatus === 'failed'
                            ? '失败'
                            : c.cleanStatus === 'needsReprocess'
                              ? '待重做'
                              : '待处理'}
                  </Tag>
                  {outLen != null && (
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {outLen} 字
                    </Typography.Text>
                  )}
                  {isDone && <Typography.Text type="success" style={{ fontSize: 11 }}>✓</Typography.Text>}
                </Space>
              </div>
            )
          })}
          {truncated && (
            <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: 12, borderTop: '1px solid #f0f0f0' }}>
              共 {chapters.length} 项，仅显示前 {TRUNCATE_AT}（完整列表请进入审核步骤）
            </div>
          )}
        </>
      )}
    </div>
  )
}

const ChapterListPane = memo(ChapterListPaneInner)
export default ChapterListPane
