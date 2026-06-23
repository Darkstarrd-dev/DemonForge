import { useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  theme,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  CloudDownloadOutlined,
  DownloadOutlined,
  DownOutlined,
  UploadOutlined,
  UpOutlined,
} from '@ant-design/icons'
import {
  genId,
  pushSettingsNow,
  pushStoreNowChecked,
  reloadStoreFromBackend,
  settingsPayload,
  useAppStore,
} from '../../store/appStore'
import { testProvider, getDefaultPrompt } from '../../services/api'
import type { ModuleKey, ProviderNode, ProviderNodeType, SplitPattern } from '../../services/types'
import {
  buildBundle,
  downloadBundle,
  parseBundle,
  readFileAsText,
  summarizeBusiness,
  backupFilename,
  type BackupBundle,
  type BundleKind,
} from '../../utils/backup'

const MODULE_LABELS: Record<ModuleKey, string> = {
  m0Arch: 'M0 架构设计',
  m0Blueprint: 'M0 章节蓝图',
  m1Clean: 'M1 文本清理',
  m2Extract: 'M2 设定提取',
  m3Simulate: 'M3 角色推演',
  m4Generate: 'M4 章节生成',
  m5Check: 'M5 一致性检查',
  m5Finalize: 'M5 定稿归档',
  embedding: 'Embedding 向量',
}

/**
 * 并发测试用单次探测：向后端 /api/llm/clean 发真实负载请求（15s 超时），
 * 用于判定该节点能否成功响应一次（吞吐量探测），返回 {ok, error}。
 */
async function probeOnce(
  node: Pick<ProviderNode, 'baseURL' | 'apiKey' | 'model'>,
  content: string,
  systemPrompt: string,
): Promise<{ ok: boolean; error?: string }> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 15000)
  try {
    const res = await fetch('/api/llm/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseURL: node.baseURL,
        apiKey: node.apiKey,
        model: node.model,
        content,
        systemPrompt,
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ''}` }
    }
    if (!res.body) return { ok: false, error: '响应无 body' }
    // 读流至结束即视为成功（不关心内容）
    const reader = res.body.getReader()
    for (;;) {
      const { done } = await reader.read()
      if (done) break
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

// ======== 内部组件：Tab 渲染函数 ========

function NodesTabContent(props: {
  nodeTypeFilter: ProviderNodeType
  setNodeTypeFilter: (v: ProviderNodeType) => void
  batchTesting: boolean
  runBatchTest: () => void
  openEdit: (node?: ProviderNode) => void
  groupedProviders: Record<string, { baseURL: string; groupName: string; nodes: ProviderNode[] }>
  nodeGroupExpanded: Record<string, boolean>
  toggleGroup: (key: string) => void
  columns: any[]
  providers: ProviderNode[]
  moduleMapping: Record<string, any>
  MODULE_LABELS: Record<ModuleKey, string>
  setState: any
  draftPrompt: string
  setDraftPrompt: (v: string) => void
  loadingPrompt: boolean
  setLoadingPrompt: (v: boolean) => void
  getDefaultPrompt: () => Promise<string>
  m1SystemPrompt: string
  draftTestText: string
  setDraftTestText: (v: string) => void
  m1TestText: string
  token: any
}) {
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* Provider 节点池 Card */}
          <Card
            title="Provider 节点池"
            extra={
              <Space>
                <Segmented
                  value={props.nodeTypeFilter}
                  onChange={(v) => props.setNodeTypeFilter(v as ProviderNodeType)}
                  options={[
                    { value: 'text', label: '文本生成' },
                    { value: 'image', label: '文生图' },
                  ]}
                />
                <Button loading={props.batchTesting} onClick={props.runBatchTest}>
                  批量测试
                </Button>
                <Button type="primary" onClick={() => props.openEdit()}>
                  新增节点
                </Button>
              </Space>
            }
          >
            {/* 节点池分组渲染 - 复用原逻辑 */}
            {Object.entries(props.groupedProviders).map(([groupKey, { baseURL, groupName, nodes }]) => {
              const isExpanded = props.nodeGroupExpanded[groupKey] ?? true
              return (
                <div key={groupKey} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--ant-color-fill-quaternary)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      marginBottom: 8,
                    }}
                    onClick={() => props.toggleGroup(groupKey)}
                  >
                    <Space>
                      {isExpanded ? <DownOutlined style={{ fontSize: 12 }} /> : <UpOutlined style={{ fontSize: 12, transform: 'rotate(180deg)' }} />}
                      <Typography.Text strong style={{ fontSize: 13 }}>{groupName}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{baseURL}</Typography.Text>
                      <Tag color="blue">{nodes.length} 个节点</Tag>
                    </Space>
                  </div>
                  {isExpanded && (
                    <Table
                      rowKey="id"
                      columns={props.columns}
                      dataSource={nodes}
                      pagination={false}
                      size="middle"
                      style={{ marginBottom: 0 }}
                      scroll={{ x: 750 }}
                    />
                  )}
                </div>
              )
            })}
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              统一 OpenAI 兼容格式；测试经本地后端 Provider 抽象层调用（/api/llm/test → GET /v1/models）。节点选择策略（最久未用 + 最少连接、429 冷却恢复）待后续完善。
            </Typography.Paragraph>
          </Card>

          {/* 模块映射 Card - 精简版，原逻辑保持 */}
          <Card title="模块 → 模型映射（各模块指定节点，模型随节点配置）">
            <Table
              rowKey="key"
              pagination={false}
              size="middle"
              scroll={{ x: 800 }}
              dataSource={(Object.keys(props.MODULE_LABELS) as ModuleKey[]).map((key) => ({
                key,
                label: props.MODULE_LABELS[key],
                ...props.moduleMapping[key],
              }))}
              columns={[
                { title: '模块', dataIndex: 'label', width: 160, fixed: 'left' as const },
                {
                  title: '节点（模型随节点配置）',
                  dataIndex: 'nodeId',
                  width: 300,
                  render: (v: string | null, row: { key: ModuleKey }) => (
                    <Select
                      style={{ minWidth: 200, width: '100%' }}
                      value={v ?? undefined}
                      placeholder="选择节点"
                      options={props.providers
                        .filter((p) => p.nodeType !== 'image')
                        .map((p) => ({ value: p.id, label: `${p.name} · ${p.model || '（未设模型）'}` }))}
                      onChange={(nodeId) => {
                        props.setState({
                          moduleMapping: {
                            ...props.moduleMapping,
                            [row.key]: { nodeId },
                          },
                        })
                      }}
                    />
                  ),
                },
                {
                  title: '将使用模型',
                  key: 'model',
                  width: 200,
                  render: (_: unknown, row: any) => {
                    const node = props.providers.find((p) => p.id === row.nodeId)
                    return node?.model ? <Tag>{node.model}</Tag> : <Typography.Text type="secondary">—</Typography.Text>
                  },
                },
              ]}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              模型名在「Provider 节点池」里为每个节点统一配置；此处仅选择节点。如需某模块用不同模型，请新建一个配置了该模型的节点。
            </Typography.Paragraph>
          </Card>

          {/* M1 清理提示词 Card */}
          <Card
            title="M1 清理提示词（默认）"
            extra={
              <Space>
                <Button
                  loading={props.loadingPrompt}
                  onClick={async () => {
                    props.setLoadingPrompt(true)
                    try {
                      const p = await props.getDefaultPrompt()
                      props.setDraftPrompt(p)
                    } finally {
                      props.setLoadingPrompt(false)
                    }
                  }}
                >
                  载入内置默认
                </Button>
                <Button disabled={props.draftPrompt === props.m1SystemPrompt} onClick={() => props.setState({ m1SystemPrompt: props.draftPrompt })}>
                  保存
                </Button>
                <Button disabled={!props.m1SystemPrompt} onClick={() => { props.setDraftPrompt(''); props.setState({ m1SystemPrompt: '' }) }}>
                  清空（用内置）
                </Button>
              </Space>
            }
          >
            <Input.TextArea
              value={props.draftPrompt}
              onChange={(e) => props.setDraftPrompt(e.target.value)}
              autoSize={{ minRows: 6, maxRows: 16 }}
              placeholder="留空则使用后端内置默认提示词。点「载入内置默认」可查看并在此基础上修改。"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              {props.m1SystemPrompt ? `已保存自定义提示词（${props.m1SystemPrompt.length} 字）。清理时优先使用它。` : '当前为空——清理时使用后端内置默认提示词。'}
              {' M1 第三步可再为单次任务临时覆盖。'}
            </Typography.Paragraph>
          </Card>

          {/* 测试文本 Card - 精简版 */}
          <Card title="测试文本" extra={
            <Space>
              <Button onClick={() => props.setState({ m1TestText: props.draftTestText })} disabled={props.draftTestText === props.m1TestText}>保存</Button>
              <Button onClick={() => props.setState({ m1TestText: '' })}>清空</Button>
            </Space>
          }>
            <Input.TextArea
              value={props.draftTestText}
              onChange={(e) => props.setDraftTestText(e.target.value)}
              autoSize={{ minRows: 6, maxRows: 16 }}
              placeholder="用于「测试」按钮与并发测试的文本"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Card>
        </Space>
      </div>
    </div>
  )
}

function AdvancedTabContent(props: {
  splitPatterns: SplitPattern[]
  openPatternEdit: (p?: SplitPattern) => void
  deletePattern: (p: SplitPattern) => void
  resetSplitPatterns: () => void
  draftDir: string
  setDraftDir: (v: string) => void
  assetDir: string
  applyingDir: boolean
  applyAssetDir: () => void
}) {
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="章节检测模式池" extra={
            <Space>
              <Button onClick={() => props.resetSplitPatterns()}>恢复默认</Button>
              <Button type="primary" onClick={() => props.openPatternEdit()}>新增模式</Button>
            </Space>
          }>
            <Table
              rowKey="key"
              pagination={false}
              size="middle"
              dataSource={props.splitPatterns}
              columns={[
                { title: '名称', dataIndex: 'label', width: 200 },
                { title: '正则表达式', dataIndex: 'regex', ellipsis: true },
                { title: '内置', dataIndex: 'builtin', width: 80, render: (v: boolean) => v ? <Tag>是</Tag> : <Tag>否</Tag> },
                {
                  title: '操作', key: 'actions', width: 150, render: (_: unknown, row: SplitPattern) => (
                    <Space size="small">
                      <Button size="small" onClick={() => props.openPatternEdit(row)}>编辑</Button>
                      <Button size="small" danger onClick={() => props.deletePattern(row)} disabled={row.key === 'custom'}>删除</Button>
                    </Space>
                  )
                }
              ]}
            />
          </Card>

          <Card title="资产目录" extra={
            <Button loading={props.applyingDir} onClick={props.applyAssetDir} disabled={props.draftDir === props.assetDir}>
              应用
            </Button>
          }>
            <Input
              value={props.draftDir}
              onChange={(e) => props.setDraftDir(e.target.value)}
              placeholder="留空使用默认目录（server/src/data/）"
              style={{ marginBottom: 8 }}
            />
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              当前生效：{props.assetDir || '（默认）'}
            </Typography.Paragraph>
          </Card>
        </Space>
      </div>
    </div>
  )
}

function GeneralTabContent(props: {
  theme: 'light' | 'dark'
  setState: any
  showMenuBar: boolean
  pushSettingsNow: () => void
  enable4KScale: boolean
}) {
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="通用设置">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <Typography.Text>主题</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Segmented
                    value={props.theme}
                    onChange={(v) => props.setState({ theme: v })}
                    options={[
                      { value: 'light', label: '🌞 浅色' },
                      { value: 'dark', label: '🌙 深色' },
                    ]}
                  />
                </div>
              </div>
              <div>
                <Space>
                  <Typography.Text>显示菜单栏</Typography.Text>
                  <Switch checked={props.showMenuBar} onChange={(v) => props.setState({ showMenuBar: v })} />
                </Space>
              </div>
              <div>
                <Space>
                  <Typography.Text>4K 基准缩放</Typography.Text>
                  <Switch checked={props.enable4KScale} onChange={(v) => props.setState({ enable4KScale: v })} />
                  <Typography.Text type="secondary">（以 3840px 为基准，窗口宽度变化时整体等比缩放）</Typography.Text>
                </Space>
              </div>
            </Space>
          </Card>
        </Space>
      </div>
    </div>
  )
}

function BackupTabContent(props: {
  exportRedact: boolean
  setExportRedact: (v: boolean) => void
  handleExport: (kind: 'settings' | 'full') => void
  handleImportFile: (file: File) => Promise<boolean>
  importPreview: any
  setImportPreview: (v: any) => void
  confirmImportSettings: (bundle: any, replaceBusiness: boolean) => void
  clearBusinessThenImport: (bundle: any) => void
  importBusy: boolean
}) {
  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 46px)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="导出" extra={
            <Checkbox checked={props.exportRedact} onChange={(e) => props.setExportRedact(e.target.checked)}>
              脱敏 API Key
            </Checkbox>
          }>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={() => props.handleExport('settings')}>
                导出设置
              </Button>
              <Button icon={<CloudDownloadOutlined />} onClick={() => props.handleExport('full')}>
                导出完整备份
              </Button>
            </Space>
          </Card>

          <Card title="导入">
            <Upload beforeUpload={props.handleImportFile} showUploadList={false} accept=".json">
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Card>

          {props.importPreview && (
            <Modal
              open
              title={`导入预览：${props.importPreview.filename}`}
              onCancel={() => props.setImportPreview(null)}
              footer={[
                <Button key="cancel" onClick={() => props.setImportPreview(null)}>取消</Button>,
                <Button
                  key="import"
                  type="primary"
                  loading={props.importBusy}
                  onClick={() => props.confirmImportSettings(props.importPreview.bundle, props.importPreview.bundle.kind === 'full')}
                >
                  确认导入
                </Button>,
                props.importPreview.bundle.kind === 'full' && (
                  <Button
                    key="clear"
                    danger
                    loading={props.importBusy}
                    onClick={() => props.clearBusinessThenImport(props.importPreview.bundle)}
                  >
                    清空并导入
                  </Button>
                ),
              ]}
            >
              {props.importPreview.warnings.length > 0 && (
                <Alert type="warning" message="警告" description={props.importPreview.warnings.join('; ')} style={{ marginBottom: 16 }} />
              )}
              <Typography.Paragraph>
                类型：{props.importPreview.bundle.kind === 'full' ? '完整备份' : '设置'}
              </Typography.Paragraph>
            </Modal>
          )}
        </Space>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const providers = useAppStore((s) => s.providers)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const m1TestText = useAppStore((s) => s.m1TestText)
  const assetDir = useAppStore((s) => s.assetDir)
  const showMenuBar = useAppStore((s) => s.showMenuBar)
  const splitPatterns = useAppStore((s) => s.splitPatterns)
  const setSplitPatterns = useAppStore((s) => s.setSplitPatterns)
  const resetSplitPatterns = useAppStore((s) => s.resetSplitPatterns)
  const setState = useAppStore((s) => s.setState)
  const [editing, setEditing] = useState<ProviderNode | null>(null)
  const [nodeTypeFilter, setNodeTypeFilter] = useState<ProviderNodeType>('text')
  const [batchTesting, setBatchTesting] = useState(false)
  const [concurrencyTesting, setConcurrencyTesting] = useState<string | null>(null)
  const [concurrencyResult, setConcurrencyResult] = useState<{
    node: ProviderNode
    log: string[]
    maxConcurrency?: number
    intervalSec?: number
    error?: string
  } | null>(null)
  const [draftPrompt, setDraftPrompt] = useState<string>(m1SystemPrompt)
  const [draftTestText, setDraftTestText] = useState<string>(m1TestText)
  const [draftDir, setDraftDir] = useState<string>(assetDir)
  const [applyingDir, setApplyingDir] = useState(false)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [testResult, setTestResult] = useState<{
    node: ProviderNode
    ok: boolean
    models: string[]
    error?: string
  } | null>(null)
  const [form] = Form.useForm<ProviderNode>()
  // 章节检测模式编辑
  const [editingPattern, setEditingPattern] = useState<SplitPattern | null>(null)
  const [patternForm] = Form.useForm<SplitPattern>()
  // 需求8：节点池获取模型多选批量添加
  const [fetchingModels, setFetchingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [modelSelectOpen, setModelSelectOpen] = useState(false)
  // 需求9：节点测试改为真实调用
  const [testingNode, setTestingNode] = useState<ProviderNode | null>(null)
  const [testStreaming, setTestStreaming] = useState(false)
  const [testStreamLeft, setTestStreamLeft] = useState('')
  const [testStreamRight, setTestStreamRight] = useState('')
  // 设置导入导出 + 完整备份恢复
  const [exportRedact, setExportRedact] = useState(false)
  const [importPreview, setImportPreview] = useState<{
    bundle: BackupBundle
    warnings: string[]
    filename: string
  } | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  // 节点池分组折叠状态：从 store 读取（持久化）
  const nodeGroupExpanded = useAppStore((s) => s.nodeGroupExpanded)

  const openEdit = (node?: ProviderNode) => {
    const target: ProviderNode = node ?? {
      id: genId('prov'),
      name: '',
      nodeType: nodeTypeFilter,
      baseURL: '',
      apiKey: '',
      model: '',
      enabled: true,
      lastTestResult: null,
      maxConcurrency: 2,
      batchChars: 10000,
      intervalSec: 0,
      usageLimitEnabled: false,
      usageLimit: 0,
      usageLeft: 0,
      usageResetDate: '',
    }
    setEditing(target)
    form.setFieldsValue(target)
  }

  /** 需求8：获取模型列表 */
  const fetchModels = async () => {
    const baseURL = form.getFieldValue('baseURL')
    const apiKey = form.getFieldValue('apiKey')
    if (!baseURL) {
      message.warning('请先填写 Base URL')
      return
    }
    setFetchingModels(true)
    try {
      const result = await testProvider({ baseURL, apiKey: apiKey || '', model: '' })
      if (result.ok && result.models.length > 0) {
        setAvailableModels(result.models)
        setSelectedModels([])
        setModelSelectOpen(true)
      } else {
        message.error(result.error || '获取模型列表失败')
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '请求失败')
    } finally {
      setFetchingModels(false)
    }
  }

  /** 需求8：批量添加节点 */
  const batchAddNodes = () => {
    if (selectedModels.length === 0) {
      message.warning('请至少选择一个模型')
      return
    }
    const base = form.getFieldsValue()
    const baseName = base.name || 'Node'
    const newNodes: ProviderNode[] = selectedModels.map((model) => ({
      ...base,
      id: genId('prov'),
      name: `${baseName} (${model})`,
      model,
      enabled: true,
      lastTestResult: null,
      usageLeft: base.usageLimitEnabled ? base.usageLimit ?? 0 : 0,
      usageResetDate: '',
    }))
    setState({ providers: [...providers, ...newNodes] })
    message.success(`已添加 ${newNodes.length} 个节点`)
    setModelSelectOpen(false)
    setEditing(null)
  }

  /** 需求9：真实调用测试 */
  const startRealTest = async () => {
    if (!testingNode) return
    setTestStreaming(true)
    setTestStreamLeft(m1TestText)
    setTestStreamRight('')

    try {
      const res = await fetch('/api/llm/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseURL: testingNode.baseURL,
          apiKey: testingNode.apiKey,
          model: testingNode.model,
          content: m1TestText,
          systemPrompt: m1SystemPrompt,
        }),
      })

      if (!res.ok) {
        message.error(`测试失败：HTTP ${res.status}`)
        setTestStreaming(false)
        return
      }
      if (!res.body) {
        message.error('响应无 body')
        setTestStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''

      for (;;) {
        const { done, value } = await reader.read()
        const text = value ? decoder.decode(value, { stream: !done }) : ''
        buffer += text
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const evt of events) {
          if (!evt.trim()) continue
          let data = ''
          for (const line of evt.split('\n')) {
            if (line.startsWith('data:')) data += line.slice(5).trim()
          }
          if (!data) continue
          const parsed = JSON.parse(data) as { delta?: string; text?: string }
          acc += parsed.delta ?? parsed.text ?? ''
          setTestStreamRight(acc)
        }
        if (done) break
      }

      message.success('测试完成')
    } catch (e) {
      message.error(`测试异常：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTestStreaming(false)
    }
  }

  /** 复制节点：新 id，名称按已有同名编号递增（X → X(2) → X(3)） */
  const duplicateNode = (src: ProviderNode) => {
    const base = src.name.replace(/\s*\(\d+\)$/, '')
    const sameBase = providers.filter((p) => p.name.replace(/\s*\(\d+\)$/, '') === base)
    const maxNum = sameBase.reduce((m, p) => {
      const mt = p.name.match(/\((\d+)\)$/)
      return Math.max(m, mt ? Number(mt[1]) : 1)
    }, 1)
    const next: ProviderNode = {
      ...src,
      id: genId('prov'),
      name: `${base} (${maxNum + 1})`,
      enabled: src.enabled,
      lastTestResult: null,
      // 次数限制：复制后视为新额度起始（不复制旧剩余）
      usageLeft: src.usageLimitEnabled ? src.usageLimit ?? 0 : 0,
      usageResetDate: '',
    }
    setState({ providers: [...providers, next] })
    message.success(`已复制为「${next.name}」`)
  }

  const saveEdit = async () => {
    const values = await form.validateFields()
    const { model, ...baseFields } = values

    // 拆分模型名（支持中英文逗号，去重，过滤空串）
    const modelList = [...new Set(
      model
        .replace(/，/g, ',')
        .split(',')
        .map((m: string) => m.trim())
        .filter((m: string) => m.length > 0)
    )]

    if (modelList.length === 0) {
      message.error('请至少输入一个模型名')
      return
    }

    const exists = providers.some((p) => p.id === editing!.id)

    if (exists) {
      // 编辑模式：只使用第一个模型
      if (modelList.length > 1) {
        message.warning('编辑模式只使用第一个模型，其他已忽略')
      }
      const merged = { ...editing!, ...baseFields, model: modelList[0] } as ProviderNode
      if (merged.usageLimitEnabled) {
        const old = providers.find((p) => p.id === merged.id)
        const limitChanged = old?.usageLimit !== merged.usageLimit
        if (limitChanged || !merged.usageResetDate) {
          merged.usageLeft = merged.usageLimit ?? 0
          merged.usageResetDate = ''
        }
      }
      setState({
        providers: providers.map((p) => (p.id === merged.id ? merged : p)),
      })
      message.success('节点已保存')
    } else {
      // 新增模式：批量创建
      const newNodes: ProviderNode[] = modelList.map((m) => ({
        ...baseFields,
        id: genId('prov'),
        name: modelList.length > 1
          ? `${baseFields.name} (${m})`
          : baseFields.name,
        model: m,
        enabled: true,
        lastTestResult: null,
        maxConcurrency: baseFields.maxConcurrency ?? 2,
        batchChars: baseFields.batchChars ?? 10000,
        intervalSec: baseFields.intervalSec ?? 0,
        usageLimitEnabled: baseFields.usageLimitEnabled ?? false,
        usageLimit: baseFields.usageLimit ?? 0,
        usageLeft: baseFields.usageLimitEnabled ? baseFields.usageLimit ?? 0 : 0,
        usageResetDate: '',
      }))
      setState({ providers: [...providers, ...newNodes] })
      message.success(`已添加 ${newNodes.length} 个节点`)
    }

    setEditing(null)
    form.resetFields()
  }

  /** 批量测试当前 Tab 且 enabled 的节点连通性（并发上限 4） */
  const runBatchTest = async () => {
    const targets = providers.filter((p) => p.nodeType === nodeTypeFilter && p.enabled)
    if (!targets.length) {
      message.warning('当前类型没有已启用的节点')
      return
    }
    setBatchTesting(true)
    let done = 0
    let okCount = 0
    const CONCURRENCY = 4
    const idx = { i: 0 }
    const runOne = async (node: ProviderNode) => {
      const result = await testProvider({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model })
      setState({
        providers: useAppStore
          .getState()
          .providers.map((p) => (p.id === node.id ? { ...p, lastTestResult: result.ok ? 'ok' : 'fail' } : p)),
      })
      done += 1
      if (result.ok) okCount += 1
      message.info({ content: `批量测试进度：${done}/${targets.length}`, key: 'batch-test-progress' })
    }
    const workers: Promise<void>[] = []
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(
        (async () => {
          while (idx.i < targets.length) {
            const node = targets[idx.i++]
            await runOne(node)
          }
        })(),
      )
    }
    await Promise.all(workers)
    setBatchTesting(false)
    message.success(`批量测试完成：${okCount}/${targets.length} 正常`)
  }

  /** 在 providers 全量数组里交换两个节点位置（保持其他节点不动） */
  const moveNode = (nodeId: string, dir: -1 | 1) => {
    const list = providers.filter((p) => p.nodeType === nodeTypeFilter)
    const idxInList = list.findIndex((p) => p.id === nodeId)
    if (idxInList < 0) return
    const swapWith = list[idxInList + dir]
    if (!swapWith) return
    const aIdx = providers.findIndex((p) => p.id === nodeId)
    const bIdx = providers.findIndex((p) => p.id === swapWith.id)
    if (aIdx < 0 || bIdx < 0) return
    const next = [...providers]
    ;[next[aIdx], next[bIdx]] = [next[bIdx], next[aIdx]]
    setState({ providers: next })
  }

  /** 并发测试：纯前端二分探测该节点可同时接受几个任务，并估算请求间隔 */
  const runConcurrencyTest = async (node: ProviderNode) => {
    setConcurrencyTesting(node.id)
    const log: string[] = []
    const push = (s: string) => {
      log.push(s)
      setConcurrencyResult({ node, log: [...log] })
    }
    // 读取测试文本和清理提示词（真实负载）
    const testText = useAppStore.getState().m1TestText || ''
    const systemPrompt = useAppStore.getState().m1SystemPrompt || ''
    try {
      // 1) 单发探测连通 + 记录单请求耗时作为间隔估算基准
      push('① 单发探测连通性...')
      const t0 = Date.now()
      const probe = await probeOnce(node, testText, systemPrompt)
      const singleLatency = Date.now() - t0
      if (!probe.ok) {
        push(`✗ 探测失败：${probe.error}`)
        setConcurrencyResult({ node, log, error: probe.error })
        setConcurrencyTesting(null)
        return
      }
      push(`✓ 连通正常，单请求耗时 ${singleLatency}ms`)

      // 2) 逐级提高并发，找出全部成功的最大 N（1→2→4→8→16）
      let bestN = 1
      const levels = [2, 4, 8, 16]
      for (const n of levels) {
        push(`② 尝试并发 ${n} 个请求...`)
        const t = Date.now()
        const results = await Promise.all(Array.from({ length: n }, () => probeOnce(node, testText, systemPrompt).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))))
        const ok = results.filter((r) => r.ok).length
        const latency = Date.now() - t
        if (ok === n) {
          bestN = n
          push(`✓ 全部成功（${ok}/${n}），耗时 ${latency}ms`)
        } else {
          push(`△ 仅成功 ${ok}/${n}，达到瓶颈，回退到 ${bestN}`)
          break
        }
      }

      // 3) 间隔估算：单请求平均耗时 / 并发数（粗略反映限速），向下取整最小 0
      const intervalSec = bestN > 0 ? Math.max(0, Math.round(singleLatency / 1000 / bestN)) : 0
      push(`③ 推荐参数：最大并发 ${bestN}，请求间隔 ${intervalSec}s`)
      setConcurrencyResult({ node, log, maxConcurrency: bestN, intervalSec })
    } catch (e) {
      push(`✗ 异常：${e instanceof Error ? e.message : String(e)}`)
      setConcurrencyResult({ node, log, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setConcurrencyTesting(null)
    }
  }

  // 切换资产目录：先同步落盘设置（await），再重载该目录数据（避免 debounce 未落地导致读旧库）
  const applyAssetDir = async () => {
    const dir = draftDir.trim()
    setApplyingDir(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetDir: dir }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        message.error(e.error || '资产目录设置失败')
        return
      }
      setState({ assetDir: dir })
      await reloadStoreFromBackend()
      message.success(dir ? `已切换资产目录：${dir}` : '已恢复默认资产目录')
    } finally {
      setApplyingDir(false)
    }
  }

  // ===== 设置导入导出 / 完整备份恢复 =====
  /** 导出（设置或完整备份）。完整备份从后端拉全量业务数据。 */
  const handleExport = async (kind: BundleKind) => {
    try {
      let business = null
      if (kind === 'full') {
        const res = await fetch('/api/store')
        if (!res.ok) {
          message.error('读取业务数据失败，无法生成完整备份')
          return
        }
        business = (await res.json()) as Record<string, unknown>
      }
      const st = useAppStore.getState()
      const bundle = buildBundle(kind, settingsPayload(st), business, exportRedact)
      downloadBundle(bundle, backupFilename(kind, exportRedact))
      message.success(`已导出${kind === 'full' ? '完整备份' : '设置'}（${exportRedact ? '已脱敏 API Key' : '含 API Key'}）`)
    } catch (e) {
      message.error(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** 读取上传文件并解析为预览。 */
  const handleImportFile = async (file: File) => {
    try {
      const text = await readFileAsText(file)
      const result = parseBundle(text)
      if (result.fatal || !result.bundle) {
        message.error(`无法导入：${result.fatal}`)
        return false
      }
      setImportPreview({ bundle: result.bundle, warnings: result.warnings, filename: file.name })
    } catch (e) {
      message.error(`读取文件失败：${e instanceof Error ? e.message : String(e)}`)
    }
    return false // 阻止 antd Upload 自动上传
  }

  /** 确认导入设置（增量导入：仅添加当前不存在的项，不覆盖现有）。 */
  const confirmImportSettings = async (bundle: BackupBundle, replaceBusiness: boolean) => {
    setImportBusy(true)
    try {
      const patch: Record<string, unknown> = {}
      const s = bundle.settings
      const currentState = useAppStore.getState()

      // providers：仅添加当前不存在的节点（按 baseURL+model 判定重复）
      if (Array.isArray(s.providers)) {
        const existingKeys = new Set(
          currentState.providers.map((p) => `${p.baseURL}|||${p.model}`)
        )
        const toAdd = s.providers.filter(
          (p) => !existingKeys.has(`${p.baseURL}|||${p.model}`)
        )
        if (toAdd.length > 0) {
          patch.providers = [...currentState.providers, ...toAdd]
        }
      }

      // moduleMapping：仅填充当前缺失的模块映射
      if (s.moduleMapping) {
        const merged = { ...currentState.moduleMapping }
        let hasNew = false
        for (const key of Object.keys(s.moduleMapping) as ModuleKey[]) {
          if (!merged[key] || !merged[key].nodeId) {
            merged[key] = s.moduleMapping[key]
            hasNew = true
          }
        }
        if (hasNew) patch.moduleMapping = merged
      }

      // splitPatterns：仅添加当前不存在的模式（按 key 判重）
      if (Array.isArray(s.splitPatterns)) {
        const existingKeys = new Set(currentState.splitPatterns.map((p) => p.key))
        const toAdd = s.splitPatterns.filter((p) => !existingKeys.has(p.key))
        if (toAdd.length > 0) {
          patch.splitPatterns = [...currentState.splitPatterns, ...toAdd]
        }
      }

      // 其他标量配置：仅当当前为默认值/空时才导入
      if (typeof s.m1SystemPrompt === 'string' && !currentState.m1SystemPrompt) {
        patch.m1SystemPrompt = s.m1SystemPrompt
      }
      if (typeof s.m1TestText === 'string' && !currentState.m1TestText) {
        patch.m1TestText = s.m1TestText
      }
      if (typeof s.m1TitleTemplate === 'string' && currentState.m1TitleTemplate === '第{0n}章 {title}') {
        patch.m1TitleTemplate = s.m1TitleTemplate
      }

      // nodeTestGlobalForm：仅当当前未配置节点时导入
      const importGlobal = (s as any).nodeTestGlobalForm || (s as any).imageDemoGlobalForm
      if (importGlobal && !currentState.nodeTestGlobalForm.nodeId) {
        patch.nodeTestGlobalForm = importGlobal
      }

      // nodeTestFormPerNode：仅添加当前不存在的节点表单
      const importPerNode = (s as any).nodeTestFormPerNode || (s as any).imageDemoFormPerNode
      if (importPerNode && typeof importPerNode === 'object') {
        const merged = { ...currentState.nodeTestFormPerNode }
        let hasNew = false
        for (const nodeId of Object.keys(importPerNode)) {
          if (!merged[nodeId]) {
            merged[nodeId] = importPerNode[nodeId]
            hasNew = true
          }
        }
        if (hasNew) patch.nodeTestFormPerNode = merged
      }

      // 旧格式迁移（仅当当前完全没配置时）
      if ((s as any).imageDemoForm && !(s as any).nodeTestFormPerNode && !(s as any).imageDemoFormPerNode) {
        if (!currentState.nodeTestGlobalForm.nodeId) {
          const rawForm = (s as any).imageDemoForm as any
          const { nodeId, provider, ...params } = rawForm
          patch.nodeTestGlobalForm = { provider: (provider as string) || 'modelscope', nodeId: nodeId as string | undefined }
          if (nodeId && !currentState.nodeTestFormPerNode[nodeId]) {
            patch.nodeTestFormPerNode = { ...currentState.nodeTestFormPerNode, [nodeId]: params }
          }
        }
      }

      // cleanNodeOverrides：合并不存在的节点覆盖配置
      if (s.cleanNodeOverrides && typeof s.cleanNodeOverrides === 'object') {
        const merged = { ...currentState.cleanNodeOverrides }
        let hasNew = false
        for (const nodeId of Object.keys(s.cleanNodeOverrides)) {
          if (!merged[nodeId]) {
            merged[nodeId] = s.cleanNodeOverrides[nodeId]
            hasNew = true
          }
        }
        if (hasNew) patch.cleanNodeOverrides = merged
      }

      // 布尔/枚举值：当前已有配置则不覆盖
      if (typeof s.showMenuBar === 'boolean' && currentState.showMenuBar === true) {
        patch.showMenuBar = s.showMenuBar
      }
      if (typeof s.m1AutoRetry === 'boolean' && currentState.m1AutoRetry === true) {
        patch.m1AutoRetry = s.m1AutoRetry
      }
      if ((s as any).theme && currentState.theme === 'light') {
        patch.theme = (s as any).theme
      }

      useAppStore.setState(patch)
      pushSettingsNow()

      if (replaceBusiness && bundle.business) {
        // 完整恢复：全量替换业务数据 → store 覆盖 → 立即落库（syncAll 纯 upsert，
        // 不删旧；若要纯净恢复用户应在 Modal 勾选"先清空"走 clearAll）
        const b = bundle.business
        useAppStore.setState({
          books: b.books ?? [],
          chapters: b.chapters ?? [],
          cards: b.cards ?? [],
          outline: b.outline ?? [],
          scenes: b.scenes ?? [],
          fragments: b.fragments ?? [],
          stateEvents: b.stateEvents ?? [],
          issues: b.issues ?? [],
          architectures: b.architectures ?? [],
          mergeCandidates: b.mergeCandidates ?? [],
          imageGallery: b.imageGallery ?? [],
          chatSessions: b.chatSessions ?? [],
        })
        await pushStoreNowChecked()
      }
      message.success('导入完成')
      setImportPreview(null)
    } catch (e) {
      message.error(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImportBusy(false)
    }
  }

  /** 完整恢复时先清空业务库（DELETE clearAll）再导入。 */
  const clearBusinessThenImport = async (bundle: BackupBundle) => {
    setImportBusy(true)
    try {
      const res = await fetch('/api/store', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error || `清空失败 HTTP ${res.status}`)
      }
      await confirmImportSettings(bundle, true)
    } catch (e) {
      message.error(`清空并导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImportBusy(false)
    }
  }

  // ===== 章节检测模式池管理 =====
  const openPatternEdit = (p?: SplitPattern) => {
    const target: SplitPattern = p ?? { key: genId('pat'), label: '', regex: '', builtin: false }
    setEditingPattern(target)
    patternForm.setFieldsValue(target)
  }

  const savePatternEdit = async () => {
    const values = await patternForm.validateFields()
    const merged: SplitPattern = { ...editingPattern!, ...values }
    // regex 试编译校验（custom 模式允许空）
    if (merged.key !== 'custom' && merged.regex) {
      try {
        new RegExp(merged.regex)
      } catch {
        message.error('正则表达式无效，请检查语法')
        return
      }
    }
    const exists = splitPatterns.some((p) => p.key === merged.key)
    setSplitPatterns(
      exists ? splitPatterns.map((p) => (p.key === merged.key ? merged : p)) : [...splitPatterns, merged],
    )
    setEditingPattern(null)
    message.success('检测模式已保存')
  }

  const deletePattern = (p: SplitPattern) => {
    if (p.key === 'custom') {
      message.warning('「自定义正则」模式不可删除')
      return
    }
    setSplitPatterns(splitPatterns.filter((x) => x.key !== p.key))
    message.success('已删除')
  }

  // 当前 Tab 过滤后的节点（用于上移/下移首尾禁用判断）
  const filteredProviders = providers.filter((p) => p.nodeType === nodeTypeFilter)

  // 节点池按 baseURL + 名称前缀分组（正确的分组逻辑）
  const groupedProviders = filteredProviders.reduce((acc, node) => {
    // 提取组名称：去掉括号内模型后缀
    const groupName = node.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || node.baseURL
    // 分组键：baseURL | groupName（确保同 URL 不同名称分到不同组）
    const key = `${node.baseURL}|${groupName}`
    if (!acc[key]) {
      acc[key] = { baseURL: node.baseURL, groupName, nodes: [] }
    }
    acc[key].nodes.push(node)
    return acc
  }, {} as Record<string, { baseURL: string; groupName: string; nodes: ProviderNode[] }>)

  // 切换分组展开/折叠（持久化到 store）
  const toggleGroup = (groupKey: string) => {
    setState({
      nodeGroupExpanded: {
        ...nodeGroupExpanded,
        [groupKey]: !(nodeGroupExpanded[groupKey] ?? true),
      },
    })
  }

  const columns = [
    {
      title: '排序',
      key: 'order',
      width: 70,
      fixed: 'left' as const,
      render: (_: unknown, node: ProviderNode) => {
        const idxInList = filteredProviders.findIndex((p) => p.id === node.id)
        return (
          <Space size={0}>
            <Tooltip title="上移">
              <Button
                size="small"
                type="text"
                icon={<UpOutlined />}
                disabled={idxInList <= 0}
                onClick={() => moveNode(node.id, -1)}
              />
            </Tooltip>
            <Tooltip title="下移">
              <Button
                size="small"
                type="text"
                icon={<DownOutlined />}
                disabled={idxInList < 0 || idxInList >= filteredProviders.length - 1}
                onClick={() => moveNode(node.id, 1)}
              />
            </Tooltip>
          </Space>
        )
      },
    },
    { title: '模型', dataIndex: 'model', width: 150, ellipsis: true },
    {
      title: '次数',
      key: 'usage',
      width: 90,
      render: (_: unknown, node: ProviderNode) => {
        if (!node.usageLimitEnabled) return <Typography.Text type="secondary">不限</Typography.Text>
        const left = node.usageLeft ?? 0
        const limit = node.usageLimit ?? 0
        return (
          <Typography.Text type={left <= 0 ? 'danger' : undefined} style={{ fontSize: 12 }}>
            {left}/{limit}
          </Typography.Text>
        )
      },
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 60,
      render: (v: boolean, node: ProviderNode) => (
        <Switch
          size="small"
          checked={v}
          onChange={(checked) =>
            setState({
              providers: providers.map((p) => (p.id === node.id ? { ...p, enabled: checked } : p)),
            })
          }
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'lastTestResult',
      width: 80,
      render: (v: ProviderNode['lastTestResult']) =>
        v === 'ok' ? <Tag color="green">正常</Tag> : v === 'fail' ? <Tag color="red">失败</Tag> : <Tag>未测</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      fixed: 'right' as const,
      render: (_: unknown, node: ProviderNode) => (
        <Space size="small" wrap>
          <Button size="small" onClick={() => {
            setTestingNode(node)
            setTestStreamLeft('')
            setTestStreamRight('')
          }}>
            测试
          </Button>
          {node.nodeType === 'text' && (
            <Button
              size="small"
              loading={concurrencyTesting === node.id}
              onClick={() => runConcurrencyTest(node)}
            >
              并发
            </Button>
          )}
          <Button size="small" onClick={() => duplicateNode(node)}>
            复制
          </Button>
          <Button size="small" onClick={() => openEdit(node)}>
            编辑
          </Button>
          <Popconfirm
            title="删除该节点？"
            onConfirm={() => setState({ providers: providers.filter((p) => p.id !== node.id) })}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Tabs
        defaultActiveKey="nodes"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        tabBarStyle={{ padding: '0 24px', margin: 0, background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorder}` }}
        items={[
        {
          key: 'nodes',
          label: '节点池与测试',
          children: <NodesTabContent
            nodeTypeFilter={nodeTypeFilter}
            setNodeTypeFilter={setNodeTypeFilter}
            batchTesting={batchTesting}
            runBatchTest={runBatchTest}
            openEdit={openEdit}
            groupedProviders={groupedProviders}
            nodeGroupExpanded={nodeGroupExpanded}
            toggleGroup={toggleGroup}
            columns={columns}
            providers={providers}
            moduleMapping={moduleMapping}
            MODULE_LABELS={MODULE_LABELS}
            setState={setState}
            draftPrompt={draftPrompt}
            setDraftPrompt={setDraftPrompt}
            loadingPrompt={loadingPrompt}
            setLoadingPrompt={setLoadingPrompt}
            getDefaultPrompt={getDefaultPrompt}
            m1SystemPrompt={m1SystemPrompt}
            draftTestText={draftTestText}
            setDraftTestText={setDraftTestText}
            m1TestText={m1TestText}
            token={token}
          />,
        },
        {
          key: 'advanced',
          label: '高级配置',
          children: <AdvancedTabContent
            splitPatterns={splitPatterns}
            openPatternEdit={openPatternEdit}
            deletePattern={deletePattern}
            resetSplitPatterns={resetSplitPatterns}
            draftDir={draftDir}
            setDraftDir={setDraftDir}
            assetDir={assetDir}
            applyingDir={applyingDir}
            applyAssetDir={applyAssetDir}
          />,
        },
        {
          key: 'general',
          label: '通用设置',
          children: <GeneralTabContent
            theme={useAppStore((s) => s.theme)}
            setState={setState}
            showMenuBar={showMenuBar}
            pushSettingsNow={pushSettingsNow}
            enable4KScale={useAppStore((s) => s.enable4KScale)}
          />,
        },
        {
          key: 'backup',
          label: '备份与恢复',
          children: <BackupTabContent
            exportRedact={exportRedact}
            setExportRedact={setExportRedact}
            handleExport={handleExport}
            handleImportFile={handleImportFile}
            importPreview={importPreview}
            setImportPreview={setImportPreview}
            confirmImportSettings={confirmImportSettings}
            clearBusinessThenImport={clearBusinessThenImport}
            importBusy={importBusy}
          />,
        },
      ]}
    />
    </div>

    <Modal
      title={providers.some((p) => p.id === editing?.id) ? '编辑节点' : '新增节点'}
      open={!!editing}
      onOk={saveEdit}
      onCancel={() => setEditing(null)}
      destroyOnHidden
      width={Math.min(800, window.innerWidth - 48)}
    >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如：本地 llama.cpp" />
          </Form.Item>
          <Form.Item name="nodeType" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'text', label: '文本生成' },
                { value: 'image', label: '文生图' },
              ]}
            />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, cur) => prev.nodeType !== cur.nodeType} noStyle>
            {({ getFieldValue }) =>
              getFieldValue('nodeType') === 'image' ? (
                <Form.Item name="supportsImageEdit" label="图片编辑" valuePropName="checked" extra="开启后该节点可进行图片编辑（Image2Image）">
                  <Switch />
                </Form.Item>
              ) : getFieldValue('nodeType') === 'text' ? (
                <Form.Item name="isMultimodal" label="多模态" valuePropName="checked" extra="开启后该节点支持视觉多模态理解（图片+文本输入）">
                  <Switch />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="baseURL" label="Base URL" rules={[{ required: true }]}>
            <Input placeholder="http://127.0.0.1:8080/v1" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key">
            <Input.Password placeholder="本地节点可留空" />
          </Form.Item>
          <Form.Item name="model" label="默认模型" rules={[{ required: true }]} extra="支持多个模型，用逗号分隔（如 gpt-4, gpt-3.5-turbo）">
            <Space.Compact style={{ width: '100%' }}>
              <Input.TextArea
                placeholder="模型名（多个用逗号分隔）"
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{ flex: 1 }}
              />
              <Button
                loading={fetchingModels}
                disabled={!form.getFieldValue('baseURL')}
                onClick={fetchModels}
              >
                获取模型
              </Button>
            </Space.Compact>
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="maxConcurrency" label="最大并发（核心数）" rules={[{ required: true }]}>
                <InputNumber min={1} max={32} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="batchChars" label="批次字数上限" rules={[{ required: true }]}>
                <InputNumber min={1000} max={100000} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="intervalSec" label="请求间隔(秒)" rules={[{ required: true }]}>
                <InputNumber min={0} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="usageLimitEnabled" label="次数限制" valuePropName="checked">
            <Switch
              onChange={(checked) => {
                if (checked) {
                  const cur = form.getFieldValue('usageLimit')
                  if (typeof cur !== 'number' || cur <= 0) form.setFieldsValue({ usageLimit: 100, usageLeft: 100 })
                }
              }}
            />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, cur) => prev.usageLimitEnabled !== cur.usageLimitEnabled} noStyle>
            {({ getFieldValue }) =>
              getFieldValue('usageLimitEnabled') ? (
                <Form.Item
                  name="usageLimit"
                  label="每日额度（次）"
                  rules={[{ required: true, message: '请输入每日额度' }]}
                  extra="每天本地自然日 0 点重置为该额度；每次调用后剩余次数递减，耗尽则该节点被跳过。"
                >
                  <InputNumber min={1} max={100000} style={{ width: '100%' }} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* 需求8：模型多选批量添加 */}
      <Modal
        title="选择模型批量添加"
        open={modelSelectOpen}
        onOk={batchAddNodes}
        onCancel={() => setModelSelectOpen(false)}
        okText="批量添加"
        width={Math.min(600, window.innerWidth - 48)}
      >
        <Alert
          type="info"
          showIcon
          message={`从 ${form.getFieldValue('baseURL')} 获取到 ${availableModels.length} 个模型`}
          style={{ marginBottom: 16 }}
        />
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          选择要添加的模型（将为每个模型创建一个节点，共享 Base URL 和 API Key）：
        </Typography.Text>
        <Checkbox.Group
          style={{ width: '100%' }}
          value={selectedModels}
          onChange={setSelectedModels}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {availableModels.map((model) => (
              <Checkbox key={model} value={model}>
                {model}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </Modal>

      <Modal
        title={splitPatterns.some((p) => p.key === editingPattern?.key) ? '编辑检测模式' : '新增检测模式'}
        open={!!editingPattern}
        onOk={savePatternEdit}
        onCancel={() => setEditingPattern(null)}
        destroyOnHidden
        width={Math.min(600, window.innerWidth - 48)}
      >
        <Form form={patternForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="label" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如：第X章" />
          </Form.Item>
          <Form.Item
            name="regex"
            label="正则表达式"
            rules={[{ required: true, message: '请输入正则（custom 模式除外）' }]}
            extra="以 ^ 开头整行匹配，含一个捕获组作为标题。如：^(第[0-9一二三四五六七八九十]+章.*)"
          >
            <Input placeholder="^(第[0-9零一二三四五六七八九十百千万]+章.*)" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`连通性测试 — ${testResult?.node.name ?? ''}`}
        open={!!testResult}
        onCancel={() => setTestResult(null)}
        footer={<Button onClick={() => setTestResult(null)}>关闭</Button>}
        width={Math.min(600, window.innerWidth - 48)}
      >
        {testResult?.ok ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="success" showIcon message={`连通正常，发现 ${testResult.models.length} 个模型`} />
            {testResult.models.length > 0 ? (
              <>
                <Typography.Text type="secondary">点击模型名即可填入该节点的「默认模型」：</Typography.Text>
                <Space wrap>
                  {testResult.models.map((m) => (
                    <Tag.CheckableTag
                      key={m}
                      checked={testResult.node.model === m}
                      onChange={() => {
                        setState({
                          providers: useAppStore
                            .getState()
                            .providers.map((p) => (p.id === testResult.node.id ? { ...p, model: m } : p)),
                        })
                        setTestResult((r) => (r ? { ...r, node: { ...r.node, model: m } } : r))
                        message.success(`已将「${testResult.node.name}」默认模型设为 ${m}`)
                      }}
                    >
                      {m}
                    </Tag.CheckableTag>
                  ))}
                </Space>
              </>
            ) : (
              <Typography.Text type="secondary">该端点未返回模型列表（连接本身正常）。</Typography.Text>
            )}
          </Space>
        ) : (
          <Alert type="error" showIcon message="连接失败" description={testResult?.error} />
        )}
      </Modal>

      {/* 需求9：节点真实调用测试 */}
      <Modal
        title={`测试节点：${testingNode?.name ?? ''}`}
        open={!!testingNode}
        onCancel={() => setTestingNode(null)}
        width={Math.min(1200, window.innerWidth - 48)}
        footer={[
          <Button key="close" onClick={() => setTestingNode(null)}>关闭</Button>,
          <Button
            key="test"
            type="primary"
            loading={testStreaming}
            onClick={startRealTest}
          >
            开始测试
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Typography.Text strong>清理提示词：</Typography.Text>
            <Input.TextArea
              value={m1SystemPrompt || '（当前为空，将使用后端内置默认提示词）'}
              readOnly
              autoSize={{ minRows: 3, maxRows: 6 }}
              style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: m1SystemPrompt ? 'inherit' : 'var(--ant-color-text-tertiary)' }}
            />
          </div>
          <div>
            <Typography.Text strong>测试文本：</Typography.Text>
            <Input.TextArea
              value={m1TestText}
              readOnly
              autoSize={{ minRows: 4, maxRows: 8 }}
              style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
          {testStreamLeft && (
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <Card size="small" title="原文" style={{ height: 400 }}>
                  <div style={{ height: 350, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                    {testStreamLeft}
                  </div>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title="清理结果" style={{ height: 400 }}>
                  <div style={{ height: 350, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                    {testStreamRight || (testStreaming ? '等待响应...' : '')}
                  </div>
                </Card>
              </Col>
            </Row>
          )}
        </Space>
      </Modal>

      <Modal
        title={`并发测试 — ${concurrencyResult?.node.name ?? ''}`}
        open={!!concurrencyResult}
        onCancel={() => setConcurrencyResult(null)}
        width={Math.min(700, window.innerWidth - 48)}
        footer={
          <Space>
            <Button onClick={() => setConcurrencyResult(null)}>关闭</Button>
            <Button
              type="primary"
              disabled={concurrencyResult?.maxConcurrency === undefined}
              onClick={() => {
                if (!concurrencyResult || concurrencyResult.maxConcurrency === undefined) return
                const { node, maxConcurrency, intervalSec } = concurrencyResult
                setState({
                  providers: useAppStore
                    .getState()
                    .providers.map((p) =>
                      p.id === node.id
                        ? { ...p, maxConcurrency: maxConcurrency!, intervalSec: intervalSec ?? 0 }
                        : p,
                    ),
                })
                message.success(`已写回：最大并发 ${maxConcurrency}，请求间隔 ${intervalSec}s`)
                setConcurrencyResult(null)
              }}
            >
              应用推荐参数
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {concurrencyResult?.error && (
            <Alert type="error" showIcon message="测试失败" description={concurrencyResult.error} />
          )}
          {concurrencyResult?.maxConcurrency !== undefined && (
            <Alert
              type="success"
              showIcon
              message={`推荐参数：最大并发 ${concurrencyResult.maxConcurrency}，请求间隔 ${concurrencyResult.intervalSec}s`}
            />
          )}
          <Typography.Text type="secondary">探测过程：</Typography.Text>
          <pre style={{ background: 'var(--ant-color-fill-tertiary)', padding: 8, fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>
            {concurrencyResult?.log.join('\n')}
          </pre>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            通过逐级提高并发请求数（1→2→4→8→16）探测该节点可同时接受的任务数，遇到首个失败级别即回退。请求间隔由单请求耗时估算，仅供参考，可按「应用推荐参数」写回节点配置。
          </Typography.Paragraph>
        </Space>
      </Modal>

      <Modal
        title={
          importPreview
            ? `${importPreview.bundle.kind === 'full' ? '恢复备份' : '导入设置'} 预览 — ${importPreview.filename}`
            : '导入预览'
        }
        open={!!importPreview}
        onCancel={() => setImportPreview(null)}
        width={Math.min(620, window.innerWidth - 48)}
        destroyOnHidden
        footer={
          importPreview ? (
            <Space>
              <Button onClick={() => setImportPreview(null)}>取消</Button>
              {importPreview.bundle.kind === 'full' ? (
                <>
                  <Popconfirm
                    title="合并导入？"
                    description="将备份中的业务数据追加到当前库，不删除现有数据（syncAll 纯 upsert）。"
                    onConfirm={() => confirmImportSettings(importPreview.bundle, true)}
                    disabled={importBusy}
                  >
                    <Button loading={importBusy}>合并导入</Button>
                  </Popconfirm>
                  <Popconfirm
                    title="先清空再恢复？"
                    description="删除当前库全部业务数据后导入备份内容。此操作不可撤销，请确认！"
                    okText="确认清空并恢复"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => clearBusinessThenImport(importPreview.bundle)}
                    disabled={importBusy}
                  >
                    <Button danger loading={importBusy}>
                      先清空再恢复
                    </Button>
                  </Popconfirm>
                </>
              ) : (
                <Button
                  type="primary"
                  loading={importBusy}
                  onClick={() => confirmImportSettings(importPreview.bundle, false)}
                >
                  确认导入设置
                </Button>
              )}
            </Space>
          ) : null
        }
      >
        {importPreview && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message={`bundle 版本 v${importPreview.bundle.version}${
                importPreview.bundle.kind === 'full' ? ' · 完整备份' : ' · 仅设置'
              }`}
              description={
                importPreview.bundle.exportedAt
                  ? `导出时间：${importPreview.bundle.exportedAt}`
                  : '无导出时间（可能是旧版裸文件）'
              }
            />
            {importPreview.warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`检测到 ${importPreview.warnings.length} 个兼容性提示`}
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {importPreview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}
            <div>
              <Typography.Text strong>将导入的设置：</Typography.Text>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--ant-color-text-secondary)' }}>
                <li>Provider 节点：{importPreview.bundle.settings.providers?.length ?? 0} 个</li>
                <li>模块映射：{importPreview.bundle.settings.moduleMapping ? Object.keys(importPreview.bundle.settings.moduleMapping).length : 0} 个</li>
                <li>章节检测模式：{importPreview.bundle.settings.splitPatterns?.length ?? 0} 个</li>
                <li>
                  API Key：
                  {importPreview.bundle.settings.providers?.every((p) => !p.apiKey)
                    ? '已脱敏（空）'
                    : '含真实值'}
                </li>
              </ul>
            </div>
            {importPreview.bundle.kind === 'full' && importPreview.bundle.business && (
              <div>
                <Typography.Text strong>将导入的业务数据：</Typography.Text>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--ant-color-text-secondary)' }}>
                  {Object.entries(summarizeBusiness(importPreview.bundle.business)).map(([k, n]) => (
                    <li key={k}>{k}：{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </>
  )
}
