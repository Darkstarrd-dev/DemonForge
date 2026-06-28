// M2 设定卡片 · 新建/AI 生成共用编辑器（条件挂载，每次打开自然重置状态；仅一个卸载 useEffect 中止在途流）。
// 手动新增：忽略 AI 区直接填字段保存；AI 生成：填指令 → 流式生成（左 Debug / 右流式输出）→ 字段回填可编辑 → 重新生成/增加生成 → 保存。
import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Divider, Form, Input, Modal, Select, Space, Spin, Typography, theme } from 'antd'
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined, ReloadOutlined, StopOutlined, EditOutlined } from '@ant-design/icons'
import type { Book, DebugInfoData, EntityCard, EntityType, ProviderNode } from '../../services/types'
import { streamGenerateCard, serializeCardForEnrich } from '../../services/api'
import { genId, useAppStore, pushSettingsNow } from '../../store/appStore'
import DebugInfoPanel from '../node-test/DebugInfoPanel'

const EMPTY_DEBUG: DebugInfoData = { previewBody: null, actualBody: null, sseChunks: [] }

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
  const { token } = theme.useToken()
  const textNodes = useMemo(() => providers.filter((p) => p.nodeType !== 'image'), [providers])

  const [type, setType] = useState<EntityType>('character')
  // AI 生成默认归属「素材库（不归属任何书）」；手动新增沿用当前作品。
  const [bookId, setBookId] = useState<string>(initialMode === 'ai' ? '' : (defaultBookId || books[0]?.id || ''))
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
  const [streamText, setStreamText] = useState('')
  const [debug, setDebug] = useState<DebugInfoData>(EMPTY_DEBUG)
  const acRef = useRef<AbortController | null>(null)

  // 卸载清理：父组件非 onCancel 路径卸载（如切走路由）时中止在途 AI 生成流，避免向已卸载组件 setState。
  useEffect(() => () => acRef.current?.abort(), [])

  // 按类型的提示词覆盖（持久化到 settings.json）
  const promptByType = useAppStore((s) => s.m2CardGenPromptByType)
  const setStoreState = useAppStore((s) => s.setState)
  const [promptEditorOpen, setPromptEditorOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)

  const fetchDefaultPrompt = async (): Promise<string> => {
    try {
      const res = await fetch('/api/llm/card-gen-prompt')
      const data = res.ok ? ((await res.json()) as { prompt?: string }) : null
      return data?.prompt ?? ''
    } catch {
      return ''
    }
  }
  const openPromptEditor = async () => {
    setPromptEditorOpen(true)
    const override = promptByType[type]
    if (override) {
      setPromptDraft(override)
      return
    }
    setPromptLoading(true)
    setPromptDraft(await fetchDefaultPrompt())
    setPromptLoading(false)
  }
  const savePrompt = () => {
    setStoreState({ m2CardGenPromptByType: { ...promptByType, [type]: promptDraft } })
    pushSettingsNow()
    setPromptEditorOpen(false)
    message.success(`已保存「${TYPE_OPTIONS.find((t) => t.value === type)?.label}」类型的提示词`)
  }
  const resetPrompt = async () => {
    const next = { ...promptByType }
    delete next[type]
    setStoreState({ m2CardGenPromptByType: next })
    pushSettingsNow()
    setPromptLoading(true)
    setPromptDraft(await fetchDefaultPrompt())
    setPromptLoading(false)
    message.success('已重置为默认提示词')
  }

  const setFieldVal = (idx: number, patch: Partial<FieldRow>) =>
    setFields((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const runGenerate = async (mode: 'create' | 'enrich') => {
    const node = providers.find((p) => p.id === textNodeId)
    if (!node) {
      message.warning('请选择文本节点')
      return
    }
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
    const finalInstruction = instruction.trim() || (mode === 'enrich' ? '在已有内容基础上丰富补全' : '')
    const args = { type, instruction: finalInstruction, mode, existingCard, systemPrompt: promptByType[type] }

    setGenerating(true)
    setStreamText('')
    setDebug({
      previewBody: {
        endpoint: '/api/llm/generate-card-stream',
        model: node.model,
        type,
        mode,
        instruction: finalInstruction || '(留空→按类型随机生成)',
        promptOverridden: !!promptByType[type],
      },
      actualBody: null,
      sseChunks: [],
    })
    const ac = new AbortController()
    acRef.current = ac
    try {
      await streamGenerateCard(
        node,
        args,
        {
          onDelta: (d) => {
            setStreamText((t) => t + d)
            setDebug((dbg) => ({ ...dbg, sseChunks: [...dbg.sseChunks, { line: d, json: { delta: d } }] }))
          },
          onMeta: (body) => setDebug((dbg) => ({ ...dbg, actualBody: body })),
          onDone: (result) => {
            setName(result.name)
            setAliases(result.aliases)
            setDescription(result.description)
            setFields(Object.entries(result.fields).map(([k, v]) => ({ key: k, value: v })))
            if (type === 'character') {
              setStyleNote(result.styleNote ?? '')
              setStyleExamples((result.styleExamples ?? []).join('\n'))
            }
          },
        },
        ac.signal,
      )
      message.success(mode === 'create' ? 'AI 已生成，可继续编辑' : 'AI 已在原基础上丰富')
    } catch (e) {
      if (ac.signal.aborted) message.info('已停止生成（保留已生成内容）')
      else message.error(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenerating(false)
      acRef.current = null
    }
  }

  const stopGenerate = () => acRef.current?.abort()

  const handleClose = () => {
    acRef.current?.abort()
    onClose()
  }

  const save = () => {
    if (!name.trim()) {
      message.warning('名称不能为空')
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

  const bookOptions = [
    { value: '', label: '素材库（不归属任何书）' },
    ...books.map((b) => ({ value: b.id, label: `${b.title}（${b.type === 'project' ? '作品' : '素材'}）` })),
  ]

  const centerContent = (
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
            style={{ width: 240, marginLeft: 4 }}
            value={bookId}
            onChange={setBookId}
            options={bookOptions}
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
            <Button size="small" icon={<EditOutlined />} onClick={openPromptEditor}>
              编辑提示词{promptByType[type] ? '（已自定义）' : ''}
            </Button>
          </Space>
          <Input.TextArea
            placeholder="描述你想要的设定（留空则仅按所选类型随机生成）。例如：一个冷酷的女剑客反派，仇视主角，使用幻影流剑法"
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
              {name ? '重新生成' : instruction.trim() ? '生成' : '随机生成'}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={generating}
              disabled={!name}
              onClick={() => runGenerate('enrich')}
            >
              增加生成（丰富现有）
            </Button>
            {generating && (
              <Button danger icon={<StopOutlined />} onClick={stopGenerate}>
                停止
              </Button>
            )}
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
  )

  const sidePanelStyle = {
    width: 320,
    flexShrink: 0,
    border: `1px solid ${token.colorBorder}`,
    borderRadius: 8,
    background: token.colorBgLayout,
    height: 560,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  }

  return (
    <>
    <Modal
      title={initialMode === 'ai' ? 'AI 生成设定' : '手动新增设定'}
      open
      width={initialMode === 'ai' ? 1180 : 680}
      onCancel={handleClose}
      onOk={save}
      okText="保存为卡片"
      cancelText="取消"
    >
      {initialMode === 'ai' ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          {/* 左：Debug 面板（复用节点测试组件） */}
          <div style={sidePanelStyle}>
            <DebugInfoPanel data={debug} onClose={() => setDebug(EMPTY_DEBUG)} />
          </div>
          {/* 中：表单 */}
          <div style={{ flex: 1, minWidth: 0, maxHeight: 560, overflowY: 'auto', paddingRight: 4 }}>{centerContent}</div>
          {/* 右：流式输出 */}
          <div style={sidePanelStyle}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                流式输出 {generating && <Spin size="small" style={{ marginLeft: 8 }} />}
              </Typography.Title>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {streamText ? (
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', color: token.colorText }}>
                  {streamText}
                </pre>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  点击「生成」后，节点返回内容将在此实时流式显示。
                </Typography.Text>
              )}
            </div>
          </div>
        </div>
      ) : (
        <Spin spinning={generating} tip="AI 生成中…">
          {centerContent}
        </Spin>
      )}
    </Modal>

    <Modal
      title={`编辑「${TYPE_OPTIONS.find((t) => t.value === type)?.label}」类型的 AI 生成提示词`}
      open={promptEditorOpen}
      width={760}
      onCancel={() => setPromptEditorOpen(false)}
      footer={[
        <Button key="reset" danger onClick={resetPrompt}>重置为默认</Button>,
        <Button key="cancel" onClick={() => setPromptEditorOpen(false)}>取消</Button>,
        <Button key="save" type="primary" onClick={savePrompt}>保存</Button>,
      ]}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        该提示词用于「{TYPE_OPTIONS.find((t) => t.value === type)?.label}」类型的单卡 AI 生成（含留空随机），不同类型互相独立；批量生成使用各自独立的提示词。
      </Typography.Paragraph>
      <Spin spinning={promptLoading}>
        <Input.TextArea
          value={promptDraft}
          onChange={(e) => setPromptDraft(e.target.value)}
          autoSize={{ minRows: 12, maxRows: 24 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Spin>
    </Modal>
    </>
  )
}
