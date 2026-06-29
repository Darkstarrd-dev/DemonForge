// M2 设定卡片 · 批量 AI 生成（条件挂载，每次打开自然重置）。
// 流程：① 配置类型/归属/节点/数量/要求/串并发/单次批次 → ② 生成侧写（可编辑）→
//      ③ 按「单次请求批次 K」切块，串行或并发(C)逐块扩写为完整卡片 → ④ 复核勾选，批量入库。
import { useEffect, useRef, useState } from 'react'
import {
  App, Button, Checkbox, Divider, Empty, Input, InputNumber, List, Modal,
  Progress, Radio, Select, Space, Spin, Tag, Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined, ThunderboltOutlined, StopOutlined, ReloadOutlined } from '@ant-design/icons'
import type { Book, EntityCard, EntityType, ResolvedProviderNode } from '../../services/types'
import { generateCardProfiles, generateCardsBatch, type CardProfile, type GeneratedCard } from '../../services/api'
import { NodePickerButton } from '../../components/node-picker/NodePickerButton'
import { PromptEditorButton } from '../../components/PromptEditorButton'
import { useModuleNode } from '../../hooks/useModuleNode'
import { buildEntityCard } from '../../utils/buildEntityCard'
import { useAppStore } from '../../store/appStore'

const TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'character', label: '人物' },
  { value: 'location', label: '地点' },
  { value: 'item', label: '物品' },
  { value: 'skill', label: '技能' },
  { value: 'faction', label: '势力' },
]

interface Props {
  books: Book[]
  providers: ResolvedProviderNode[]
  defaultTextNodeId?: string
  /** 默认归属书；批量默认素材库（空串） */
  defaultBookId?: string
  onClose: () => void
  onSavedMany: (cards: EntityCard[]) => void
}

export default function BatchCardModal({ books, providers, defaultBookId, onClose, onSavedMany }: Props) {
  const { message } = App.useApp()

  const [type, setType] = useState<EntityType>('character')
  const [bookId, setBookId] = useState<string>(defaultBookId ?? '')
  const [textNodeId, setTextNodeId] = useState<string>('')
  // 实际生效节点：未手动选则走 moduleMapping.m2Extract 默认（需求6追加：默认显示默认）
  const { nodeId: resolvedNodeId } = useModuleNode('m2Extract', 'text', textNodeId || undefined)
  const [instruction, setInstruction] = useState('')
  const [count, setCount] = useState(5)
  const [batchMode, setBatchMode] = useState<'serial' | 'concurrent'>('serial')
  const [concurrency, setConcurrency] = useState(2)
  const [cardsPerRequest, setCardsPerRequest] = useState(1)

  const [phase, setPhase] = useState<'config' | 'profiles' | 'generating' | 'review'>('config')
  const [profiles, setProfiles] = useState<CardProfile[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<{ card: GeneratedCard; checked: boolean }[]>([])
  const abortRef = useRef(false)

  // 卸载即停止在途批量（防止后台续跑烧 token）
  useEffect(() => () => { abortRef.current = true }, [])

  const node = providers.find((p) => p.id === resolvedNodeId)
  const bookOptions = [
    { value: '', label: '素材库（不归属任何书）' },
    ...books.map((b) => ({ value: b.id, label: `${b.title}（${b.type === 'project' ? '作品' : '素材'}）` })),
  ]
  const typeLabel = TYPE_OPTIONS.find((t) => t.value === type)?.label

  // ① 生成侧写
  const genProfiles = async () => {
    if (!node) { message.warning('请选择文本节点'); return }
    setBusy(true)
    try {
      const ps = await generateCardProfiles(node, {
        type, count, instruction: instruction.trim(),
        ...(useAppStore.getState().promptOverrides['m2-card-profiles']
          ? { systemPrompt: useAppStore.getState().promptOverrides['m2-card-profiles'] }
          : {}),
      })
      if (ps.length === 0) { message.error('未生成侧写，请重试或调整要求'); return }
      setProfiles(ps)
      setPhase('profiles')
      message.success(`已生成 ${ps.length} 条侧写，可编辑后开始批量生成`)
    } catch (e) {
      message.error(`侧写生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // 侧写编辑
  const setProfile = (i: number, patch: Partial<CardProfile>) =>
    setProfiles((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const delProfile = (i: number) => setProfiles((ps) => ps.filter((_, idx) => idx !== i))
  const addProfile = () => setProfiles((ps) => [...ps, { name: '', brief: '' }])

  // ② 批量生成（切块 + 串/并发）
  const startBatch = async () => {
    if (!node) { message.warning('请选择文本节点'); return }
    const valid = profiles.filter((p) => p.name.trim())
    if (valid.length === 0) { message.warning('没有有效侧写（名称为空）'); return }
    const K = Math.max(1, cardsPerRequest)
    const chunks: CardProfile[][] = []
    for (let i = 0; i < valid.length; i += K) chunks.push(valid.slice(i, i + K))

    abortRef.current = false
    setBusy(true)
    setPhase('generating')
    setProgress({ done: 0, total: chunks.length })
    setResults([])
    let failed = 0

    const runChunk = async (chunk: CardProfile[]) => {
      if (abortRef.current) return
      try {
        const { cards } = await generateCardsBatch(node, {
          type, profiles: chunk, instruction: instruction.trim(),
          ...(useAppStore.getState().promptOverrides['m2-cards-batch']
            ? { systemPrompt: useAppStore.getState().promptOverrides['m2-cards-batch'] }
            : {}),
        })
        setResults((rs) => [...rs, ...cards.filter((c) => c.name.trim()).map((card) => ({ card, checked: true }))])
      } catch {
        failed++
      } finally {
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }
    }

    try {
      if (batchMode === 'serial') {
        for (const chunk of chunks) {
          if (abortRef.current) break
          await runChunk(chunk)
        }
      } else {
        let idx = 0
        const C = Math.max(1, Math.min(concurrency, chunks.length))
        await Promise.all(
          Array.from({ length: C }, async () => {
            for (;;) {
              const my = idx++
              if (my >= chunks.length || abortRef.current) break
              await runChunk(chunks[my])
            }
          }),
        )
      }
      setPhase('review')
      if (abortRef.current) message.info('已停止批量生成（保留已生成卡片）')
      else if (failed > 0) message.warning(`完成，其中 ${failed} 个批次失败已跳过`)
      else message.success('批量生成完成，请复核后保存')
    } finally {
      setBusy(false)
    }
  }

  const stop = () => { abortRef.current = true }

  // ③ 批量保存
  const saveSelected = () => {
    const selected = results.filter((r) => r.checked)
    if (selected.length === 0) { message.warning('请至少勾选一张卡片'); return }
    onSavedMany(selected.map((r) => buildEntityCard(r.card, type, bookId)))
  }

  const checkedCount = results.filter((r) => r.checked).length

  // ===== 各阶段内容 =====
  const configView = (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space wrap size={16}>
        <span>类型：<Select style={{ width: 110, marginLeft: 4 }} value={type} onChange={setType} options={TYPE_OPTIONS} /></span>
        <span>归属书：<Select style={{ width: 230, marginLeft: 4 }} value={bookId} onChange={setBookId} options={bookOptions} /></span>
        <span>文本节点：
          <NodePickerButton
            moduleKey="m2Extract"
            kind="text"
            value={textNodeId || undefined}
            onChange={setTextNodeId}
            style={{ width: 220, marginLeft: 4, verticalAlign: 'middle' }}
          />
        </span>
        <PromptEditorButton promptKey="m2-card-profiles" label="编辑侧写提示词" />
        <PromptEditorButton promptKey="m2-cards-batch" label="编辑扩写提示词" />
      </Space>
      <Input.TextArea
        placeholder="整体要求/主题（可留空：留空则仅按所选类型自由随机生成一批彼此差异化的设定）"
        autoSize={{ minRows: 2, maxRows: 4 }}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <Space wrap size={16}>
        <span>生成数量：<InputNumber min={1} max={50} value={count} onChange={(v) => setCount(v ?? 5)} style={{ width: 90, marginLeft: 4 }} /></span>
        <span>
          生成方式：
          <Radio.Group
            value={batchMode}
            onChange={(e) => setBatchMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            style={{ marginLeft: 4 }}
          >
            <Radio.Button value="serial">串行</Radio.Button>
            <Radio.Button value="concurrent">并发</Radio.Button>
          </Radio.Group>
        </span>
        {batchMode === 'concurrent' && (
          <span>并发数：<InputNumber min={1} max={8} value={concurrency} onChange={(v) => setConcurrency(v ?? 2)} style={{ width: 80, marginLeft: 4 }} /></span>
        )}
        <span>单次请求批次：<InputNumber min={1} max={10} value={cardsPerRequest} onChange={(v) => setCardsPerRequest(v ?? 1)} style={{ width: 80, marginLeft: 4 }} /></span>
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        「单次请求批次」= 一次请求让 AI 生成几个角色；共 {count} 个 → 约 {Math.ceil(count / Math.max(1, cardsPerRequest))} 个请求，
        {batchMode === 'serial' ? '顺序逐个进行' : `按并发数 ${concurrency} 分批并行`}。
      </Typography.Text>
    </Space>
  )

  const profilesView = (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        共 {profiles.length} 条侧写，可修改名称/侧写、删除或新增，确认后开始批量生成。
      </Typography.Text>
      <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {profiles.map((p, i) => (
            <Space.Compact key={i} style={{ width: '100%' }}>
              <Input style={{ width: 150 }} placeholder="名称" value={p.name} onChange={(e) => setProfile(i, { name: e.target.value })} />
              <Input placeholder="一句话侧写" value={p.brief} onChange={(e) => setProfile(i, { brief: e.target.value })} />
              <Button icon={<DeleteOutlined />} onClick={() => delProfile(i)} />
            </Space.Compact>
          ))}
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addProfile}>添加一条侧写</Button>
        </Space>
      </div>
    </Space>
  )

  const generatingView = (
    <Space direction="vertical" size={12} style={{ width: '100%', padding: '12px 0' }}>
      <Progress percent={progress.total ? Math.round((progress.done / progress.total) * 100) : 0} status="active" />
      <Typography.Text type="secondary">
        正在批量生成：已完成 {progress.done}/{progress.total} 个请求，已得到 {results.length} 张卡片…
      </Typography.Text>
    </Space>
  )

  const reviewView = (
    results.length === 0 ? (
      <Empty description="没有生成任何卡片" />
    ) : (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            共 {results.length} 张，已勾选 {checkedCount} 张将保存到「{bookOptions.find((o) => o.value === bookId)?.label}」
          </Typography.Text>
          <Space size={4}>
            <Button size="small" onClick={() => setResults((rs) => rs.map((r) => ({ ...r, checked: true })))}>全选</Button>
            <Button size="small" onClick={() => setResults((rs) => rs.map((r) => ({ ...r, checked: false })))}>全不选</Button>
          </Space>
        </Space>
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          <List
            size="small"
            dataSource={results}
            renderItem={(r, i) => (
              <List.Item style={{ alignItems: 'flex-start' }}>
                <Checkbox
                  checked={r.checked}
                  onChange={(e) => setResults((rs) => rs.map((x, idx) => (idx === i ? { ...x, checked: e.target.checked } : x)))}
                  style={{ marginRight: 8, marginTop: 2 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={6}>
                    <Tag color="blue" style={{ margin: 0 }}>{typeLabel}</Tag>
                    <Typography.Text strong>{r.card.name || '（未命名）'}</Typography.Text>
                    {r.card.aliases.length > 0 && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.card.aliases.join(' / ')}</Typography.Text>
                    )}
                  </Space>
                  <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0, fontSize: 12 }}>
                    {r.card.description}
                  </Typography.Paragraph>
                </div>
              </List.Item>
            )}
          />
        </div>
      </Space>
    )
  )

  // ===== footer 按阶段切换 =====
  let footer: React.ReactNode
  if (phase === 'config') {
    footer = [
      <Button key="cancel" onClick={onClose}>取消</Button>,
      <Button key="go" type="primary" icon={<ThunderboltOutlined />} loading={busy} onClick={genProfiles}>生成侧写</Button>,
    ]
  } else if (phase === 'profiles') {
    footer = [
      <Button key="back" onClick={() => setPhase('config')}>上一步</Button>,
      <Button key="regen" icon={<ReloadOutlined />} loading={busy} onClick={genProfiles}>重新生成侧写</Button>,
      <Button key="go" type="primary" icon={<ThunderboltOutlined />} onClick={startBatch}>开始批量生成</Button>,
    ]
  } else if (phase === 'generating') {
    footer = [<Button key="stop" danger icon={<StopOutlined />} onClick={stop}>停止</Button>]
  } else {
    footer = [
      <Button key="back" onClick={() => setPhase('profiles')}>返回侧写</Button>,
      <Button key="close" onClick={onClose}>关闭</Button>,
      <Button key="save" type="primary" disabled={checkedCount === 0} onClick={saveSelected}>保存勾选（{checkedCount}）</Button>,
    ]
  }

  return (
    <Modal title="批量 AI 生成设定" open width={860} onCancel={onClose} footer={footer} maskClosable={false}>
      <Divider style={{ margin: '4px 0 12px' }} />
      <Spin spinning={busy && phase === 'config'} tip="生成侧写中…">
        {phase === 'config' && configView}
        {phase === 'profiles' && profilesView}
        {phase === 'generating' && generatingView}
        {phase === 'review' && reviewView}
      </Spin>
      {providers.filter((p) => p.nodeType === 'text' && p.enabled).length === 0 && (
        <Typography.Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          暂无可用文本节点，请先在「系统设置」启用文本节点
        </Typography.Text>
      )}
    </Modal>
  )
}
