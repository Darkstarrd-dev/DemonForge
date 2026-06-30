// 工作节点列表面板 —— Step3Clean 左侧"节点"Tab 的内容。
// 显示当前 cleanRun.nodeSessions 中所有工作的节点会话。
import { memo } from 'react'
import { Empty, Space, Tag, Typography } from 'antd'
import type { CleanRunNodeSession } from '../../../store/appStore'

export interface NodeListPaneProps {
  sessions: CleanRunNodeSession[]
  selectedNode: string | null
  onPick: (sessionKey: string) => void
}

function NodeListPaneInner({ sessions, selectedNode, onPick }: NodeListPaneProps) {
  return (
    <div style={{ height: '100%', overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
      {sessions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无工作中的节点" style={{ marginTop: 40 }} />
      ) : (
        sessions.map((s) => {
          const inFlight = s.assigned.length - s.done.length
          return (
            <div
              key={s.sessionKey}
              onClick={() => onPick(s.sessionKey)}
              style={{
                cursor: 'pointer',
                padding: '8px 10px',
                borderBottom: '1px solid #f0f0f0',
                background: selectedNode === s.sessionKey ? '#e6f4ff' : undefined,
                opacity: s.idle ? 0.6 : 1,
              }}
            >
              <Typography.Text strong ellipsis style={{ maxWidth: 160, display: 'block', fontSize: 13 }}>
                {s.name}
              </Typography.Text>
              <Space size={6}>
                <Tag color={s.idle ? 'default' : 'processing'} style={{ margin: 0, fontSize: 11 }}>
                  {s.idle ? '本批完成' : '工作中'}
                </Tag>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  接手 {s.assigned.length} · 完成 {s.done.length} · 进行中 {inFlight}
                </Typography.Text>
              </Space>
            </div>
          )
        })
      )}
    </div>
  )
}

const NodeListPane = memo(NodeListPaneInner)
export default NodeListPane
