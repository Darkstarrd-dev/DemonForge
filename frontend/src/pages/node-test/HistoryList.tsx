import { useState } from 'react'
import { App, Button, Checkbox, Input, Popconfirm, Space, Typography, Empty, theme } from 'antd'
import { CloseOutlined, EditOutlined, DeleteOutlined, SearchOutlined, CheckSquareOutlined } from '@ant-design/icons'
import type { ChatSession } from '../../services/types'

interface Props {
  sessions: ChatSession[]
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onDeleteMany: (ids: string[]) => void
  onExit: () => void
}

export default function HistoryList({ sessions, onSelect, onRename, onDelete, onDeleteMany, onExit }: Props) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const [keyword, setKeyword] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filtered = sessions
    .filter((s) => s.title.toLowerCase().includes(keyword.toLowerCase()))
    .slice()
    .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))

  const filteredIds = new Set(filtered.map((s) => s.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map((s) => s.id)))
  }

  const invertSelect = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of filteredIds) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const deleteSelected = () => {
    if (selectedIds.size === 0) return
    onDeleteMany([...selectedIds])
    message.success(`已删除 ${selectedIds.size} 条记录`)
    exitSelectMode()
  }

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
      {/* Header：标题 + 搜索 + 操作 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
        <Typography.Title level={5} style={{ margin: 0, color: token.colorText, flexShrink: 0 }}>历史记录</Typography.Title>
        {selectMode ? (
          <>
            <Button size="small" onClick={selectAll}>全选</Button>
            <Button size="small" onClick={invertSelect}>反选</Button>
            <Popconfirm
              title={`删除选中的 ${selectedIds.size} 条记录？`}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={deleteSelected}
              disabled={selectedIds.size === 0}
            >
              <Button size="small" danger disabled={selectedIds.size === 0}>删除选中 ({selectedIds.size})</Button>
            </Popconfirm>
            <Button size="small" onClick={exitSelectMode}>退出复选</Button>
          </>
        ) : (
          <Button size="small" icon={<CheckSquareOutlined />} onClick={() => setSelectMode(true)}>批量管理</Button>
        )}
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
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(s.id)
                  } else if (editingId !== s.id) {
                    onSelect(s.id)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: token.colorBgElevated,
                  borderRadius: 8,
                  border: `1px solid ${selectedIds.has(s.id) ? token.colorPrimary : token.colorBorder}`,
                  cursor: editingId === s.id ? 'default' : 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) => { if (editingId !== s.id && !selectMode) e.currentTarget.style.borderColor = token.colorPrimary }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = selectedIds.has(s.id) ? token.colorPrimary : token.colorBorder }}
              >
                {selectMode && (
                  <Checkbox checked={selectedIds.has(s.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(s.id)} />
                )}
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
                  ) : selectMode ? null : (
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
