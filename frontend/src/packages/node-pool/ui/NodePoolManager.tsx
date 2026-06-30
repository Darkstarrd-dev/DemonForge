import { createContext, useCallback, useContext, useMemo } from 'react'
import { Alert, AutoComplete, Button, Checkbox, Col, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Switch, Tag, Typography, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { DownOutlined, HolderOutlined, RightOutlined } from '@ant-design/icons'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type {
  Provider,
  ProviderNode,
  ProviderNodeType,
  ResolvedProviderNode,
} from '../../../services/types'
import { genId } from '../../../store/id'

const DragListenersContext = createContext<Record<string, unknown> | null>(null)

function DragHandle() {
  const listeners = useContext(DragListenersContext)
  return (
    <span {...listeners} style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', color: 'var(--ant-color-text-quaternary)' }}>
      <HolderOutlined />
    </span>
  )
}

interface NodePoolManagerProps {
  providers: Provider[]
  providerNodes: ProviderNode[]
  resolvedNodes: ResolvedProviderNode[]
  nodeTypeFilter: ProviderNodeType
  onNodeTypeFilterChange: (v: ProviderNodeType) => void
  onAddProvider: () => void
  onEditProvider: (p: Provider) => void
  onAddNodeForProvider: (providerId: string) => void
  onEditNode: (node: ProviderNode, provider: Provider) => void
  onRemoveProvider: (id: string) => void
  onRemoveNode: (id: string) => void
  onToggleNodeEnabled: (node: ProviderNode, enabled: boolean) => void
  onDuplicateNode: (node: ProviderNode) => void
  onTestNode: (node: ResolvedProviderNode) => void
  onConcurrencyTestNode: (node: ResolvedProviderNode) => void
  onReorderProviders: (ids: string[]) => void
  onReorderNodes: (ids: string[]) => void
  nodeGroupExpanded: Record<string, boolean>
  onToggleGroup: (key: string) => void
  onFetchModels: (overrideProvider?: Provider) => void
  fetchingModels: boolean
  onOpenModelMapping: () => void
  onExportNodePool: () => void
  onImportNodePool: () => void
  batchTesting: boolean
  onRunBatchTest: () => void
  editingProvider: Provider | null
  setEditingProvider: (p: Provider | null) => void
  selectedExistingProvider: Provider | null
  setSelectedExistingProvider: (p: Provider | null) => void
  providerForm: ReturnType<typeof Form.useForm<Provider>>[0]
  onSaveProvider: () => Promise<void>
  editingNode: { node: ProviderNode; provider: Provider } | null
  setEditingNode: (v: { node: ProviderNode; provider: Provider } | null) => void
  nodeForm: ReturnType<typeof Form.useForm<ProviderNode>>[0]
  onSaveNode: () => Promise<void>
  availableModels: string[]
  selectedModels: string[]
  setSelectedModels: (v: string[]) => void
  modelSelectOpen: boolean
  setModelSelectOpen: (v: boolean) => void
  fetchModelsProvider: Provider | null
  onBatchAddNodes: () => void
}

interface SortableProviderCardProps {
  provider: Provider
  isExpanded: boolean
  onToggle: () => void
  nodeColumns: TableColumnsType<ResolvedProviderNode>
  nodes: ResolvedProviderNode[]
  addNodeForProvider: (providerId: string) => void
  editProvider: (p: Provider) => void
  removeProvider: (id: string) => void
  fetchModels: (overrideProvider?: Provider) => void
  fetchingModels: boolean
  reorderNodes: (ids: string[]) => void
}

function SortableProviderCard({
  provider,
  isExpanded,
  onToggle,
  nodeColumns,
  nodes,
  addNodeForProvider,
  editProvider,
  removeProvider,
  fetchModels,
  fetchingModels,
  reorderNodes,
}: SortableProviderCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: provider.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 0,
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleNodeDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = nodes.findIndex((n) => n.id === active.id)
    const newIndex = nodes.findIndex((n) => n.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reorderedIds = arrayMove(nodes, oldIndex, newIndex).map((n) => n.id)
    reorderNodes(reorderedIds)
  }, [nodes, reorderNodes])

  return (
    <div ref={setNodeRef} style={style} className="provider-card-wrapper">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'var(--ant-color-fill-quaternary)',
          cursor: 'default',
        }}
      >
        <Space size={4}>
          <span
            {...attributes}
            {...listeners}
            style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', color: 'var(--ant-color-text-quaternary)' }}
          >
            <HolderOutlined />
          </span>
          <span
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            onClick={onToggle}
          >
            {isExpanded ? <DownOutlined style={{ fontSize: 12 }} /> : <RightOutlined style={{ fontSize: 12 }} />}
          </span>
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
        <Space>
          <Button size="small" loading={fetchingModels} disabled={!provider.baseURL} onClick={() => fetchModels(provider)}>
            获取模型
          </Button>
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
      {isExpanded && nodes.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleNodeDragEnd}
        >
          <SortableContext
            items={nodes.map((n) => n.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table
              rowKey="id"
              columns={nodeColumns}
              dataSource={nodes}
              pagination={false}
              size="small"
              scroll={{ x: 750 }}
              showHeader={false}
              locale={{ emptyText: '该供应商下无此类型节点' }}
              components={{
                body: {
                  row: (rowProps) => {
                    const { children, ...rest } = rowProps
                    const nodeId = rest['data-row-key'] as string
                    return <SortableNodeRow id={nodeId}>{children}</SortableNodeRow>
                  },
                },
              }}
            />
          </SortableContext>
        </DndContext>
      )}
      {isExpanded && nodes.length === 0 && (
        <div style={{ padding: '12px 16px', color: 'var(--ant-color-text-quaternary)', textAlign: 'center' }}>
          该供应商下无此类型节点
        </div>
      )}
    </div>
  )
}

function SortableNodeRow({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 5 : 0,
    display: 'table-row',
  }

  return (
    <DragListenersContext.Provider value={listeners ?? null}>
      <tr ref={setNodeRef} style={style} {...attributes}>
        {children}
      </tr>
    </DragListenersContext.Provider>
  )
}

export default function NodePoolManager(props: NodePoolManagerProps) {
  const {
    resolvedNodes,
    providers,
    providerNodes,
    nodeTypeFilter,
    onNodeTypeFilterChange,
    onAddProvider,
    onEditProvider,
    onAddNodeForProvider,
    onEditNode,
    onRemoveProvider,
    onRemoveNode,
    onToggleNodeEnabled,
    onDuplicateNode,
    onTestNode,
    onConcurrencyTestNode,
    onReorderProviders,
    onReorderNodes,
    nodeGroupExpanded,
    onToggleGroup,
    onFetchModels,
    fetchingModels,
    onOpenModelMapping,
    onExportNodePool,
    onImportNodePool,
    batchTesting,
    onRunBatchTest,
    editingProvider,
    setEditingProvider,
    selectedExistingProvider,
    setSelectedExistingProvider,
    providerForm,
    onSaveProvider,
    editingNode,
    setEditingNode,
    nodeForm,
    onSaveNode,
    availableModels,
    selectedModels,
    setSelectedModels,
    modelSelectOpen,
    setModelSelectOpen,
    fetchModelsProvider,
    onBatchAddNodes,
  } = props

  const visibleNodes = resolvedNodes.filter((n) => n.nodeType === nodeTypeFilter)
  const nodesByProvider = useMemo(() => {
    const map = new Map<string, ResolvedProviderNode[]>()
    for (const n of visibleNodes) {
      const list = map.get(n.providerId) ?? []
      list.push(n)
      map.set(n.providerId, list)
    }
    return map
  }, [visibleNodes])

  const visibleProviders = useMemo(
    () => providers.filter((p) => nodesByProvider.has(p.id)),
    [providers, nodesByProvider],
  )

  const providerOf = useCallback(
    (providerId: string) => providers.find((p) => p.id === providerId),
    [providers],
  )

  const providerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleProviderDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = visibleProviders.findIndex((p) => p.id === active.id)
    const newIndex = visibleProviders.findIndex((p) => p.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(visibleProviders, oldIndex, newIndex)
    const newOrder = [...providers]
    const nonVisible = newOrder.filter((p) => !nodesByProvider.has(p.id))
    const reorderedIds = reordered.map((p) => p.id)
    const resultIds = [
      ...nonVisible.map((p) => p.id),
      ...reorderedIds,
    ]
    onReorderProviders(resultIds)
  }, [visibleProviders, providers, nodesByProvider, onReorderProviders])

  const nodeColumns: TableColumnsType<ResolvedProviderNode> = [
    {
      title: '拖拽',
      key: 'drag',
      width: 40,
      fixed: 'left',
      render: () => <DragHandle />,
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
            if (raw) onToggleNodeEnabled(raw, checked)
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
          <Button size="small" onClick={() => onTestNode(node)}>
            测试
          </Button>
          {node.nodeType === 'text' && (
            <Button size="small" onClick={() => onConcurrencyTestNode(node)}>
              并发
            </Button>
          )}
          <Button size="small" onClick={() => onDuplicateNode(providerNodes.find((n) => n.id === node.id)!)}>
            复制
          </Button>
          <Button
            size="small"
            onClick={() => {
              const raw = providerNodes.find((n) => n.id === node.id)
              const prov = providerOf(node.providerId)
              if (raw && prov) onEditNode(raw, prov)
            }}
          >
            编辑
          </Button>
          <Button size="small" danger onClick={() => onRemoveNode(node.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]



  return (
    <>
      <div style={{ height: 'calc(100vh - 46px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 24px 12px 24px', maxWidth: 1600, margin: '0 auto', width: '100%', background: 'var(--ant-color-bg-layout)', borderBottom: '1px solid var(--ant-color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Provider 节点池
          </Typography.Title>
          <Space>
            <Segmented
              value={nodeTypeFilter}
              onChange={(v) => onNodeTypeFilterChange(v as ProviderNodeType)}
              options={[
                { value: 'text', label: '文本' },
                { value: 'image', label: '图片' },
              ]}
            />
            <Button loading={batchTesting} onClick={onRunBatchTest}>
              批量测试
            </Button>
            <Button onClick={onOpenModelMapping}>
              模型映射
            </Button>
            <Button onClick={onExportNodePool}>
              导出节点池
            </Button>
            <Button onClick={onImportNodePool}>
              导入节点池
            </Button>
            <Button type="primary" onClick={onAddProvider}>
              新增供应商 / 节点
            </Button>
          </Space>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 24px 24px' }}>
          <div style={{ maxWidth: 1600, margin: '0 auto' }}>
            <DndContext
              sensors={providerSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleProviderDragEnd}
            >
              <SortableContext
                items={visibleProviders.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {visibleProviders.map((provider) => {
                  const nodes = nodesByProvider.get(provider.id)!
                  const key = provider.id
                  const isExpanded = nodeGroupExpanded[key] ?? true
                  return (
                    <SortableProviderCard
                      key={key}
                      provider={provider}
                      isExpanded={isExpanded}
                      onToggle={() => onToggleGroup(key)}
                      nodeColumns={nodeColumns}
                      nodes={nodes}
                      addNodeForProvider={onAddNodeForProvider}
                      editProvider={onEditProvider}
                      removeProvider={onRemoveProvider}
                      fetchModels={onFetchModels}
                      fetchingModels={fetchingModels}
                      reorderNodes={onReorderNodes}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>

            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 16 }}>
              统一 OpenAI 兼容格式；测试经本地后端 Provider 抽象层调用（/api/llm/test → GET /v1/models）。多 KEY 按供应商轮询策略切换：Round-Robin 分散负载，Failover 固定主 KEY（适合按 token / 支持 cache 的供应商）。
            </Typography.Paragraph>
          </div>
        </div>
      </div>

      <Modal
        title={
          selectedExistingProvider
            ? `新增节点到「${selectedExistingProvider.name}」`
            : providers.some((p) => p.id === editingProvider?.id)
              ? '编辑供应商'
              : '新增供应商 / 节点'
        }
        open={!!editingProvider}
        onOk={onSaveProvider}
        onCancel={() => { setEditingProvider(null); setSelectedExistingProvider(null) }}
        okText={selectedExistingProvider ? '下一步：配置节点' : '保存'}
        destroyOnHidden
        width={Math.min(800, window.innerWidth - 48)}
      >
        {selectedExistingProvider && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`已选择现有供应商「${selectedExistingProvider.name}」，确认后将打开节点配置表单。`}
          />
        )}
        <Form form={providerForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <AutoComplete
              placeholder={
                providers.some((p) => p.id === editingProvider?.id)
                  ? '供应商名称'
                  : '输入新名称，或点击箭头选择已有供应商'
              }
              options={
                providers.some((p) => p.id === editingProvider?.id)
                  ? []
                  : providers.map((p) => ({ value: p.name, label: `${p.name}（${p.baseURL}）` }))
              }
              filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
              onChange={(value) => {
                if (providers.some((p) => p.id === editingProvider?.id)) return
                const matched = providers.find((p) => p.name === value)
                if (matched) {
                  setSelectedExistingProvider(matched)
                  providerForm.setFieldsValue({
                    baseURL: matched.baseURL,
                    rotationPolicy: matched.rotationPolicy,
                    apiKeys: matched.apiKeys,
                  })
                } else {
                  if (selectedExistingProvider) {
                    setSelectedExistingProvider(null)
                    providerForm.setFieldsValue({
                      baseURL: '',
                      rotationPolicy: 'round-robin',
                      apiKeys: [{ id: genId('key'), key: '', enabled: true, state: 'ok' }],
                    })
                  }
                }
              }}
            />
          </Form.Item>
          <Form.Item name="baseURL" label="Base URL" rules={[{ required: true }]}>
            <Input placeholder="http://127.0.0.1:8080/v1" disabled={!!selectedExistingProvider} />
          </Form.Item>
          <Form.Item name="rotationPolicy" label="轮询策略">
            <Segmented
              options={[
                { value: 'round-robin', label: 'Round-Robin' },
                { value: 'failover', label: 'Failover' },
              ]}
              disabled={!!selectedExistingProvider}
            />
          </Form.Item>
          <Form.Item label="API KEY">
            <Form.List name="apiKeys" rules={[{ validator: (_, value) => (value && value.length > 0 ? Promise.resolve() : Promise.reject(new Error('至少保留一个 API KEY'))) }]}>
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item
                        {...restField}
                        name={[name, 'key']}
                        rules={[{ required: true, message: '请输入 KEY' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input.Password placeholder="sk-..." style={{ width: 240 }} disabled={!!selectedExistingProvider} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'label']}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="备注" style={{ width: 120 }} disabled={!!selectedExistingProvider} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'enabled']}
                        valuePropName="checked"
                        style={{ marginBottom: 0 }}
                      >
                        <Switch checkedChildren="启用" unCheckedChildren="禁用" disabled={!!selectedExistingProvider} />
                      </Form.Item>
                      <Button type="text" danger onClick={() => remove(name)} disabled={fields.length <= 1 || !!selectedExistingProvider}>
                        删除
                      </Button>
                    </Space>
                  ))}
                  {!selectedExistingProvider && (
                    <Button type="dashed" onClick={() => add({ id: genId('key'), key: '', enabled: true, state: 'ok' })} block>
                      添加 API KEY
                    </Button>
                  )}
                  <Form.ErrorList errors={errors} />
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          providerNodes.some((n) => n.id === editingNode?.node.id)
            ? `${editingNode?.provider.name} 编辑节点`
            : '新增节点'
        }
        open={!!editingNode}
        onOk={onSaveNode}
        onCancel={() => { setEditingNode(null); nodeForm.resetFields() }}
        width={Math.min(800, window.innerWidth - 48)}
      >
        <Form form={nodeForm} layout="vertical" style={{ marginTop: 8 }}>
          {nodeTypeFilter === 'image' && (
            <Form.Item name="protocol" label="生图协议" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'modelscope', label: 'ModelScope（异步）' },
                  { value: 'gpt', label: 'GPT Image（同步）' },
                  { value: 'xai', label: 'xAI Imagine（同步）' },
                ]}
              />
            </Form.Item>
          )}
          <Form.Item name="model" rules={[{ required: true }]}>
            <Input.TextArea
              placeholder="模型名，支持多个模型，用逗号分隔（如 gpt-4, gpt-3.5-turbo）"
              autoSize={{ minRows: 1, maxRows: 4 }}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="maxConcurrency" label="最大并发" rules={[{ required: true }]}>
                <InputNumber min={1} max={32} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="batchChars"
                label={nodeTypeFilter === 'text' ? '批次字数上限' : '批次张数上限'}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={nodeTypeFilter === 'text' ? 100000 : 100} step={nodeTypeFilter === 'text' ? 1000 : 1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="intervalSec" label="请求间隔(秒)" rules={[{ required: true }]}>
                <InputNumber min={0} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="usageLimitEnabled" label="次数限制" valuePropName="checked">
                <Switch
                  onChange={(checked) => {
                    if (checked) {
                      const cur = nodeForm.getFieldValue('usageLimit')
                      if (typeof cur !== 'number' || cur <= 0) nodeForm.setFieldsValue({ usageLimit: 100, usageLeft: 100 })
                    }
                  }}
                />
              </Form.Item>
            </Col>
            {nodeTypeFilter === 'text' && (
              <Col span={8}>
                <Form.Item name="isMultimodal" label="多模态" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
            )}
          </Row>
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

      <Modal
        title="选择模型批量添加"
        open={modelSelectOpen}
        onOk={onBatchAddNodes}
        onCancel={() => setModelSelectOpen(false)}
        okText="批量添加"
        width={Math.min(600, window.innerWidth - 48)}
      >
        <Alert
          type="info"
          showIcon
          message={`从 ${(fetchModelsProvider ?? editingNode?.provider)?.baseURL} 获取到 ${availableModels.length} 个模型`}
          style={{ marginBottom: 16 }}
        />
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          选择要添加的模型（将为每个模型创建一个节点，共享 Base URL 和 API KEY）：
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
    </>
  )
}
