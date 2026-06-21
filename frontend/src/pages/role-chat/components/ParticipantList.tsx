import { List, Avatar, Button, Space, Tag, Typography } from 'antd'
import { DeleteOutlined, UserOutlined } from '@ant-design/icons'
import type { RoleChatParticipant } from '../../../services/types'

interface Props {
  participants: RoleChatParticipant[]
  onRemove: (id: string) => void
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

export default function ParticipantList({ participants, onRemove }: Props) {
  if (participants.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
        <UserOutlined style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }} />
        <div style={{ fontSize: 12 }}>暂无参与者</div>
      </div>
    )
  }

  return (
    <List
      size="small"
      dataSource={participants}
      renderItem={(p) => (
        <List.Item
          style={{ padding: '8px 0', border: 'none' }}
          actions={[
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
                {p.mode === 'local' ? '本地节点' : 'Opencode'}
              </Typography.Text>
            }
          />
        </List.Item>
      )}
    />
  )
}
