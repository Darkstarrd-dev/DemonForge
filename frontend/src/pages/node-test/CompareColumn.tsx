// 节点测试 · 对比模式单侧聊天列（A-8 从 index.tsx 抽出，左右两侧复用，render-only）。
// 标题（左侧/右侧 · 模型名）+ 空态 + 气泡列表；每条气泡的编辑/操作回调由父级按 side 注入。
// isStreamingLast = 该 side phase==='streaming' 且为列表最后一条 assistant；isEditing 看 editingMsgId+editingSide。
import { Typography, theme } from 'antd'
import { MessageOutlined } from '@ant-design/icons'
import type { ChatMessage, Phase } from './types'
import ChatBubble from './ChatBubble'

export default function CompareColumn(props: {
  side: 'left' | 'right'
  label: string
  messages: ChatMessage[]
  phase: Phase
  editingMsgId: string | null
  editingSide: 'left' | 'right' | null
  editingText: string
  setEditingText: (v: string) => void
  onRetry: (msgId: string) => void
  onEdit: (msgId: string) => void
  onDelete: (msgId: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  copyText: (text: string) => void
}) {
  const { token } = theme.useToken()
  const { side, label, messages, phase, editingMsgId, editingSide, editingText, setEditingText, onRetry, onEdit, onDelete, onCommitEdit, onCancelEdit, copyText } = props
  const busy = phase === 'streaming'
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: side === 'left' ? `1px solid ${token.colorBorder}` : undefined, padding: '0 24px' }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, textAlign: 'center' }}>
        {label}
      </Typography.Text>
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, opacity: 0.5 }}>
            <MessageOutlined style={{ fontSize: 48, color: token.colorTextSecondary, marginBottom: 16 }} />
            <Typography.Text style={{ color: token.colorTextSecondary, display: 'block' }}>
              输入消息开始对话
            </Typography.Text>
          </div>
        ) : (
          messages.map((msg) => {
            const isStreamingLast = msg.role === 'assistant' && phase === 'streaming' && msg.id === messages[messages.length - 1]?.id
            const isEditing = editingMsgId === msg.id && editingSide === side
            return (
              <ChatBubble
                key={msg.id}
                msg={msg}
                isEditing={isEditing}
                isStreamingLast={isStreamingLast}
                busy={busy}
                editingText={editingText}
                setEditingText={setEditingText}
                onRetry={() => onRetry(msg.id)}
                onCopy={() => copyText(msg.content)}
                onEdit={() => onEdit(msg.id)}
                onDelete={() => onDelete(msg.id)}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
                copyText={copyText}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
