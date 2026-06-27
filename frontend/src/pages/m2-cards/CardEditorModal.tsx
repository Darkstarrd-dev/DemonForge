// M2 设定卡片 · 新建/AI 生成共用编辑器（条件挂载，每次打开自然重置状态，无 useEffect）。
// 手动新增：忽略 AI 区直接填字段保存；AI 生成：填指令 → 生成 → 字段回填可编辑 → 重新生成/增加生成 → 保存。
import { useMemo, useState } from 'react'
import { App, Button, Divider, Form, Input, Modal, Select, Space, Spin, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons'
import type { Book, EntityCard, EntityType, ProviderNode } from '../../services/types'
import { generateCard, serializeCardForEnrich } from '../../services/api'
import { genId } from '../../store/appStore'

const TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'character', label: '人物' },
  { value: 'location', label: '地点' },
  { value: 'item', label: '物品' },
  { value: 'skill', label: '技能' },
  { value: 'faction', label: '势力' },
]

interface FieldRow {
  key: string
  value: string
}

interface Props {
  initialMode: 'manual' | 'ai'
  books: Book[]
  providers: ProviderNode[]
  defaultTextNodeId?: string
  defaultBookId?: string
  onClose: () => void
  onSaved: (card: EntityCard) => void
}

export default function CardEditorModal({
  initialMode,
  books,
  providers,
  defaultTextNodeId,
  defaultBookId,
  onClose,
  onSaved,
}: Props) {
  const { message } = App.useApp()
  const textNodes = useMemo(() => providers.filter((p) => p.nodeType !== 'image'), [providers])

  const [type, setType] = useState<EntityType>('character')
  const [bookId, setBookId] = useState<string>(defaultBookId || books[0]?.id || '')
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [styleNote, setStyleNote] = useState('')
  const [styleExamples, setStyleExamples] = useState('')
  const [fields, setFields] = useState<FieldRow[]>([])

  // AI 区
  const [textNodeId, setTextNodeId] = useState<string>(defaultTextNodeId || textNodes[0]?.id || '')
  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)

  const setFieldVal = (idx: number, patch: Partial<FieldRow>) =>
    setFields((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const runGenerate = async (mode: 'create' | 'enrich') => {
    if (!instruction.trim() && mode === 'create') {
      message.warning('请先填写生成指令')
      return
    }
    const node = providers.find((p) => p.id === textNodeId)
    if (!node) {
      message.warning('请选择文本节点')
      return
    }
    setGenerating(true)
    try {
      const existingCard =
        mode === 'enrich'
          ? serializeCardForEnrich({
              name,
              aliases,
              description,
              fields: Object.fromEntries(fields.filter((f) => f.key.trim()).map((f) => [f.key, f.value])),
              styleNote: styleNote || undefined,
              styleExamples: styleExamples ? styleExamples.split('\n').filter((s) => s.trim()) : undefined,
            })
          : undefined
      const result = await generateCard(node, {
        type,
        instruction: instruction.trim() || '在已有内容基础上丰富补全',
        mode,
        existingCard,
      })
      setName(result.name)
      setAliases(result.aliases)
      setDescription(result.description)
      setFields(Object.entries(result.fields).map(([k, v]) => ({ key: k, value: v })))
      if (type === 'character') {
        setStyleNote(result.styleNote ?? '')
        setStyleExamples((result.styleExamples ?? []).join('\n'))
      }
      message.success(mode === 'create' ? 'AI 已生成，可继续编辑' : 'AI 已在原基础上丰富')
    } catch (e) {
      message.error(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  const save = () => {
    if (!name.trim()) {
      message.warning('名称不能为空')
      return
    }
    if (!bookId) {
      message.warning('请选择归属书')
      return
    }
    const now = new Date().toISOString()
    const card: EntityCard = {
      id: genId('card'),
      bookId,
      type,
      name: name.trim(),
      aliases,
      description: description.trim(),
      fields: Object.fromEntries(fields.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])),
      ...(type === 'character' && styleNote.trim() ? { styleNote: styleNote.trim() } : {}),
      ...(type === 'character' && styleExamples.trim()
        ? { styleExamples: styleExamples.split('\n').map((s) => s.trim()).filter(Boolean) }
        : {}),
      refs: [],
      images: [],
      updatedAt: now,
    }
    onSaved(card)
  }

  return (
    <Modal
      title={initialMode === 'ai' ? 'AI 生成设定' : '手动新增设定'}
      open
      width={680}
      onCancel={onClose}
      onOk={save}
      okText="保存为卡片"
      cancelText="取消"
    >
      <Spin spinning={generating} tip="AI 生成中…">
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
          <Space wrap>
            <span>
              类型：
              <Select
                style={{ width: 120, marginLeft: 4 }}
                value={type}
                onChange={setType}
                options={TYPE_OPTIONS}
              />
            </span>
            <span>
              归属书：
              <Select
                style={{ width: 220, marginLeft: 4 }}
                value={bookId}
                onChange={setBookId}
                options={books.map((b) => ({ value: b.id, label: `${b.title}（${b.type === 'project' ? '作品' : '素材'}）` }))}
              />
            </span>
          </Space>

          {/* AI 生成区 */}
          <div style={{ border: '1px solid var(--ant-color-border, #d9d9d9)', borderRadius: 8, padding: 12 }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap>
                <ThunderboltOutlined style={{ color: '#C4612F' }} />
                <Typography.Text strong>AI 生成（可选）</Typography.Text>
                <Select
                  size="small"
                  style={{ width: 220 }}
                  placeholder="选择文本节点"
                  value={textNodeId || undefined}
                  onChange={setTextNodeId}
                  options={textNodes.map((n) => ({ value: n.id, label: `${n.name} · ${n.model}` }))}
                />
              </Space>
              <Input.TextArea
                placeholder="描述你想要的设定，例如：一个冷酷的女剑客反派，仇视主角，使用幻影流剑法"
                autoSize={{ minRows: 2, maxRows: 4 }}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <Space>
                <Button
                  type="primary"
                  ghost
                  icon={<ThunderboltOutlined />}
                  loading={generating}
                  onClick={() => runGenerate('create')}
                >
                  {name ? '重新生成' : '生成'}
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  loading={generating}
                  disabled={!name}
                  onClick={() => runGenerate('enrich')}
                >
                  增加生成（丰富现有）
                </Button>
              </Space>
            </Space>
          </div>

          <Divider style={{ margin: '4px 0' }}>卡片内容（可编辑）</Divider>

          <Form layout="vertical" size="small" component="div">
            <Form.Item label="名称" required style={{ marginBottom: 8 }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Form.Item>
            <Form.Item label="别名" style={{ marginBottom: 8 }}>
              <Select mode="tags" value={aliases} onChange={setAliases} placeholder="输入后回车添加" />
            </Form.Item>
            <Form.Item label="描述" style={{ marginBottom: 8 }}>
              <Input.TextArea value={description} onChange={(e) => setDescription(e.target.value)} autoSize={{ minRows: 3 }} />
            </Form.Item>

            <Form.Item label="结构化字段" style={{ marginBottom: 8 }}>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {fields.map((f, idx) => (
                  <Space.Compact key={idx} style={{ width: '100%' }}>
                    <Input
                      style={{ width: '32%' }}
                      placeholder="字段名"
                      value={f.key}
                      onChange={(e) => setFieldVal(idx, { key: e.target.value })}
                    />
                    <Input
                      placeholder="字段值"
                      value={f.value}
                      onChange={(e) => setFieldVal(idx, { value: e.target.value })}
                    />
                    <Button icon={<DeleteOutlined />} onClick={() => setFields((rows) => rows.filter((_, i) => i !== idx))} />
                  </Space.Compact>
                ))}
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setFields((rows) => [...rows, { key: '', value: '' }])}
                >
                  添加字段
                </Button>
              </Space>
            </Form.Item>

            {type === 'character' && (
              <>
                <Form.Item label="语言风格描述（M3 推演约束）" style={{ marginBottom: 8 }}>
                  <Input.TextArea value={styleNote} onChange={(e) => setStyleNote(e.target.value)} autoSize={{ minRows: 2 }} />
                </Form.Item>
                <Form.Item label="台词例句（每行一句）" style={{ marginBottom: 0 }}>
                  <Input.TextArea value={styleExamples} onChange={(e) => setStyleExamples(e.target.value)} autoSize={{ minRows: 2 }} />
                </Form.Item>
              </>
            )}
          </Form>
        </Space>
      </Spin>
    </Modal>
  )
}
