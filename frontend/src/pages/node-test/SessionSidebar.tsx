// 节点测试 · 多 session 常驻左侧栏。
// 列出所有会话，每行带动态状态图标（推理中=旋转、已完成=对勾、失败=叹号），点击即切换；
// 切换不影响其它 session 的后台推理（运行态在 sessionEngine + sessionRuntimes，与本组件解耦）。
// 渲染在 AppLayout 的 Sider 内，由左上角 "NovelHelper" 点击切换显示（app 导航 / session 列表）。
import { useState } from 'react'
import { Button, Typography, theme, Popconfirm, Input, Tooltip } from 'antd'
import {
  PlusOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { cancelSession } from '../../services/api'
import type { ChatSession } from '../../services/types'
import { resolveProviderNodes } from '../../utils/providerResolver'

export default function SessionSidebar() {
  const { token } = theme.useToken()
  const chatSessions = useAppStore((s) => s.chatSessions)
  const activeChatSessionId = useAppStore((s) => s.activeChatSessionId)
  const sessionRuntimes = useAppStore((s) => s.sessionRuntimes)
  const providers = useAppStore((s) => s.providers)
  const providerNodes = useAppStore((s) => s.providerNodes)
  const resolvedNodes = resolveProviderNodes({ providers, providerNodes })
  const setActiveChatSessionId = useAppStore((s) => s.setActiveChatSessionId)
  const renameChatSession = useAppStore((s) => s.renameChatSession)
  const deleteChatSession = useAppStore((s) => s.deleteChatSession)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const sorted = [...chatSessions].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

  const statusIcon = (id: string) => {
    const st = sessionRuntimes[id]?.status
    if (st === 'streaming') return <LoadingOutlined spin style={{ color: token.colorPrimary }} />
    if (st === 'done') return <CheckCircleOutlined style={{ color: token.colorSuccess }} />
    if (st === 'error') return <ExclamationCircleOutlined style={{ color: token.colorError }} />
    return null
  }

  const commitRename = (s: ChatSession) => {
    renameChatSession(s.id, editText.trim() || s.title)
    setEditingId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        <Button block icon={<PlusOutlined />} onClick={() => setActiveChatSessionId(null)}>
          新对话
        </Button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {sorted.length === 0 ? (
          <Typography.Text type="secondary" style={{ display: 'block', padding: '8px 16px', fontSize: 12 }}>
            暂无会话，点「新对话」开始
          </Typography.Text>
        ) : (
          sorted.map((s) => {
            const active = s.id === activeChatSessionId
            const running = sessionRuntimes[s.id]?.status === 'streaming'
            const node = resolvedNodes.find((p) => p.id === s.nodeId)
            const sub = `${node?.name ?? ''}${node ? ' · ' : ''}${s.modelName ?? ''}`
            return (
              <div
                key={s.id}
                onClick={() => setActiveChatSessionId(s.id)}
                style={{
                  padding: '6px 10px 6px 12px',
                  cursor: 'pointer',
                  background: active ? token.colorPrimaryBg : 'transparent',
                  borderLeft: active ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 16, flexShrink: 0, textAlign: 'center', fontSize: 13 }}>{statusIcon(s.id)}</span>
                  {editingId === s.id ? (
                    <Input
                      size="small"
                      autoFocus
                      value={editText}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditText(e.target.value)}
                      onPressEnter={() => commitRename(s)}
                      onBlur={() => commitRename(s)}
                      style={{ flex: 1 }}
                    />
                  ) : (
                    <Typography.Text
                      ellipsis
                      style={{ flex: 1, fontSize: 13 }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setEditingId(s.id)
                        setEditText(s.title)
                      }}
                    >
                      {s.title || '未命名会话'}
                    </Typography.Text>
                  )}
                  {running ? (
                    <Tooltip title="停止该会话推理">
                      <StopOutlined
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelSession(s.id)
                        }}
                        style={{ color: token.colorTextTertiary, flexShrink: 0 }}
                      />
                    </Tooltip>
                  ) : (
                    <Popconfirm
                      title="删除该会话？"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => deleteChatSession(s.id)}
                    >
                      <DeleteOutlined
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: token.colorTextTertiary, flexShrink: 0, opacity: 0.6 }}
                      />
                    </Popconfirm>
                  )}
                </div>
                {sub.trim() && (
                  <Typography.Text type="secondary" ellipsis style={{ fontSize: 11, display: 'block', paddingLeft: 24 }}>
                    {sub}
                  </Typography.Text>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
