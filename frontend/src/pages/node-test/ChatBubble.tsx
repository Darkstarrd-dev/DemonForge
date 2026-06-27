// 节点测试 · 单条聊天气泡（A-8 从 index.tsx 抽出，消除单栏/对比左/对比右三处重复，render-only）。
// 气泡主体（图片网格/时间戳/reasoning/编辑态/正文/操作行）三处逐字相同；差异点全部参数化：
//   - isEditing/isStreamingLast 由父级计算后传入（单栏看 phase，对比看 phaseLeft/Right + side）。
//   - 4 个操作回调（retry/copy/edit/delete）+ 编辑提交/取消由父级注入（单栏走 session，对比走本地 state）。
//   - footer 仅单栏传入（节点·模型名 / 模型切换标记），对比模式不传。
import { Button, Space, Typography, Tooltip, Collapse, Popconfirm, theme } from 'antd'
import { CopyOutlined, RedoOutlined, EditOutlined, DeleteOutlined, BulbOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { ChatMessage } from './types'

export default function ChatBubble(props: {
  msg: ChatMessage
  isEditing: boolean
  isStreamingLast: boolean
  busy: boolean
  editingText: string
  setEditingText: (v: string) => void
  onRetry: () => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  copyText: (text: string) => void
  /** 仅单栏传入：节点·模型名 / 模型切换标记，渲染在气泡底部 */
  footer?: ReactNode
}) {
  const { token } = theme.useToken()
  const { msg, isEditing, isStreamingLast, busy, editingText, setEditingText, onRetry, onCopy, onEdit, onDelete, onCommitEdit, onCancelEdit, copyText, footer } = props
  return (
    <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
      <div
        style={{
          maxWidth: '75%',
          padding: 12,
          borderRadius: 12,
          background: msg.role === 'user' ? (token.colorBgBase === '#ffffff' ? token.colorPrimaryBg : 'rgba(22, 119, 255, 0.15)') : (token.colorBgBase === '#ffffff' ? token.colorBgElevated : 'rgba(255, 255, 255, 0.08)'),
          border: `1px solid ${msg.role === 'user' ? token.colorPrimaryBorder : token.colorBorder}`,
          position: 'relative',
        }}
      >
        {/* 图片网格 */}
        {msg.images && msg.images.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {msg.images.map((img, idx) => (
              <img key={idx} src={img} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
            ))}
          </div>
        )}
        {/* 时间戳 */}
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
          {new Date(msg.timestamp).toLocaleTimeString()}
        </Typography.Text>
        {/* Reasoning 显示 */}
        {msg.role === 'assistant' && msg.reasoning && (
          <div style={{ marginBottom: 8 }}>
            {msg.content ? (
              // 完成后折叠显示
              <Collapse
                ghost
                size="small"
                items={[{
                  key: 'reasoning',
                  label: (
                    <Space size={4}>
                      <BulbOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>思考过程</Typography.Text>
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        title="复制思考过程"
                        onClick={(e) => { e.stopPropagation(); copyText(msg.reasoning!) }}
                        style={{ fontSize: 12, height: 20, padding: '0 4px', marginLeft: 4 }}
                      />
                    </Space>
                  ),
                  children: (
                    <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: token.colorTextTertiary, display: 'block' }}>
                      {msg.reasoning}
                    </Typography.Text>
                  ),
                }]}
                style={{ background: token.colorFillQuaternary, borderRadius: 8, padding: '4px 8px' }}
              />
            ) : (
              // 推理中流式显示
              <div style={{ background: token.colorFillQuaternary, borderRadius: 8, padding: '8px 12px', marginBottom: 4 }}>
                <Space size={4} style={{ marginBottom: 6 }}>
                  <BulbOutlined style={{ fontSize: 12, color: token.colorPrimary }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>推理中...</Typography.Text>
                </Space>
                <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: token.colorTextTertiary, display: 'block' }}>
                  {msg.reasoning}
                </Typography.Text>
              </div>
            )}
          </div>
        )}
        {/* 正文区：编辑态 vs 普通显示 */}
        {isEditing ? (
          <div>
            <textarea
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              rows={6}
              style={{ width: '100%', background: token.colorBgContainer, border: `1px solid ${token.colorBorder}`, borderRadius: 6, padding: 8, color: token.colorText, fontSize: 14, resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }}
            />
            <div style={{ textAlign: 'right' }}>
              <Space size={8}>
                <Button size="small" onClick={onCancelEdit}>取消</Button>
                <Button size="small" type="primary" onClick={onCommitEdit}>保存</Button>
              </Space>
            </div>
          </div>
        ) : (
          <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 14, display: 'block' }}>
            {msg.content}
          </Typography.Text>
        )}
        {/* 底部操作行 */}
        {!isEditing && (
          <div style={{ marginTop: 8 }}>
            {isStreamingLast ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, border: `2px solid ${token.colorPrimary}33`, borderTop: `2px solid ${token.colorPrimary}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>推理中...</Typography.Text>
              </div>
            ) : (
              <Space size={4}>
                <Tooltip title="重试">
                  <Button type="text" size="small" icon={<RedoOutlined />} onClick={onRetry} disabled={busy} style={{ fontSize: 12, height: 20, padding: '0 4px' }} />
                </Tooltip>
                <Tooltip title="复制">
                  <Button type="text" size="small" icon={<CopyOutlined />} onClick={onCopy} style={{ fontSize: 12, height: 20, padding: '0 4px' }} />
                </Tooltip>
                <Tooltip title="编辑">
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} disabled={busy} style={{ fontSize: 12, height: 20, padding: '0 4px' }} />
                </Tooltip>
                <Popconfirm title="删除该条消息？" onConfirm={onDelete} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                  <Tooltip title="删除">
                    <Button type="text" size="small" icon={<DeleteOutlined />} disabled={busy} style={{ fontSize: 12, height: 20, padding: '0 4px' }} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            )}
          </div>
        )}
        {footer}
      </div>
    </div>
  )
}
