/**
 * 提示词编辑按钮（P3 统一组件，需求 7/8 + M1/M2 单卡迁移）。
 *
 * 点击打开 Modal（左编辑区/右预览或纯 TextArea）；底部「恢复默认」「保存」。
 * 复用 usePromptOverride（取默认/持久化覆盖/重置）。
 *
 * 用法：<PromptEditorButton promptKey="m0-arch" onOverrideChange={setSystemPrompt} />
 * 按类型分支：<PromptEditorButton promptKey="m2-card-single" type={card.type} ... />
 */
import { useState } from 'react'
import { Button, Modal, Input, Typography, App, Spin } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { usePromptOverride } from '../hooks/usePromptOverride'

export interface PromptEditorButtonProps {
  promptKey: string
  /** 按类型分支的提示词（如 M2 单卡）。不传=无类型分支。 */
  type?: string
  /** 覆盖变化时回调（调用方用于本次请求的 systemPrompt 字段）。 */
  onOverrideChange?: (systemPrompt: string | undefined) => void
  /** 按钮文案后缀自定义（默认显示「（已自定义）」当有覆盖时）。 */
  label?: string
  /** 按钮尺寸。 */
  size?: 'small' | 'middle' | 'large'
}

export function PromptEditorButton({
  promptKey,
  type,
  onOverrideChange,
  label,
  size = 'small',
}: PromptEditorButtonProps) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const { defaultValue, currentValue, defaultLoaded, isDirty, save, reset } =
    usePromptOverride(promptKey, type)

  const handleOpen = () => {
    setDraft(currentValue)
    setOpen(true)
  }

  const handleSave = () => {
    save(draft)
    onOverrideChange?.(draft)
    setOpen(false)
    message.success('提示词已保存')
  }

  const handleReset = () => {
    reset()
    setDraft(defaultValue)
    onOverrideChange?.(undefined)
    message.success('已恢复为默认提示词')
  }

  const buttonLabel = label ?? '编辑提示词'
  const dirtyBadge = isDirty ? '（已自定义）' : ''

  return (
    <>
      <Button size={size} icon={<EditOutlined />} onClick={handleOpen}>
        {buttonLabel}{dirtyBadge}
      </Button>
      <Modal
        title="编辑提示词"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        width={720}
        footer={(_, { OkBtn, CancelBtn }) => (
          <>
            <Button onClick={handleReset}>恢复默认</Button>
            <CancelBtn />
            <OkBtn />
          </>
        )}
      >
        {!defaultLoaded ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="加载默认提示词..." />
          </div>
        ) : (
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              {isDirty ? '当前为自定义提示词，可恢复默认' : '当前为默认提示词，修改后保存即覆盖'}
            </Typography.Text>
            <Input.TextArea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoSize={{ minRows: 12, maxRows: 24 }}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
              placeholder="提示词内容..."
            />
          </>
        )}
      </Modal>
    </>
  )
}