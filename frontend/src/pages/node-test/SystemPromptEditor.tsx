import { useState } from 'react'
import { App, Button, Input, Select, Typography, theme } from 'antd'
import { CloseOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import type { SystemPromptPreset } from '../../store/appStore'

interface Props {
  /** 已保存的预设列表（下拉选项） */
  presets: SystemPromptPreset[]
  /** 当前激活预设 id；null=未选中/新建态 */
  activeId: string | null
  /** 当前激活预设的 title（无激活时为空串） */
  activeTitle: string
  /** 当前激活预设的 content（无激活时为空串） */
  activeContent: string
  /** 保存/更新预设（activeId 有值则更新，null 则新建） */
  onSave: (title: string, content: string) => void
  /** 按 id 删除预设 */
  onDelete: (id: string) => void
  /** 切换激活预设 id（传 null 进入新建态） */
  onSelect: (id: string | null) => void
  /** 退出编辑界面，切回参数设置视图 */
  onClose: () => void
}

export default function SystemPromptEditor(props: Props) {
  const { token } = theme.useToken()
  const { modal, message } = App.useApp()
  const { presets, activeId, activeTitle, activeContent, onSave, onDelete, onSelect, onClose } = props

  const [draftTitle, setDraftTitle] = useState(activeTitle)
  const [draftContent, setDraftContent] = useState(activeContent)

  // dirty 判定：编辑现有项时与已保存值比较；新建态时只要有任何输入即脏
  const dirty = activeId
    ? draftTitle !== activeTitle || draftContent !== activeContent
    : draftTitle.trim() !== '' || draftContent.trim() !== ''

  const canSave = draftTitle.trim() !== ''

  // 有未保存修改时弹确认，否则直接执行
  const confirmDiscard = (action: () => void) => {
    if (dirty) {
      modal.confirm({
        title: '放弃未保存的修改？',
        content: '当前编辑内容未保存，离开后将丢失。',
        okText: '放弃',
        okButtonProps: { danger: true },
        cancelText: '继续编辑',
        onOk: action,
      })
    } else {
      action()
    }
  }

  const handleClose = () => confirmDiscard(onClose)
  const handleNew = () => confirmDiscard(() => onSelect(null))

  const handleSave = () => {
    if (!canSave) return
    onSave(draftTitle.trim(), draftContent)
    message.success(activeId ? '已更新' : '已保存')
  }

  const handleDelete = () => {
    if (!activeId) return
    modal.confirm({
      title: '删除该预设？',
      content: `「${activeTitle || '未命名'}」将被永久删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        onDelete(activeId)
        message.success('已删除')
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header：标题 + 关闭 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${token.colorBorder}`,
          flexShrink: 0,
        }}
      >
        <Typography.Title level={5} style={{ margin: 0, color: token.colorText }}>
          System Instructions
        </Typography.Title>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={handleClose} />
      </div>

      {/* 主体 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* 下拉：选择已保存预设 */}
        <div style={{ marginBottom: 12 }}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择已保存的预设"
            value={activeId ?? undefined}
            onChange={(v: string) => confirmDiscard(() => onSelect(v))}
            options={presets.map((p) => ({ value: p.id, label: p.title }))}
            notFoundContent="暂无已保存预设"
            allowClear
            onClear={() => confirmDiscard(() => onSelect(null))}
          />
        </div>

        {/* Title + 删除 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input
            placeholder="为提示词命名..."
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onPressEnter={handleSave}
          />
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={!activeId}
            onClick={handleDelete}
          />
        </div>

        {/* 内容 textarea */}
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          placeholder="输入 system prompt..."
          style={{
            flex: 1,
            minHeight: 120,
            width: '100%',
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: 6,
            padding: 8,
            color: token.colorText,
            fontSize: 13,
            resize: 'none',
            fontFamily: 'inherit',
          }}
        />

        {/* 操作按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexShrink: 0 }}>
          <Button icon={<PlusOutlined />} onClick={handleNew}>
            新建
          </Button>
          <Button type="primary" icon={<SaveOutlined />} disabled={!canSave} onClick={handleSave}>
            保存
          </Button>
          {dirty && (
            <Typography.Text style={{ color: token.colorWarning, fontSize: 12 }}>未保存</Typography.Text>
          )}
        </div>
      </div>
    </div>
  )
}
