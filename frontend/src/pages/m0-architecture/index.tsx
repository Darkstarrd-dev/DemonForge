import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Grid,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  DeploymentUnitOutlined,
  ThunderboltOutlined,
  CheckOutlined,
  ApartmentOutlined,
  OrderedListOutlined,
} from '@ant-design/icons'
import { useAppStore, genId } from '../../store/appStore'
import { generateArch, generateBlueprint, generateArchInput } from '../../services/api'
import type { OutlineNode } from '../../services/types'
import { parseArchitecture, parseBlueprint, type ParsedBlueprintChapter } from './parse'

const ARCH_FIELDS: {
  key: 'seed' | 'characterDynamics' | 'worldBuilding' | 'plotStructure'
  label: string
  /** placeholder：作为「引导用的模板」，空值时提示填写方向；不影响实际值 */
  template: string
}[] = [
  {
    key: 'seed',
    label: '核心种子',
    template:
      '当[主角]遭遇[核心事件]，必须[关键行动]，否则[灾难后果]……\n（单句公式概括故事本质，需包含显性冲突与潜在危机）',
  },
  {
    key: 'characterDynamics',
    label: '角色动力学',
    template:
      '主角A：表面追求… / 深层渴望… / 灵魂需求…\n对手B：表面… / 深层… / 灵魂…\n（3–6 个核心角色，附驱动力三角与关系网：冲突 / 合作 / 背叛）',
  },
  {
    key: 'worldBuilding',
    label: '世界观',
    template:
      '物理维度：空间 / 时间 / 法则……\n社会维度：权力结构 / 文化禁忌……\n隐喻维度：视觉符号 / 主题映射……',
  },
  {
    key: 'plotStructure',
    label: '三幕式情节',
    template:
      '第一幕（触发）：日常打破 → 关键事件 → 错误抉择\n第二幕（对抗）：压力升级 → 虚假胜利 → 灵魂黑夜\n第三幕（解决）：代价显现 → 终极抉择 → 开放结局',
  },
]

export default function M0ArchitecturePage() {
  const screens = Grid.useBreakpoint()
  const { message, modal } = App.useApp()
  const providers = useAppStore((s) => s.providers)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const architectures = useAppStore((s) => s.architectures)
  const outline = useAppStore((s) => s.outline)
  const setState = useAppStore((s) => s.setState)

  // ── 架构区输入态 ──
  const [topic, setTopic] = useState('')
  const [genre, setGenre] = useState('')
  const [chapters, setChapters] = useState<number>(30)
  const [guidance, setGuidance] = useState('')
  const [archNodeId, setArchNodeId] = useState<string | null>(null)

  const [genArchText, setGenArchText] = useState('')
  const [genArching, setGenArching] = useState(false)
  const [editingArch, setEditingArch] = useState({
    seed: '',
    characterDynamics: '',
    worldBuilding: '',
    plotStructure: '',
  })

  // ── 蓝图区输入态 ──
  const [blueprintNodeId, setBlueprintNodeId] = useState<string | null>(null)
  const [genBpText, setGenBpText] = useState('')
  const [genBping, setGenBping] = useState(false)
  const [blueprintChapters, setBlueprintChapters] = useState<ParsedBlueprintChapter[]>([])

  // 当前页新生成、已采纳的 bookId（采纳架构后设定）
  const [createdBookId, setCreatedBookId] = useState<string | null>(null)
  const createdArch = createdBookId ? architectures.find((a) => a.bookId === createdBookId) : null

  // ── 节点选项（仅 enabled）──
  const enabledNodes = useMemo(() => providers.filter((p) => p.enabled), [providers])
  const nodeOptions = enabledNodes.map((p) => ({ value: p.id, label: `${p.name} · ${p.model}` }))

  // 默认节点：m0Arch 映射 → 首个 enabled
  const resolveArchNode = () => {
    const mapped = moduleMapping.m0Arch.nodeId
    if (mapped && enabledNodes.some((p) => p.id === mapped)) return mapped
    return enabledNodes[0]?.id ?? null
  }
  const resolveBpNode = () => {
    const mapped = moduleMapping.m0Blueprint.nodeId
    if (mapped && enabledNodes.some((p) => p.id === mapped)) return mapped
    return enabledNodes[0]?.id ?? null
  }

  const getProvider = (nodeId: string | null) => {
    if (!nodeId) return null
    const p = providers.find((x) => x.id === nodeId)
    if (!p) return null
    return { baseURL: p.baseURL, apiKey: p.apiKey?.trim() || undefined, model: p.model }
  }

  // ── 生成架构 ──
  const runArch = async () => {
    let currentTopic = topic.trim()
    let currentGenre = genre.trim()
    let currentGuidance = guidance.trim()

    if (!currentTopic) {
      const inputProv = getProvider(archNodeId ?? resolveArchNode())
      if (!inputProv) {
        message.warning('请选择生成节点（设置页配置）')
        return
      }
      setGenArching(true)
      setGenArchText('')
      const hideLoading = message.loading('正在生成创作方向…', 0)
      try {
        const result = await generateArchInput({
          ...inputProv,
          genre: currentGenre,
          chapters,
          guidance: currentGuidance,
        })
        hideLoading()
        setTopic(result.topic)
        setGenre(result.genre)
        setGuidance(result.guidance)
        currentTopic = result.topic
        currentGenre = result.genre
        currentGuidance = result.guidance
        message.success('已生成创作方向，继续生成架构…')
      } catch (e) {
        hideLoading()
        message.error(`生成创作方向失败：${e instanceof Error ? e.message : String(e)}`)
        setGenArching(false)
        return
      }
    }

    const prov = getProvider(archNodeId ?? resolveArchNode())
    if (!prov) {
      message.warning('请选择生成节点（设置页配置）')
      setGenArching(false)
      return
    }
    if (!genArching) setGenArching(true)
    if (!genArchText) setGenArchText('')
    try {
      const full = await generateArch(
        { ...prov, topic: currentTopic, genre: currentGenre, chapters, guidance: currentGuidance },
        (acc) => setGenArchText(acc),
      )
      const parsed = parseArchitecture(full)
      setEditingArch(parsed)
      message.success('架构生成完成，可在右侧编辑后采纳')
    } catch (e) {
      message.error(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenArching(false)
    }
  }

  // ── 采纳架构：新建 project 书 + 存 NovelArchitecture + 设当前作品 ──
  const adoptArch = () => {
    if (!editingArch.seed && !editingArch.characterDynamics && !editingArch.worldBuilding && !editingArch.plotStructure) {
      message.warning('架构内容为空，无法采纳')
      return
    }
    const now = new Date().toISOString()
    const bookId = genId('book')
    const archId = genId('arch')
    const title = topic.trim() || '未命名作品'
    setState({
      books: [
        ...useAppStore.getState().books,
        { id: bookId, title, type: 'project', createdAt: now },
      ],
      architectures: [
        ...useAppStore.getState().architectures,
        { id: archId, bookId, ...editingArch, updatedAt: now },
      ],
      currentBookId: bookId,
    })
    setCreatedBookId(bookId)
    // 蓝图区节点默认对齐 m0Blueprint 映射
    setBlueprintNodeId(resolveBpNode())
    message.success(`已采纳架构并新建作品《${title}》，可继续生成章节蓝图`)
  }

  // ── 生成蓝图 ──
  const runBlueprint = async () => {
    if (!createdArch) {
      message.warning('请先采纳架构')
      return
    }
    const prov = getProvider(blueprintNodeId ?? resolveBpNode())
    if (!prov) {
      message.warning('请选择生成节点')
      return
    }
    const architectureText = [
      '## 核心种子',
      createdArch.seed,
      '## 角色动力学',
      createdArch.characterDynamics,
      '## 世界观',
      createdArch.worldBuilding,
      '## 三幕式情节',
      createdArch.plotStructure,
    ].join('\n')

    const bookOutline = outline.filter((o) => o.bookId === createdBookId).sort((a, b) => a.order - b.order)
    const startChapter = bookOutline.length > 0 ? bookOutline[bookOutline.length - 1].order + 1 : 1
    const existingDirectory =
      bookOutline.length > 0
        ? bookOutline.map((o) => `第${o.order}章 ${o.title}（${o.summary}）`).join('\n')
        : undefined

    setGenBping(true)
    setGenBpText('')
    try {
      const full = await generateBlueprint(
        { ...prov, architecture: architectureText, existingDirectory, totalChapters: chapters, startChapter },
        (acc) => setGenBpText(acc),
      )
      const parsed = parseBlueprint(full)
      if (parsed.length === 0) {
        message.warning('未能从输出中解析出章节，请检查模型输出或重试')
      } else {
        setBlueprintChapters(parsed)
        message.success(`解析出 ${parsed.length} 章，预览后可写入大纲`)
      }
    } catch (e) {
      message.error(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGenBping(false)
    }
  }

  // ── 采纳蓝图：写入大纲（新书空则写，已有则追加）──
  const adoptBlueprint = (append: boolean) => {
    if (!createdBookId || blueprintChapters.length === 0) {
      message.warning('无蓝图可采纳')
      return
    }
    const bookOutline = outline.filter((o) => o.bookId === createdBookId).sort((a, b) => a.order - b.order)
    if (append && bookOutline.length === 0) {
      message.warning('当前大纲为空，无需「继续生成」，请用「写入大纲」')
      return
    }
    if (!append && bookOutline.length > 0) {
      modal.confirm({
        title: '目标书大纲非空',
        content: '蓝图仅当大纲为空时写入。当前大纲已有节点，将忽略本次写入（如需追加请用「继续生成后续章节」）。',
        okText: '知道了',
        cancelText: '取消',
        onOk: () => {},
      })
      return
    }
    const newNodes: OutlineNode[] = blueprintChapters.map((c) => ({
      id: genId('ol'),
      bookId: createdBookId,
      volume: '正文卷',
      title: c.title,
      summary: c.summary,
      order: c.order,
      positioning: c.positioning,
      role: c.role,
      suspenseDensity: c.suspenseDensity,
      foreshadow: c.foreshadow,
      twistLevel: c.twistLevel,
    }))
    setState({ outline: append ? [...useAppStore.getState().outline, ...newNodes] : newNodes })
    message.success(`已${append ? '追加' : '写入'} ${newNodes.length} 个大纲节点，可到 M4 章节生成使用`)
    setBlueprintChapters([])
  }

  const twistStars = (n?: number) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—')

  return (
    <div style={{ maxWidth: '100%', width: '100%' }} data-slot="m0-architecture">
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Alert
        data-slot="alert"
        type="info"
        showIcon
        message="M0 立项 · 架构"
        description="从一个点子推导小说架构（雪花法四步）与章节蓝图（节奏化目录），打通「点子 → 架构 → 蓝图 → 大纲」闭环。所有 AI 产出均为候选，可编辑后采纳。"
      />

      <Steps
        data-slot="steps"
        size="small"
        current={createdArch ? (blueprintChapters.length ? 2 : 1) : 0}
        items={[
          { title: '生成架构' },
          { title: '采纳架构（建新书）' },
          { title: '生成并写入蓝图' },
        ]}
      />

      <Row gutter={[16, 16]}>
        {/* 左：输入 + 架构编辑 */}
        <Col xs={24} lg={9} style={{ marginBottom: screens.lg ? 0 : 16 }}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card
              data-slot="arch-input"
              size="small"
              title={
                <span>
                  <ApartmentOutlined /> 架构输入
                </span>
              }
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Input data-slot="input-topic" placeholder="主题（如：落魄剑客卷入皇权之争）" value={topic} onChange={(e) => setTopic(e.target.value)} />
                <Input data-slot="input-genre" placeholder="类型（如：武侠/悬疑/科幻）" value={genre} onChange={(e) => setGenre(e.target.value)} />
                <Space>
                  <span style={{ color: '#888' }}>预估章节数</span>
                  <InputNumber data-slot="input-chapters" min={1} max={500} value={chapters} onChange={(v) => setChapters(Number(v) || 30)} style={{ width: 100 }} />
                </Space>
                <Input.TextArea
                  data-slot="input-guidance"
                  placeholder="核心梗概 / 指导（可选）"
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  autoSize={{ minRows: 2 }}
                />
                <Select
                  data-slot="select-node"
                  style={{ width: '100%' }}
                  placeholder="生成节点（默认取设置页 M0 架构设计映射）"
                  value={archNodeId ?? resolveArchNode()}
                  onChange={(v) => setArchNodeId(v)}
                  options={nodeOptions}
                  notFoundContent="无可用节点，请到设置页启用"
                />
                <Button
                  data-slot="btn-generate"
                  type="primary"
                  block
                  icon={<ThunderboltOutlined />}
                  loading={genArching}
                  onClick={runArch}
                >
                  {genArching ? '生成中…' : '生成架构'}
                </Button>
              </Space>
            </Card>

            <Card
              data-slot="arch-editor"
              size="small"
              title={
                <span>
                  <CheckOutlined /> 架构（手填 / 编辑 AI 产出）
                </span>
              }
              extra={
                <Button data-slot="btn-adopt" type="primary" size="small" icon={<DeploymentUnitOutlined />} onClick={adoptArch} disabled={!!createdArch}>
                  {createdArch ? '已采纳' : '采纳架构（建新书）'}
                </Button>
              }
            >
              <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 8, fontSize: 12 }}>
                {createdArch
                  ? '已采纳为作品架构。'
                  : '可直接在下方各框手填，也可点上方「生成架构」由 AI 填入后再编辑；至少填写一项即可采纳。'}
              </Typography.Paragraph>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {ARCH_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      {f.label}
                    </Typography.Text>
                    <Input.TextArea
                      data-slot={`editor-${f.key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
                      value={editingArch[f.key]}
                      onChange={(e) => setEditingArch({ ...editingArch, [f.key]: e.target.value })}
                      placeholder={f.template}
                      autoSize={{ minRows: 2, maxRows: 8 }}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                ))}
                <Button
                  data-slot="btn-fill-template"
                  size="small"
                  type="link"
                  disabled={!!createdArch}
                  onClick={() => {
                    const filled: Record<string, string> = {}
                    for (const f of ARCH_FIELDS)
                      filled[f.key] = editingArch[f.key].trim() ? editingArch[f.key] : f.template
                    setEditingArch(filled as typeof editingArch)
                    message.info('已为空字段填入引导模板，可在其上直接改写')
                  }}
                >
                  填入引导模板
                </Button>
              </Space>
            </Card>
          </Space>
        </Col>

        {/* 右：流式输出 / 蓝图区 */}
        <Col xs={24} lg={15}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card
              data-slot="arch-output"
              size="small"
              title="架构生成（流式）"
              extra={createdArch ? <Tag color="green">已采纳 · 作品已建</Tag> : undefined}
            >
              <div data-slot="stream-text" className="stream-pane" style={{ height: genArching ? 320 : 'auto', minHeight: 120 }}>
                {genArchText || '（点击「生成架构」后，流式输出将显示于此）'}
              </div>
            </Card>

            {createdArch && (
              <Card
                data-slot="blueprint"
                size="small"
                title={
                  <span>
                    <OrderedListOutlined /> 章节蓝图
                  </span>
                }
              >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Space wrap>
                    <span style={{ color: '#888' }}>蓝图生成节点</span>
                    <Select
                      data-slot="select-node"
                      style={{ minWidth: 240 }}
                      value={blueprintNodeId ?? resolveBpNode()}
                      onChange={(v) => setBlueprintNodeId(v)}
                      options={nodeOptions}
                      notFoundContent="无可用节点"
                    />
                    <Button data-slot="btn-generate" type="primary" icon={<ThunderboltOutlined />} loading={genBping} onClick={runBlueprint}>
                      {genBping ? '生成中…' : '生成蓝图'}
                    </Button>
                  </Space>

                  {genBping && (
                    <div data-slot="stream-text" className="stream-pane" style={{ height: 280 }}>
                      {genBpText || '等待生成…'}
                    </div>
                  )}

                  {blueprintChapters.length > 0 && (
                    <>
                      <Table<ParsedBlueprintChapter>
                        data-slot="table-preview"
                        size="small"
                        rowKey="order"
                        dataSource={blueprintChapters}
                        pagination={false}
                        scroll={{ x: 'max-content', y: 320 }}
                        columns={[
                          { title: '#', dataIndex: 'order', width: 48 },
                          { title: '标题', dataIndex: 'title', width: 140 },
                          { title: '定位', dataIndex: 'positioning', width: 90 },
                          { title: '核心作用', dataIndex: 'role', width: 100 },
                          { title: '悬念', dataIndex: 'suspenseDensity', width: 70 },
                          { title: '颠覆', key: 'twist', width: 70, render: (_v, r) => twistStars(r.twistLevel) },
                          { title: '简述', dataIndex: 'summary' },
                        ]}
                      />
                      <Space>
                        <Button data-slot="btn-write" type="primary" icon={<CheckOutlined />} onClick={() => adoptBlueprint(false)}>
                          写入大纲
                        </Button>
                        <Button data-slot="btn-append" onClick={() => adoptBlueprint(true)}>继续生成后续章节（追加）</Button>
                      </Space>
                    </>
                  )}
                </Space>
              </Card>
            )}
          </Space>
        </Col>
      </Row>
    </Space>
    </div>
  )
}
