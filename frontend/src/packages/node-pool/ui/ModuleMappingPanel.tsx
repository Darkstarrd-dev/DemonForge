import { useMemo, useState } from 'react'
import { Modal, Select, Table, Typography } from 'antd'
import type {
  ModuleKey,
  Provider,
  ProviderNode,
  ResolvedProviderNode,
} from '../../../services/types'
import { getModuleNodeType } from '../../../services/types'

interface ModuleMappingPanelProps {
  open: boolean
  onClose: () => void
  moduleMapping: Record<ModuleKey, { nodeId: string | null; model?: string }>
  MODULE_LABELS: Record<ModuleKey, string>
  setModuleNode: (key: ModuleKey, nodeId: string | null) => void
  providers: Provider[]
  providerNodes: ProviderNode[]
  resolvedNodes: ResolvedProviderNode[]
}

export default function ModuleMappingPanel(props: ModuleMappingPanelProps) {
  const {
    open,
    onClose,
    moduleMapping,
    MODULE_LABELS,
    setModuleNode,
    providers,
    providerNodes,
    resolvedNodes,
  } = props

  const [pendingProviderId, setPendingProviderId] =
    useState<Record<ModuleKey, string | null>>(() => {
      const init = {} as Record<ModuleKey, string | null>
      for (const key of Object.keys(MODULE_LABELS) as ModuleKey[]) {
        const nodeId = moduleMapping[key].nodeId
        if (nodeId) {
          const node = providerNodes.find((n) => n.id === nodeId)
          init[key] = node?.providerId ?? null
        } else {
          init[key] = null
        }
      }
      return init
    })

  const rowProviderId = useMemo(() => {
    const map = {} as Record<ModuleKey, string | null>
    for (const key of Object.keys(MODULE_LABELS) as ModuleKey[]) {
      const nodeId = moduleMapping[key].nodeId
      if (nodeId) {
        const node = providerNodes.find((n) => n.id === nodeId)
        map[key] = node?.providerId ?? null
      } else {
        map[key] = pendingProviderId[key]
      }
    }
    return map
  }, [moduleMapping, pendingProviderId, providerNodes, MODULE_LABELS])

  const validProvidersByModule = useMemo(() => {
    const map = {} as Record<ModuleKey, Provider[]>
    for (const key of Object.keys(MODULE_LABELS) as ModuleKey[]) {
      const nodeType = getModuleNodeType(key)
      const providerIds = new Set(
        resolvedNodes
          .filter((n) => n.nodeType === nodeType)
          .map((n) => n.providerId),
      )
      map[key] = providers.filter((p) => providerIds.has(p.id))
    }
    return map
  }, [MODULE_LABELS, resolvedNodes, providers])

  const validNodesByRow = useMemo(() => {
    const map = {} as Record<ModuleKey, ResolvedProviderNode[]>
    for (const key of Object.keys(MODULE_LABELS) as ModuleKey[]) {
      const nodeType = getModuleNodeType(key)
      const provId = rowProviderId[key]
      map[key] = resolvedNodes.filter(
        (n) => n.nodeType === nodeType && n.providerId === provId && n.enabled,
      )
    }
    return map
  }, [MODULE_LABELS, resolvedNodes, rowProviderId])

  const dataSource = useMemo(
    () =>
      (Object.keys(MODULE_LABELS) as ModuleKey[]).map((key) => ({
        key,
        label: MODULE_LABELS[key],
        nodeId: moduleMapping[key].nodeId,
      })),
    [MODULE_LABELS, moduleMapping],
  )

  return (
    <Modal
      title="模块 → 模型映射（各模块指定节点，模型随节点配置）"
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      <Table
        rowKey="key"
        pagination={false}
        size="middle"
        dataSource={dataSource}
        columns={[
          { title: '模块', dataIndex: 'label', width: 140 },
          {
            title: '供应商',
            key: 'provider',
            width: 200,
            render: (_: unknown, row: { key: ModuleKey; nodeId: string | null }) => {
              const provId = rowProviderId[row.key]
              const validProviders = validProvidersByModule[row.key]
              return (
                <Select
                  style={{ width: '100%' }}
                  value={provId ?? undefined}
                  placeholder="选择供应商"
                  allowClear
                  options={validProviders.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  onChange={(newProvId: string | undefined) => {
                    setModuleNode(row.key, null)
                    setPendingProviderId((prev) => ({
                      ...prev,
                      [row.key]: newProvId ?? null,
                    }))
                  }}
                />
              )
            },
          },
          {
            title: '节点',
            key: 'node',
            width: 300,
            render: (_: unknown, row: { key: ModuleKey; nodeId: string | null }) => {
              const provId = rowProviderId[row.key]
              const validNodes = validNodesByRow[row.key]
              if (!provId) {
                return (
                  <Select
                    style={{ width: '100%' }}
                    placeholder="先选供应商"
                    disabled
                    options={[]}
                  />
                )
              }
              return (
                <Select
                  style={{ width: '100%' }}
                  value={row.nodeId ?? undefined}
                  placeholder="选择节点"
                  allowClear
                  options={validNodes.map((n) => ({
                    value: n.id,
                    label: n.model,
                  }))}
                  onChange={(nodeId: string | undefined) => {
                    setModuleNode(row.key, nodeId ?? null)
                    if (nodeId) {
                      setPendingProviderId((prev) => ({
                        ...prev,
                        [row.key]: null,
                      }))
                    }
                  }}
                />
              )
            },
          },
        ]}
      />
      <Typography.Paragraph
        type="secondary"
        style={{ marginTop: 12, marginBottom: 0 }}
      >
        模型名在「Provider 节点池」里为每个节点统一配置；此处仅选择节点。如需某模块用不同模型，请在对应供应商下新建一个配置了该模型的节点。
      </Typography.Paragraph>
    </Modal>
  )
}
