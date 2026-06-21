import { useRef, useEffect } from 'react'
import { Avatar, Space, Typography } from 'antd'
import type { RoleChatMessage, RoleChatParticipant } from '../../../services/types'

interface Props {
  messages: RoleChatMessage[]
  participants: RoleChatParticipant[]
}

// 生成头像颜色（从名称生成）
function colorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#eb2f96', '#52c41a', '#1890ff']
  return colors[Math.abs(hash) % colors.length]
}

export default function MessageList({ messages, participants }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 新消息自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: 14,
        }}
      >
        暂无对话内容，发送消息开始交流
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0',
      }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {messages.map((msg) => {
          const participant = participants.find((p) => p.id === msg.participantId)
          const avatarColor = participant?.color || colorFromName(msg.participantName)

          return (
            <div key={msg.id} style={{ display: 'flex', gap: 12 }}>
              {/* 头像 */}
              {participant?.avatar ? (
                <Avatar src={participant.avatar} size={40} />
              ) : (
                <Avatar style={{ backgroundColor: avatarColor, flexShrink: 0 }} size={40}>
                  {msg.participantName[0].toUpperCase()}
                </Avatar>
              )}

              {/* 消息内容 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space size={8} style={{ marginBottom: 4 }}>
                  <Typography.Text strong style={{ fontSize: 14 }}>
                    {msg.participantName}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </Typography.Text>
                </Space>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: '#262626',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          )
        })}
      </Space>
    </div>
  )
}
