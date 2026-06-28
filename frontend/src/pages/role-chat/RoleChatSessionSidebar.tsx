// 角色交流 · 多 session 常驻左侧栏（渲染在 AppLayout 的 Sider 内，由左上角 logo 点击切换显示）。
// 第一项「主界面·群聊」=群聊总控；其后每个参与者一行=各自独立 session，点击切换视角。
// 切换不影响其它参与者的后台推理（运行态在 roleChatEngine + roleChatRuntimes，与本组件解耦）。
import { useState } from 'react'
import { Button, Typography, theme, Popconfirm, Avatar, Tooltip } from 'antd'
import {
  PlusOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  StopOutlined,
  TeamOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { cancelParticipant } from '../../services/roleChatEngine'
import type { RoleChatParticipant } from '../../services/types'
import { NodePickerModal } from '../../components/node-picker/NodePickerModal'
import AddParticipantModal from './components/AddParticipantModal'

export default function RoleChatSessionSidebar() {
  const { token } = theme.useToken()
  const participants = useAppStore((s) => s.roleChatParticipants)
  const activeSessionId = useAppStore((s) => s.roleChatActiveSessionId)
  const runtimes = useAppStore((s) => s.roleChatRuntimes)
  const clearRoleChatRuntime = useAppStore((s) => s.clearRoleChatRuntime)
  const setState = useAppStore((s) => s.setState)

  const [addOpen, setAddOpen] = useState(false)
  // 需求5：节点切换浮窗（当前切换的参与者 id）
  const [pickerForId, setPickerForId] = useState<string | null>(null)
  const pickerParticipant = participants.find((p) => p.id === pickerForId)

  const setActive = (id: string) => setState({ roleChatActiveSessionId: id })

  const addMany = (added: RoleChatParticipant[]) => {
    useAppStore.setState((s) => ({ roleChatParticipants: [...s.roleChatParticipants, ...added] }))
    setAddOpen(false)
  }

  // 需求5：切换参与者绑定的节点
  const setParticipantNode = (id: string, nodeId: string) => {
    useAppStore.setState((s) => ({
      roleChatParticipants: s.roleChatParticipants.map((p) => (p.id === id ? { ...p, nodeId } : p)),
    }))
  }

  const removeParticipant = (id: string) => {
    cancelParticipant(id)
    clearRoleChatRuntime(id)
    useAppStore.setState((s) => ({
      roleChatParticipants: s.roleChatParticipants.filter((p) => p.id !== id),
      roleChatActiveSessionId: s.roleChatActiveSessionId === id ? 'main' : s.roleChatActiveSessionId,
    }))
  }

  const statusIcon = (id: string) => {
    const st = runtimes[id]?.status
    if (st === 'streaming' || st === 'thinking') return <LoadingOutlined spin style={{ color: token.colorPrimary }} />
    if (st === 'done') return <CheckCircleOutlined style={{ color: token.colorSuccess }} />
    if (st === 'error') return <ExclamationCircleOutlined style={{ color: token.colorError }} />
    return null
  }

  const rowStyle = (active: boolean) => ({
    padding: '6px 10px 6px 12px',
    cursor: 'pointer',
    background: active ? token.colorPrimaryBg : 'transparent',
    borderLeft: active ? `2px solid ${token.colorPrimary}` : '2px solid transparent',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        <Button block icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          添加参与者
        </Button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {/* 主界面（群聊） */}
        <div onClick={() => setActive('main')} style={rowStyle(activeSessionId === 'main')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TeamOutlined style={{ color: token.colorTextSecondary, flexShrink: 0 }} />
            <Typography.Text strong style={{ flex: 1, fontSize: 13 }}>
              主界面 · 群聊
            </Typography.Text>
          </div>
        </div>

        {/* 各参与者 session */}
        {participants.length === 0 ? (
          <Typography.Text type="secondary" style={{ display: 'block', padding: '8px 16px', fontSize: 12 }}>
            暂无参与者，点「添加参与者」开始
          </Typography.Text>
        ) : (
          participants.map((p) => {
            const active = p.id === activeSessionId
            const running = runtimes[p.id]?.status === 'streaming' || runtimes[p.id]?.status === 'thinking'
            return (
              <div key={p.id} onClick={() => setActive(p.id)} style={rowStyle(active)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p.avatar ? (
                    <Avatar size={20} src={p.avatar} style={{ flexShrink: 0 }} />
                  ) : (
                    <Avatar size={20} style={{ backgroundColor: p.color, flexShrink: 0, fontSize: 11 }}>
                      {p.name[0]?.toUpperCase()}
                    </Avatar>
                  )}
                  <Typography.Text ellipsis style={{ flex: 1, fontSize: 13 }}>
                    {p.name}
                  </Typography.Text>
                  <span style={{ width: 16, flexShrink: 0, textAlign: 'center', fontSize: 13 }}>{statusIcon(p.id)}</span>
                  {/* 需求5：节点切换按钮（删除按钮左侧） */}
                  <Tooltip title={`切换节点${p.nodeId ? `：${p.nodeId}` : ''}`}>
                    <ApiOutlined
                      onClick={(e) => { e.stopPropagation(); setPickerForId(p.id) }}
                      style={{ color: token.colorTextTertiary, flexShrink: 0 }}
                    />
                  </Tooltip>
                  {running ? (
                    <Tooltip title="停止该参与者推理">
                      <StopOutlined
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelParticipant(p.id)
                        }}
                        style={{ color: token.colorTextTertiary, flexShrink: 0 }}
                      />
                    </Tooltip>
                  ) : (
                    <Popconfirm
                      title="移除该参与者？"
                      okText="移除"
                      cancelText="取消"
                      onConfirm={() => removeParticipant(p.id)}
                    >
                      <DeleteOutlined
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: token.colorTextTertiary, flexShrink: 0, opacity: 0.6 }}
                      />
                    </Popconfirm>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <AddParticipantModal open={addOpen} onClose={() => setAddOpen(false)} onAddMany={addMany} />

      {/* 需求5：节点切换浮窗 */}
      <NodePickerModal
        open={!!pickerForId}
        kind="text"
        selectedId={pickerParticipant?.nodeId}
        onSelect={(v) => { if (pickerForId) setParticipantNode(pickerForId, v) }}
        onClose={() => setPickerForId(null)}
        title="切换角色节点"
      />
    </div>
  )
}
