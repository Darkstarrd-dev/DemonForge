import { useState, useEffect, useRef } from 'react'
import { Modal, Input, Select, Button, Space, Typography, App } from 'antd'
import { BulbOutlined, ClearOutlined } from '@ant-design/icons'
import { useAppStore } from '../../../store/appStore'
import { streamChat } from '../../../services/real/chat'

interface Props {
  open: boolean
  /** 当前已保存的场景设定（打开时载入草稿） */
  value: string
  /** 参与者名称（用于 AI 生成 prompt） */
  participantNames: string[]
  onClose: () => void
  onSave: (text: string) => void
}

export default function SceneSettingModal({ open, value, participantNames, onClose, onSave }: Props) {
  const { message } = App.useApp()
  const providers = useAppStore((s) => s.providers)
  const textNodes = providers.filter((p) => p.nodeType === 'text' && p.enabled)

  const [draft, setDraft] = useState(value)
  const [genNodeId, setGenNodeId] = useState<string>()
  const [generating, setGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 打开时载入已保存内容 + 默认生成节点
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时一次性同步草稿与默认节点
      setDraft(value)
      setGenNodeId((prev) => prev ?? textNodes[0]?.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textNodes 每渲染重算，不入依赖；仅按 open/value 触发
  }, [open, value])

  // AI 生成场景背景（流式追加到草稿；已有内容作为补充要求喂入）
  const handleGenerate = async () => {
    const node = textNodes.find((n) => n.id === genNodeId)
    if (!node) {
      message.warning('请选择用于生成的文本节点')
      return
    }
    const hint = draft.trim()
    const prompt = `请为一场角色对话生成一段简洁的场景背景设定，交代时间、地点、氛围、起因，150 字以内，直接输出正文，不要标题、不要额外解释。
参与角色：${participantNames.join('、') || '（未指定）'}${hint ? `\n补充要求：${hint}` : ''}`

    setGenerating(true)
    setDraft('')
    abortRef.current = new AbortController()
    try {
      await streamChat(
        {
          baseURL: node.baseURL,
          apiKey: node.apiKey,
          model: node.model,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          delta: (d) => setDraft((prev) => prev + d),
          done: () => {},
          error: (e) => message.error(`生成失败：${e}`),
        },
        abortRef.current.signal,
      )
    } catch (e) {
      if (!abortRef.current?.signal.aborted) {
        message.error(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleClose = () => {
    abortRef.current?.abort()
    onClose()
  }

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  return (
    <Modal
      title="场景设定"
      open={open}
      onCancel={handleClose}
      onOk={handleSave}
      width={640}
      okText="保存"
      cancelText="取消"
      okButtonProps={{ disabled: generating }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          输入本次交流的背景信息（时间、地点、氛围、起因等），将注入所有参与角色的设定，作为共享场景。
        </Typography.Text>

        {/* 工具行：生成节点 + AI 生成 + 清空 */}
        <Space wrap>
          <Select
            size="small"
            style={{ width: 200 }}
            value={genNodeId}
            onChange={setGenNodeId}
            options={textNodes.map((n) => ({ label: n.name, value: n.id }))}
            placeholder="选择生成节点"
          />
          <Button
            size="small"
            type="primary"
            icon={<BulbOutlined />}
            loading={generating}
            onClick={handleGenerate}
          >
            AI 生成
          </Button>
          <Button
            size="small"
            icon={<ClearOutlined />}
            disabled={generating || !draft}
            onClick={() => setDraft('')}
          >
            清空
          </Button>
        </Space>

        <Input.TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoSize={{ minRows: 6, maxRows: 14 }}
          placeholder="例如：深夜的废弃工厂，雨声不断。两人因一桩旧案在此狭路相逢……"
        />
      </Space>
    </Modal>
  )
}
