import { useState } from 'react'
import { App, Button, Input, Popconfirm, Space, Typography, Empty, theme } from 'antd'
import { CloseOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import type { ChatSession } from '../../services/types'

interface Props {
  sessions: ChatSession[]
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onExit: () => void
}

export default function HistoryList({ sessions, onSelect, onRename, onDelete, onExit }: Props) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const [keyword, setKeyword] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const filtered = sessions
    .filter((s) => s.title.toLowerCase().includes(keyword.toLowerCase()))
    .slice()
    .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))

  const startEdit = (s: ChatSession) => {
    setEditingId(s.id)
    setEditingTitle(s.title)
  }
  const commitEdit = () => {
    if (editingId && editingTitle.trim()) {
      onRename(editingId, editingTitle.trim())
      message.success('已更名')
    }
    setEditingId(null)
    setEditingTitle('')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  const typeBadge = (t: ChatSession['testType']) => {
    const map = {
      text: { label: '文本', bg: '#238636' },
      multimodal: { label: '多模态', bg: '#1f6feb' },
      image: { label: '图片', bg: '#6e40c9' },
    }
    const m = map[t]
    return <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: m.bg, color: '#fff', lineHeight: 1.4, flexShrink: 0 }}>{m.label}</span>
  }

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } catch {
      return iso
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: token.colorBgContainer }}>
      {/* Header：标题 + 搜索 + 退出 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
        <Typography.Title level={5} style={{ margin: 0, color: token.colorText, flexShrink: 0 }}>历史记录</Typography.Title>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
          placeholder="搜索标题..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ flex: 1, maxWidth: 360 }}
        />
        <Button type="text" icon={<CloseOutlined />} onClick={onExit} />
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {filtered.length === 0 ? (
          <Empty description={keyword ? '无匹配记录' : '暂无对话记录'} style={{ marginTop: 80 }} />
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => editingId !== s.id && onSelect(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: token.colorBgElevated,
                  borderRadius: 8,
                  border: `1px solid ${token.colorBorder}`,
                  cursor: editingId === s.id ? 'default' : 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) => { if (editingId !== s.id) e.currentTarget.style.borderColor = token.colorPrimary }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = token.colorBorder }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === s.id ? (
                    <Input
                      autoFocus
                      size="small"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onPressEnter={commitEdit}
                      onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit() }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ maxWidth: 320 }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Typography.Text ellipsis style={{ color: token.colorText, fontSize: 14, fontWeight: 500, flex: 1 }}>{s.title}</Typography.Text>
                      {typeBadge(s.testType)}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>{fmtDate(s.updatedAt)}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>·</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis>{s.modelName}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>·</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>{s.messages.length} 条消息</Typography.Text>
                  </div>
                </div>
                <Space size={4} onClick={(e) => e.stopPropagation()}>
                  {editingId === s.id ? (
                    <>
                      <Button size="small" type="primary" onClick={commitEdit}>保存</Button>
                      <Button size="small" onClick={cancelEdit}>取消</Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" type="text" icon={<EditOutlined />} onClick={() => startEdit(s)} title="更名" />
                      <Popconfirm
                        title="删除该对话记录？"
                        okText="删除"
                        okButtonProps={{ danger: true }}
                        cancelText="取消"
                        onConfirm={() => onDelete(s.id)}
                      >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除" />
                      </Popconfirm>
                    </>
                  )}
                </Space>
              </div>
            ))}
          </Space>
        )}
      </div>
    </div>
  )
}
