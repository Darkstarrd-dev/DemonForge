import { useState } from 'react'
import { Button, Input, Modal, Segmented, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { DownOutlined, UpOutlined } from '@ant-design/icons'
import type {
  ModuleKey,
  Provider,
  ProviderNode,
  ProviderNodeType,
  ResolvedProviderNode,
} from '../../../services/types'

export type ModuleRow = { key: ModuleKey; label: string; nodeId: string | null; model?: string }

interface NodesTabContentProps {
  nodeTypeFilter: ProviderNodeType
  setNodeTypeFilter: (v: ProviderNodeType) => void
  batchTesting: boolean
  runBatchTest: () => void
  /** 新增供应商 */
  openProviderEdit: () => void
  /** 编辑供应商 */
  editProvider: (p: Provider) => void
  /** 在供应商下新增节点 */
  addNodeForProvider: (providerId: string) => void
  /** 编辑节点 */
  editNode: (node: ProviderNode, provider: Provider) => void
  /** 删除供应商 */
  removeProvider: (id: string) => void
  /** 删除节点 */
  removeNode: (id: string) => void
  /** 切换节点启用 */
  toggleNodeEnabled: (node: ProviderNode, enabled: boolean) => void
  /** 测试节点（ResolvedProviderNode 已含连接信息） */
  testNode: (node: ResolvedProviderNode) => void
  /** 并发测试节点 */
  concurrencyTestNode: (node: ResolvedProviderNode) => void
  /** 复制节点 */
  duplicateNode: (node: ProviderNode) => void
  /** 上移/下移节点 */
  moveNode: (nodeId: string, dir: -1 | 1) => void
  providers: Provider[]
  providerNodes: ProviderNode[]
  resolvedNodes: ResolvedProviderNode[]
  nodeGroupExpanded: Record<string, boolean>
  toggleGroup: (key: string) => void
  moduleMapping: Record<ModuleKey, { nodeId: string | null; model?: string }>
  MODULE_LABELS: Record<ModuleKey, string>
  setModuleNode: (key: ModuleKey, nodeId: string | null) => void
  setState: (patch: {
    m1SystemPrompt?: string
    m1TestText?: string
    nodeGroupExpanded?: Record<string, boolean>
  }) => void
  draftPrompt: string
  setDraftPrompt: (v: string) => void
  loadingPrompt: boolean
  setLoadingPrompt: (v: boolean) => void
  getDefaultPrompt: () => Promise<string>
  m1SystemPrompt: string
  draftTestText: string
  setDraftTestText: (v: string) => void
  m1TestText: string
}

export default function NodesTabContent(props: NodesTabContentProps) {
  const {
    resolvedNodes,
    providers,
    providerNodes,
    nodeTypeFilter,
    setNodeTypeFilter,
    batchTesting,
    runBatchTest,
    openProviderEdit,
    editProvider,
    addNodeForProvider,
    editNode,
    removeProvider,
    removeNode,
    toggleNodeEnabled,
    testNode,
    concurrencyTestNode,
    duplicateNode,
    moveNode,
    nodeGroupExpanded,
    toggleGroup,
    moduleMapping,
    MODULE_LABELS,
  setModuleNode,
  setState,
  draftPrompt,
  setDraftPrompt,
  loadingPrompt,
  setLoadingPrompt,
  getDefaultPrompt,
  m1SystemPrompt,
  draftTestText,
  setDraftTestText,
  m1TestText,
} = props

  // 「新增节点到现有供应商」选择器
  const [pickProviderOpen, setPickProviderOpen] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)

  // 按当前 Tab 过滤节点（文本/图片），再按 providerId 分组
  const visibleNodes = resolvedNodes.filter((n) => n.nodeType === nodeTypeFilter)
  const nodeOrder = new Map(visibleNodes.map((n, i) => [n.id, i]))
  const nodesByProvider = new Map<string, ResolvedProviderNode[]>()
  for (const n of visibleNodes) {
    const list = nodesByProvider.get(n.providerId) ?? []
    list.push(n)
    nodesByProvider.set(n.providerId, list)
  }

  const providerOf = (providerId: string) => providers.find((p) => p.id === providerId)

  const nodeColumns: TableColumnsType<ResolvedProviderNode> = [
    {
      title: '排序',
      key: 'order',
      width: 70,
      fixed: 'left',
      render: (_: unknown, node: ResolvedProviderNode) => {
        const idxInList = nodeOrder.get(node.id) ?? -1
        return (
          <Space size={0}>
            <Button
              size="small"
              type="text"
              icon={<UpOutlined />}
              disabled={idxInList <= 0}
              onClick={() => moveNode(node.id, -1)}
            />
            <Button
              size="small"
              type="text"
              icon={<DownOutlined />}
              disabled={idxInList < 0 || idxInList >= visibleNodes.length - 1}
              onClick={() => moveNode(node.id, 1)}
            />
          </Space>
        )
      },
    },
    { title: '模型', dataIndex: 'model', width: 160, ellipsis: true },
    {
      title: '并发',
      key: 'concurrency',
      width: 80,
      render: (_: unknown, node: ResolvedProviderNode) => `≤${node.maxConcurrency}`,
    },
    {
      title: nodeTypeFilter === 'text' ? '批次字数' : '批次张数',
      key: 'batch',
      width: 100,
      render: (_: unknown, node: ResolvedProviderNode) => node.batchChars,
    },
    {
      title: '额度',
      key: 'usage',
      width: 90,
      render: (_: unknown, node: ResolvedProviderNode) => {
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
      render: (_: unknown, node: ResolvedProviderNode) => (
        <Switch
          size="small"
          checked={node.enabled}
          onChange={(checked) => {
            const raw = providerNodes.find((n) => n.id === node.id)
            if (raw) toggleNodeEnabled(raw, checked)
          }}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'lastTestResult',
      width: 80,
      render: (v: ResolvedProviderNode['lastTestResult']) =>
        v === 'ok' ? <Tag color="green">正常</Tag> : v === 'fail' ? <Tag color="red">失败</Tag> : <Tag>未测</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      fixed: 'right',
      render: (_: unknown, node: ResolvedProviderNode) => (
        <Space size="small" wrap>
          <Button size="small" onClick={() => testNode(node)}>
            测试
          </Button>
          {node.nodeType === 'text' && (
            <Button size="small" onClick={() => concurrencyTestNode(node)}>
              并发
            </Button>
          )}
          <Button size="small" onClick={() => duplicateNode(providerNodes.find((n) => n.id === node.id)!)}>
            复制
          </Button>
          <Button
            size="small"
            onClick={() => {
              const raw = providerNodes.find((n) => n.id === node.id)
              const prov = providerOf(node.providerId)
              if (raw && prov) editNode(raw, prov)
            }}
          >
            编辑
          </Button>
          <Button size="small" danger onClick={() => removeNode(node.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 46px)', display: 'flex', flexDirection: 'column' }}>
      {/* 标题栏：独立容器，不受滚动影响 */}
      <div style={{ padding: '24px 24px 12px 24px', maxWidth: 1600, margin: '0 auto', width: '100%', background: 'var(--ant-color-bg-layout)', borderBottom: '1px solid var(--ant-color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Provider 节点池
        </Typography.Title>
        <Space>
          <Segmented
            value={nodeTypeFilter}
            onChange={(v) => setNodeTypeFilter(v as ProviderNodeType)}
            options={[
              { value: 'text', label: '文本' },
              { value: 'image', label: '图片' },
            ]}
          />
          <Button loading={batchTesting} onClick={runBatchTest}>
            批量测试
          </Button>
            <Button
              onClick={() => { setSelectedProviderId(null); setPickProviderOpen(true) }}
              disabled={providers.length === 0}
            >
              新增节点到现有供应商
            </Button>
            <Button type="primary" onClick={openProviderEdit}>
              新增供应商
            </Button>
        </Space>
      </div>

      {/* 滚动内容区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 24px 24px' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {/* 供应商分组渲染 */}
        {providers.map((provider) => {
          const nodes = nodesByProvider.get(provider.id) ?? []
          const key = provider.id
          const isExpanded = nodeGroupExpanded[key] ?? true
          return (
            <div key={key} style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--ant-color-fill-quaternary)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  marginBottom: 4,
                }}
                onClick={() => toggleGroup(key)}
              >
                <Space>
                  {isExpanded ? <DownOutlined style={{ fontSize: 12 }} /> : <UpOutlined style={{ fontSize: 12, transform: 'rotate(180deg)' }} />}
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {provider.name}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {provider.baseURL}
                  </Typography.Text>
                  <Tag color="blue">{provider.apiKeys.length} 个 KEY</Tag>
                  <Tag color={provider.rotationPolicy === 'failover' ? 'orange' : 'cyan'}>
                    {provider.rotationPolicy === 'failover' ? 'Failover' : 'Round-Robin'}
                  </Tag>
                </Space>
                <Space onClick={(e) => e.stopPropagation()}>
                  <Button size="small" onClick={() => addNodeForProvider(provider.id)}>
                    新增节点
                  </Button>
                  <Button size="small" onClick={() => editProvider(provider)}>
                    编辑供应商
                  </Button>
                  <Button size="small" danger onClick={() => removeProvider(provider.id)}>
                    删除
                  </Button>
                </Space>
              </div>
              {isExpanded && (
                <Table
                  rowKey="id"
                  columns={nodeColumns}
                  dataSource={nodes}
                  pagination={false}
                  size="middle"
                  style={{ marginBottom: 0 }}
                  scroll={{ x: 750 }}
                  showHeader={false}
                  locale={{ emptyText: '该供应商下无此类型节点' }}
                />
              )}
            </div>
          )
        })}

        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 16 }}>
          统一 OpenAI 兼容格式；测试经本地后端 Provider 抽象层调用（/api/llm/test → GET /v1/models）。多 KEY 按供应商轮询策略切换：Round-Robin 分散负载，Failover 固定主 KEY（适合按 token / 支持 cache 的供应商）。
        </Typography.Paragraph>

        {/* 模块映射 Card */}
        <div style={{ marginBottom: 16, padding: 16, background: 'var(--ant-color-bg-container)', borderRadius: 8, border: '1px solid var(--ant-color-border)' }}>
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
            模块 → 模型映射（各模块指定节点，模型随节点配置）
          </Typography.Title>
          <Table
            rowKey="key"
            pagination={false}
            size="middle"
            scroll={{ x: 800 }}
            dataSource={(Object.keys(MODULE_LABELS) as ModuleKey[]).map((key) => ({
              key,
              label: MODULE_LABELS[key],
              ...moduleMapping[key],
            }))}
            columns={[
              { title: '模块', dataIndex: 'label', width: 160, fixed: 'left' },
              {
                title: '节点（模型随节点配置）',
                dataIndex: 'nodeId',
                width: 320,
                render: (v: string | null, row: ModuleRow) => (
                  <Select
                    style={{ minWidth: 220, width: '100%' }}
                    value={v ?? undefined}
                    placeholder="选择节点"
                    options={resolvedNodes
                      .filter((n) => n.nodeType === 'text')
                      .map((n) => ({ value: n.id, label: `${n.providerName} · ${n.model}` }))}
                    onChange={(nodeId) => setModuleNode(row.key, nodeId)}
                  />
                ),
              },
              {
                title: '将使用模型',
                key: 'model',
                width: 200,
                render: (_: unknown, row: ModuleRow) => {
                  const node = resolvedNodes.find((n) => n.id === row.nodeId)
                  return node?.model ? <Tag>{node.model}</Tag> : <Typography.Text type="secondary">—</Typography.Text>
                },
              },
            ]}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            模型名在「Provider 节点池」里为每个节点统一配置；此处仅选择节点。如需某模块用不同模型，请在对应供应商下新建一个配置了该模型的节点。
          </Typography.Paragraph>
        </div>

        {/* M1 清理提示词 Card */}
        <div style={{ marginBottom: 16, padding: 16, background: 'var(--ant-color-bg-container)', borderRadius: 8, border: '1px solid var(--ant-color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              M1 清理提示词（默认）
            </Typography.Title>
            <Space>
              <Button
                loading={loadingPrompt}
                onClick={async () => {
                  setLoadingPrompt(true)
                  try {
                    const p = await getDefaultPrompt()
                    setDraftPrompt(p)
                  } finally {
                    setLoadingPrompt(false)
                  }
                }}
              >
                载入内置默认
              </Button>
              <Button disabled={draftPrompt === m1SystemPrompt} onClick={() => setState({ m1SystemPrompt: draftPrompt })}>
                保存
              </Button>
              <Button
                disabled={!m1SystemPrompt}
                onClick={() => {
                  setDraftPrompt('')
                  setState({ m1SystemPrompt: '' })
                }}
              >
                清空（用内置）
              </Button>
            </Space>
          </div>
          <Input.TextArea
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            autoSize={{ minRows: 6, maxRows: 16 }}
            placeholder="留空则使用后端内置默认提示词。点「载入内置默认」可查看并在此基础上修改。"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {m1SystemPrompt ? `已保存自定义提示词（${m1SystemPrompt.length} 字）。清理时优先使用它。` : '当前为空——清理时使用后端内置默认提示词。'}
            {' M1 第三步可再为单次任务临时覆盖。'}
          </Typography.Paragraph>
        </div>

        {/* 测试文本 Card */}
        <div style={{ padding: 16, background: 'var(--ant-color-bg-container)', borderRadius: 8, border: '1px solid var(--ant-color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              测试文本
            </Typography.Title>
            <Space>
              <Button disabled={draftTestText === m1TestText} onClick={() => setState({ m1TestText: draftTestText })}>
                保存
              </Button>
              <Button onClick={() => { setDraftTestText(''); setState({ m1TestText: '' }) }}>
                清空
              </Button>
            </Space>
          </div>
          <Input.TextArea
            value={draftTestText}
            onChange={(e) => setDraftTestText(e.target.value)}
            autoSize={{ minRows: 6, maxRows: 16 }}
            placeholder="用于「测试」按钮与并发测试的文本"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
        </div>
      </div>
    </div>
  )
}
