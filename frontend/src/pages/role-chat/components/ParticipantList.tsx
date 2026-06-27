import { List, Avatar, Button, Space, Tag, Typography, Popover, Select } from 'antd'
import { DeleteOutlined, EditOutlined, UserOutlined } from '@ant-design/icons'
import type { RoleChatParticipant, ProviderNode } from '../../../services/types'

interface Props {
  participants: RoleChatParticipant[]
  /** 文本节点池：用于显示节点名 + 编辑节点下拉 */
  providers: ProviderNode[]
  onRemove: (id: string) => void
  /** 编辑某参与者的推理节点（仅本地模式） */
  onEditNode?: (id: string, nodeId: string) => void
  onStatusChange?: (id: string, status: RoleChatParticipant['status']) => void
}

// 状态徽章颜色映射
const STATUS_COLOR = {
  idle: 'default',
  thinking: 'gold',
  responding: 'blue',
  waiting: 'cyan',
  done: 'green',
} as const

// 状态文本映射
const STATUS_TEXT = {
  idle: '空闲',
  thinking: '思考中',
  responding: '回复中',
  waiting: '等待中',
  done: '完成',
} as const

// 生成头像颜色（从名称生成）
function colorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#eb2f96', '#52c41a', '#1890ff']
  return colors[Math.abs(hash) % colors.length]
}

export default function ParticipantList({ participants, providers, onRemove, onEditNode }: Props) {
  if (participants.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
        <UserOutlined style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }} />
        <div style={{ fontSize: 12 }}>暂无参与者</div>
      </div>
    )
  }

  const textNodes = providers.filter((p) => p.nodeType === 'text' && p.enabled)

  // 参与者下方描述：本地模式显示节点名，Opencode 模式显示模型/标识
  const describe = (p: RoleChatParticipant): string => {
    if (p.mode === 'local') {
      return providers.find((n) => n.id === p.nodeId)?.name ?? '未指定节点'
    }
    return p.model || 'Opencode'
  }

  return (
    <List
      size="small"
      dataSource={participants}
      renderItem={(p) => (
        <List.Item
          style={{ padding: '8px 0', border: 'none' }}
          actions={[
            ...(p.mode === 'local' && onEditNode
              ? [
                  <Popover
                    key="edit"
                    trigger="click"
                    title="选择推理节点"
                    content={
                      <Select
                        size="small"
                        style={{ width: 200 }}
                        value={p.nodeId}
                        onChange={(v) => onEditNode(p.id, v)}
                        options={textNodes.map((n) => ({ label: n.name, value: n.id }))}
                        placeholder="选择节点"
                      />
                    }
                  >
                    <Button key="edit-btn" type="text" size="small" icon={<EditOutlined />} />
                  </Popover>,
                ]
              : []),
            <Button
              key="remove"
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onRemove(p.id)}
            />,
          ]}
        >
          <List.Item.Meta
            avatar={
              p.avatar ? (
                <Avatar src={p.avatar} />
              ) : (
                <Avatar style={{ backgroundColor: p.color || colorFromName(p.name) }}>
                  {p.name[0].toUpperCase()}
                </Avatar>
              )
            }
            title={
              <Space size={4}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  {p.name}
                </Typography.Text>
                {p.status !== 'idle' && (
                  <Tag color={STATUS_COLOR[p.status]} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                    {STATUS_TEXT[p.status]}
                  </Tag>
                )}
              </Space>
            }
            description={
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {describe(p)}
              </Typography.Text>
            }
          />
        </List.Item>
      )}
    />
  )
}
