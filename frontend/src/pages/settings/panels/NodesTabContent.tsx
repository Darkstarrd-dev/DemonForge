import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Button, Input, Segmented, Space, Switch, Table, Tag, Typography } from 'antd'
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
  ModuleKey,
  Provider,
  ProviderNode,
  ProviderNodeType,
  ResolvedProviderNode,
} from '../../../services/types'
import ModelMappingModal from './ModelMappingModal'

const DragListenersContext = createContext<Record<string, unknown> | null>(null)

function DragHandle() {
  const listeners = useContext(DragListenersContext)
  return (
    <span {...listeners} style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', color: 'var(--ant-color-text-quaternary)' }}>
      <HolderOutlined />
    </span>
  )
}

interface NodesTabContentProps {
  nodeTypeFilter: ProviderNodeType
  setNodeTypeFilter: (v: ProviderNodeType) => void
  batchTesting: boolean
  runBatchTest: () => void
  openProviderEdit: () => void
  editProvider: (p: Provider) => void
  addNodeForProvider: (providerId: string) => void
  fetchModels: (overrideProvider?: Provider) => void
  fetchingModels: boolean
  editNode: (node: ProviderNode, provider: Provider) => void
  removeProvider: (id: string) => void
  removeNode: (id: string) => void
  toggleNodeEnabled: (node: ProviderNode, enabled: boolean) => void
  testNode: (node: ResolvedProviderNode) => void
  concurrencyTestNode: (node: ResolvedProviderNode) => void
  duplicateNode: (node: ProviderNode) => void
  /** 重排供应商/节点（provider 级或 node 级） */
  reorderProviders: (ids: string[]) => void
  reorderNodes: (ids: string[]) => void
  providers: Provider[]
  providerNodes: ProviderNode[]
  resolvedNodes: ResolvedProviderNode[]
  nodeGroupExpanded: Record<string, boolean>
  toggleGroup: (key: string) => void
  moduleMapping: Record<ModuleKey, { nodeId: string | null; model?: string }>
  MODULE_LABELS: Record<ModuleKey, string>
  setModuleNode: (key: ModuleKey, nodeId: string | null) => void
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
    fetchModels,
    fetchingModels,
    removeProvider,
    removeNode,
    toggleNodeEnabled,
    testNode,
    concurrencyTestNode,
    duplicateNode,
    reorderProviders,
    reorderNodes,
    nodeGroupExpanded,
    toggleGroup,
    moduleMapping,
    MODULE_LABELS,
    setModuleNode,
  } = props

  const [modelMappingModalOpen, setModelMappingModalOpen] = useState(false)

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
    // 重新排列 providers：保持非可见供应商位置不变，可见供应商按新顺序
    const newOrder = [...providers]
    const nonVisible = newOrder.filter((p) => !nodesByProvider.has(p.id))
    const reorderedIds = reordered.map((p) => p.id)
    // 先放非可见（保持原序），再按新序放可见
    const resultIds = [
      ...nonVisible.map((p) => p.id),
      ...reorderedIds,
    ]
    reorderProviders(resultIds)
  }, [visibleProviders, providers, nodesByProvider, reorderProviders])

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
    <>
    <div style={{ height: 'calc(100vh - 46px)', display: 'flex', flexDirection: 'column' }}>
      {/* 标题栏 */}
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
          <Button onClick={() => setModelMappingModalOpen(true)}>
            模型映射
          </Button>
          <Button type="primary" onClick={openProviderEdit}>
            新增供应商 / 节点
          </Button>
        </Space>
      </div>

      {/* 滚动内容区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 24px 24px' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {/* 供应商分组拖拽排序 */}
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
                  onToggle={() => toggleGroup(key)}
                  nodeColumns={nodeColumns}
                  nodes={nodes}
                  addNodeForProvider={addNodeForProvider}
                  editProvider={editProvider}
                  removeProvider={removeProvider}
                  fetchModels={fetchModels}
                  fetchingModels={fetchingModels}
                  reorderNodes={reorderNodes}
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

      <ModelMappingModal
        open={modelMappingModalOpen}
        onClose={() => setModelMappingModalOpen(false)}
        moduleMapping={moduleMapping}
        MODULE_LABELS={MODULE_LABELS}
        setModuleNode={setModuleNode}
        providers={providers}
        providerNodes={providerNodes}
        resolvedNodes={resolvedNodes}
      />
    </>
    )
  }
