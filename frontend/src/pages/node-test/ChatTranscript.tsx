// 节点测试 · 单栏文本模式消息列表（A-8 从 index.tsx 抽出，render-only）。
// 复用 ChatBubble；单栏独有 footer（最后一条 assistant 的节点·模型名 / 模型切换标记）经计算注入。
import { Typography, theme } from 'antd'
import { MessageOutlined } from '@ant-design/icons'
import type { RefObject } from 'react'
import type { ChatMessage, Phase } from './types'
import ChatBubble from './ChatBubble'

export default function ChatTranscript(props: {
  chatMessages: ChatMessage[]
  phase: Phase
  busy: boolean
  editingMsgId: string | null
  editingText: string
  setEditingText: (v: string) => void
  lastAssistantMeta: { msgId: string; label: string } | null
  modelChanges: { msgId: string; label: string }[]
  onRetry: (msgId: string) => void
  copyText: (text: string) => void
  onEdit: (msgId: string) => void
  onDelete: (msgId: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  chatEndRef: RefObject<HTMLDivElement | null>
}) {
  const { token } = theme.useToken()
  const { chatMessages, phase, busy, editingMsgId, editingText, setEditingText, lastAssistantMeta, modelChanges, onRetry, copyText, onEdit, onDelete, onCommitEdit, onCancelEdit, chatEndRef } = props

  if (chatMessages.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48, opacity: 0.5 }}>
        <MessageOutlined style={{ fontSize: 48, color: token.colorTextSecondary, marginBottom: 16 }} />
        <Typography.Text style={{ color: token.colorTextSecondary, display: 'block' }}>
          输入消息开始对话
        </Typography.Text>
      </div>
    )
  }

  return (
    <>
      {chatMessages.map((msg) => {
        const isLastAssistant = lastAssistantMeta?.msgId === msg.id
        const isModelChange = modelChanges.find((mc) => mc.msgId === msg.id)
        const isEditing = editingMsgId === msg.id
        const isStreamingLast = msg.role === 'assistant' && phase === 'streaming' && msg.id === chatMessages[chatMessages.length - 1]?.id
        const footer = msg.role === 'assistant' && !isEditing && !isStreamingLast ? (
          <>
            {isLastAssistant && lastAssistantMeta && (
              <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                {lastAssistantMeta.label}
              </Typography.Text>
            )}
            {isModelChange && (
              <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                {isModelChange.label}
              </Typography.Text>
            )}
          </>
        ) : undefined
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
            footer={footer}
          />
        )
      })}
      <div ref={chatEndRef} />
    </>
  )
}
