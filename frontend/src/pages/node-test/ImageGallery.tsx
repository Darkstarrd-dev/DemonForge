// 节点测试 · 图片模式画廊（A-8 从 index.tsx 抽出，render-only）。
// 渲染：用户提示词气泡（ChatBubble 复用，含编辑/重试/复制/删除）+ 生成图（ResultImage，含重试/删除）+ 错误气泡 + busy 动画。
import { Button, Typography, theme } from 'antd'
import { RedoOutlined } from '@ant-design/icons'
import type { RefObject } from 'react'
import type { ChatMessage } from './types'
import ChatBubble from './ChatBubble'
import ResultImage from './ResultImage'

export default function ImageGallery(props: {
  chatMessages: ChatMessage[]
  busy: boolean
  statusText: string
  elapsed: number
  onAsInput: (dataUrl: string) => void
  chatEndRef: RefObject<HTMLDivElement | null>
  editingMsgId: string | null
  editingText: string
  setEditingText: (v: string) => void
  onRetryMessage: (msgId: string) => void
  onEditMessage: (msgId: string) => void
  onDeleteMessage: (msgId: string) => void
  onCopyText: (text: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
}) {
  const { token } = theme.useToken()
  const {
    chatMessages, busy, statusText, elapsed, onAsInput, chatEndRef,
    editingMsgId, editingText, setEditingText,
    onRetryMessage, onEditMessage, onDeleteMessage, onCopyText, onCommitEdit, onCancelEdit,
  } = props

  if (chatMessages.length === 0 && !busy) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
        <Typography.Text style={{ color: token.colorTextSecondary }}>输入提示词生成图片</Typography.Text>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800, margin: '0 auto', paddingBottom: 24 }}>
      {chatMessages.map((msg) => {
        if (msg.role === 'user') {
          const isEditing = editingMsgId === msg.id
          return (
            <ChatBubble
              key={msg.id}
              msg={msg}
              isEditing={isEditing}
              isStreamingLast={false}
              busy={busy}
              editingText={editingText}
              setEditingText={setEditingText}
              onRetry={() => onRetryMessage(msg.id)}
              onCopy={() => onCopyText(msg.content)}
              onEdit={() => onEditMessage(msg.id)}
              onDelete={() => onDeleteMessage(msg.id)}
              onCommitEdit={onCommitEdit}
              onCancelEdit={onCancelEdit}
              copyText={onCopyText}
            />
          )
        } else {
          if (msg.content.startsWith('data:image') || msg.content.startsWith('/api/image/file/')) {
            return (
              <ResultImage
                key={msg.id}
                dataUrl={msg.content}
                revisedPrompt={msg.revisedPrompt}
                genMs={msg.genMs}
                onAsInput={onAsInput}
                onRetry={() => onRetryMessage(msg.id)}
                onDelete={() => onDeleteMessage(msg.id)}
                busy={busy}
              />
            )
          } else {
            return (
              <div key={msg.id} style={{ background: token.colorErrorBg, border: `1px solid ${token.colorErrorBorder}`, borderRadius: 8, padding: 12 }}>
                <Typography.Text type="danger">{msg.content.replace(/^失败：/, '')}</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Button size="small" danger icon={<RedoOutlined />} onClick={() => onRetryMessage(msg.id)} disabled={busy}>重试</Button>
                </div>
              </div>
            )
          }
        }
      })}
      {busy && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
          <style>{`
            @keyframes gptImagePulse {
              0%, 100% { opacity: 0.4; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.08); }
            }
            @keyframes gptImageShimmer {
              0% { stop-color: ${token.colorPrimary}; stop-opacity: 0.8; }
              50% { stop-color: ${token.colorPrimary}; stop-opacity: 0.3; }
              100% { stop-color: ${token.colorPrimary}; stop-opacity: 0.8; }
            }
            @keyframes gptRingRotate {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
          <svg width="120" height="120" viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="gptRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={token.colorPrimary} stopOpacity="0.9" />
                <stop offset="50%" stopColor={token.colorPrimary} stopOpacity="0.2" />
                <stop offset="100%" stopColor={token.colorPrimary} stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <g style={{ transformOrigin: '60px 60px', animation: 'gptRingRotate 2s linear infinite' }}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="url(#gptRingGrad)" strokeWidth="3" strokeDasharray="80 240" strokeLinecap="round" />
            </g>
            <g style={{ transformOrigin: '60px 60px', animation: 'gptImagePulse 2s ease-in-out infinite' }}>
              <rect x="38" y="38" width="44" height="44" rx="6" fill={token.colorPrimary} opacity="0.15" />
              <path d="M44 68 L52 56 L58 62 L68 50 L76 62 L76 68 Z" fill={token.colorPrimary} opacity="0.5" />
              <circle cx="52" cy="50" r="3" fill={token.colorPrimary} opacity="0.5" />
            </g>
          </svg>
          <Typography.Text style={{ fontSize: 14, color: token.colorText }}>
            {statusText || '生成中…'}
          </Typography.Text>
          {elapsed > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              已用时 {elapsed}s
            </Typography.Text>
          )}
        </div>
      )}
      <div ref={chatEndRef} />
    </div>
  )
}
