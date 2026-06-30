import { useMemo, useState } from 'react'
import { App, Form, Modal } from 'antd'
import { genId, pushNodePoolNow, useAppStore } from '../store/appStore'
import { nodePoolStore } from '../packages/node-pool/store'
import type { NodePoolStateCore } from '../packages/node-pool/types'
import type { ModuleKey, Provider, ProviderNode, ProviderNodeType } from '../services/types'
import { resolveProviderNodes } from '../utils/providerResolver'
import { testProvider } from '../services/api'
import {
  buildNodePoolBundle,
  downloadBundle,
  nodePoolBackupFilename,
  parseNodePoolBundle,
  readFileAsText,
} from '../utils/backup'

export const MODULE_LABELS: Record<ModuleKey, string> = {
  m0Arch: 'M0 架构设计',
  m0Blueprint: 'M0 章节蓝图',
  m1Clean: 'M1 文本清理',
  m2Extract: 'M2 设定提取',
  m2CardImage: 'M2 卡片生图',
  m3Simulate: 'M3 角色推演',
  m4Generate: 'M4 章节生成',
  m5Check: 'M5 一致性检查',
  m5Finalize: 'M5 定稿归档',
  batchGenerate: '批量生产',
  roleChat: '角色交流',
  embedding: 'Embedding 向量',
}

export function useNodePoolCrud() {
  const { message } = App.useApp()
  const storeProviders = useAppStore((s) => s.providers)
  const storeProviderNodes = useAppStore((s) => s.providerNodes)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const addProvider = useAppStore((s) => s.addProvider)
  const updateProvider = useAppStore((s) => s.updateProvider)
  const removeProviderAction = useAppStore((s) => s.removeProvider)
  const addProviderNode = useAppStore((s) => s.addProviderNode)
  const updateProviderNode = useAppStore((s) => s.updateProviderNode)
  const removeProviderNodeAction = useAppStore((s) => s.removeProviderNode)
  const setState = useAppStore((s) => s.setState)
  const nodeGroupExpanded = useAppStore((s) => s.nodeGroupExpanded)

  const resolvedNodes = useMemo(
    () => resolveProviderNodes({ providers: storeProviders, providerNodes: storeProviderNodes }),
    [storeProviders, storeProviderNodes],
  )

  const [nodeTypeFilter, setNodeTypeFilter] = useState<ProviderNodeType>('text')

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [providerForm] = Form.useForm<Provider>()
  const [selectedExistingProvider, setSelectedExistingProvider] = useState<Provider | null>(null)

  const [editingNode, setEditingNode] = useState<{ node: ProviderNode; provider: Provider } | null>(null)
  const [nodeForm] = Form.useForm<ProviderNode>()

  const [fetchingModels, setFetchingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [modelSelectOpen, setModelSelectOpen] = useState(false)
  const [fetchModelsProvider, setFetchModelsProvider] = useState<Provider | null>(null)

  const [exportRedact, setExportRedact] = useState(false)

  const openProviderEdit = () => {
    setSelectedExistingProvider(null)
    const target: Provider = {
      id: genId('prov'),
      name: '',
      baseURL: '',
      apiKeys: [{ id: genId('key'), key: '', enabled: true, state: 'ok' }],
      rotationPolicy: 'round-robin',
      createdAt: Date.now(),
    }
    setEditingProvider(target)
    providerForm.setFieldsValue(target)
  }

  const editProvider = (p: Provider) => {
    setSelectedExistingProvider(null)
    setEditingProvider(p)
    providerForm.setFieldsValue(p)
  }

  const saveProvider = async () => {
    if (selectedExistingProvider) {
      setEditingProvider(null)
      providerForm.resetFields()
      addNodeForProvider(selectedExistingProvider.id)
      setSelectedExistingProvider(null)
      return
    }
    const values = await providerForm.validateFields()
    const apiKeys = (values.apiKeys ?? []).map((k: { id?: string; key: string; label?: string; enabled?: boolean; state?: string }) => ({
      id: k.id || genId('key'),
      key: k.key,
      label: k.label || '',
      enabled: k.enabled !== false,
      state: (k.state === 'exhausted' || k.state === 'disabled' ? k.state : 'ok') as import('../services/types').ProviderApiKeyState,
    }))
    if (apiKeys.length === 0) {
      message.error('至少保留一个 API KEY')
      return
    }
    const provider: Provider = { ...editingProvider!, ...values, apiKeys }
    const exists = storeProviders.some((p) => p.id === provider.id)
    if (exists) updateProvider(provider)
    else addProvider(provider)
    setEditingProvider(null)
    providerForm.resetFields()
  }

  const removeProvider = (id: string) => {
    removeProviderAction(id)
  }

  const addNodeForProvider = (providerId: string) => {
    const provider = storeProviders.find((p) => p.id === providerId)
    if (!provider) return
    const target: ProviderNode = {
      id: genId('node'),
      providerId,
      nodeType: nodeTypeFilter,
      protocol: nodeTypeFilter === 'image' ? 'modelscope' : undefined,
      model: '',
      enabled: true,
      lastTestResult: null,
      maxConcurrency: 2,
      batchChars: nodeTypeFilter === 'text' ? 10000 : 1,
      intervalSec: 0,
      usageLimitEnabled: false,
      usageLimit: 0,
      usageLeft: 0,
      usageResetDate: '',
    }
    setEditingNode({ node: target, provider })
    nodeForm.setFieldsValue(target)
  }

  const editNode = (node: ProviderNode, provider: Provider) => {
    setEditingNode({ node, provider })
    nodeForm.setFieldsValue(node)
  }

  const removeNode = (id: string) => {
    removeProviderNodeAction(id)
  }

  const toggleNodeEnabled = (node: ProviderNode, enabled: boolean) => {
    updateProviderNode({ ...node, enabled })
  }

  const saveNode = async () => {
    if (!editingNode) return
    const values = await nodeForm.validateFields()
    const merged: ProviderNode = { ...editingNode.node, ...values }
    const sameNameNode = storeProviderNodes.find(
      (n) => n.providerId === merged.providerId && n.nodeType === merged.nodeType && n.model === merged.model && n.id !== merged.id,
    )
    if (sameNameNode) {
      message.warning(`同名节点「${merged.model}」已存在`)
      return
    }
    if (merged.usageLimitEnabled) {
      const old = storeProviderNodes.find((n) => n.id === merged.id)
      const limitChanged = old?.usageLimit !== merged.usageLimit
      if (limitChanged || !merged.usageResetDate) {
        merged.usageLeft = merged.usageLimit ?? 0
        merged.usageResetDate = ''
      }
    }
    const exists = storeProviderNodes.some((n) => n.id === merged.id)
    if (exists) updateProviderNode(merged)
    else addProviderNode(merged)
    setEditingNode(null)
    nodeForm.resetFields()
  }

  const duplicateNode = (src: ProviderNode) => {
    const siblings = storeProviderNodes.filter((n) => n.providerId === src.providerId && n.nodeType === src.nodeType)
    const baseModel = src.model.replace(/\s*\(\d+\)$/, '')
    const maxNum = siblings.reduce((m, n) => {
      const mt = n.model.match(/\((\d+)\)$/)
      return Math.max(m, mt ? Number(mt[1]) : 1)
    }, 1)
    const next: ProviderNode = {
      ...src,
      id: genId('node'),
      model: `${baseModel} (${maxNum + 1})`,
      enabled: src.enabled,
      lastTestResult: null,
      usageLeft: src.usageLimitEnabled ? src.usageLimit ?? 0 : 0,
      usageResetDate: '',
    }
    addProviderNode(next)
    message.success(`已复制为「${next.model}」`)
  }

  const reorderProviders = (ids: string[]) => {
    const map = new Map(storeProviders.map((p) => [p.id, p]))
    const reordered = ids.map((id) => map.get(id)).filter((p) => p) as Provider[]
    nodePoolStore.setState({ providers: reordered })
  }

  const reorderNodes = (ids: string[]) => {
    const idSet = new Set(ids)
    const next = [...storeProviderNodes]
    const toReorder = next.filter((n) => idSet.has(n.id))
    const reordered = ids.map((id) => toReorder.find((n) => n.id === id)!).filter(Boolean)
    let reorderIdx = 0
    const result = next.map((n) => {
      if (idSet.has(n.id)) {
        return reordered[reorderIdx++]
      }
      return n
    })
    nodePoolStore.setState({ providerNodes: result })
  }

  const setModuleNode = (key: ModuleKey, nodeId: string | null) => {
    setState({
      moduleMapping: {
        ...moduleMapping,
        [key]: { nodeId },
      },
    })
  }

  const toggleGroup = (groupKey: string) => {
    setState({
      nodeGroupExpanded: {
        ...nodeGroupExpanded,
        [groupKey]: !(nodeGroupExpanded[groupKey] ?? true),
      },
    })
  }

  const fetchModels = async (overrideProvider?: Provider) => {
    const provider = overrideProvider ?? editingNode?.provider
    if (!provider) {
      message.warning('请先选择供应商')
      return
    }
    const baseURL = provider.baseURL
    const apiKey = provider.apiKeys.find((k) => k.enabled)?.key
    if (!baseURL) {
      message.warning('请先填写供应商 Base URL')
      return
    }
    setFetchModelsProvider(provider)
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

  const batchAddNodes = () => {
    if (selectedModels.length === 0) {
      message.warning('请至少选择一个模型')
      return
    }
    const provider = fetchModelsProvider ?? editingNode?.provider
    if (!provider) return
    const existingModels = new Set(
      storeProviderNodes
        .filter((n) => n.providerId === provider.id && n.nodeType === nodeTypeFilter)
        .map((n) => n.model),
    )
    const toAdd = selectedModels.filter((m) => !existingModels.has(m))
    if (toAdd.length === 0) {
      message.info('所有模型均已存在，无需添加')
      setModelSelectOpen(false)
      setFetchModelsProvider(null)
      return
    }
    const values = nodeForm.getFieldsValue()
    const newNodes: ProviderNode[] = toAdd.map((model) => ({
      id: genId('node'),
      providerId: provider.id,
      nodeType: nodeTypeFilter,
      protocol: nodeTypeFilter === 'image' ? (values.protocol || 'modelscope') : undefined,
      model,
      enabled: true,
      lastTestResult: null,
      maxConcurrency: values.maxConcurrency ?? 2,
      batchChars: nodeTypeFilter === 'text' ? (values.batchChars ?? 10000) : (values.batchChars ?? 1),
      intervalSec: values.intervalSec ?? 0,
      usageLimitEnabled: values.usageLimitEnabled ?? false,
      usageLimit: values.usageLimit ?? 0,
      usageLeft: values.usageLimitEnabled ? (values.usageLimit ?? 0) : 0,
      usageResetDate: '',
      isMultimodal: nodeTypeFilter === 'text' ? (values.isMultimodal ?? false) : undefined,
    }))
    newNodes.forEach((n) => addProviderNode(n))
    const skipped = selectedModels.length - toAdd.length
    message.success(`已添加 ${toAdd.length} 个节点${skipped > 0 ? `（${skipped} 个同名跳过）` : ''}`)
    setModelSelectOpen(false)
    setFetchModelsProvider(null)
    setEditingNode(null)
    nodeForm.resetFields()
  }

  const handleExportNodePool = () => {
    try {
      const st = useAppStore.getState()
      const bundle = buildNodePoolBundle(
        { providers: st.providers, providerNodes: st.providerNodes, moduleMapping: st.moduleMapping },
        exportRedact,
      )
      downloadBundle(bundle, nodePoolBackupFilename(exportRedact))
      message.success(`已导出节点池（${exportRedact ? '已脱敏 API Key' : '含 API Key'}）`)
    } catch (e) {
      message.error(`导出节点池失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleImportNodePool = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.style.display = 'none'
    input.onchange = async () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) return
      try {
        const text = await readFileAsText(file)
        const result = parseNodePoolBundle(text)
        if (result.fatal || !result.bundle) {
          message.error(`无法导入节点池：${result.fatal}`)
          return
        }
        const bundle = result.bundle
        const currentPool = nodePoolStore.getState()
        const nodePoolPatch: Partial<NodePoolStateCore> = {}

        if (Array.isArray(bundle.providers)) {
          const existingProviderIds = new Set(currentPool.providers.map((p) => p.id))
          const providersToAdd = bundle.providers.filter((p) => !existingProviderIds.has(p.id))
          if (providersToAdd.length > 0) {
            nodePoolPatch.providers = [...currentPool.providers, ...providersToAdd]
          }
        }

        if (Array.isArray(bundle.providerNodes)) {
          const existingNodeKeys = new Set(
            currentPool.providerNodes.map((n) => `${n.providerId}|||${n.model}`),
          )
          const nodesToAdd = bundle.providerNodes.filter(
            (n) => !existingNodeKeys.has(`${n.providerId}|||${n.model}`),
          )
          if (nodesToAdd.length > 0) {
            nodePoolPatch.providerNodes = [...currentPool.providerNodes, ...nodesToAdd]
          }
        }

        if (bundle.moduleMapping) {
          const merged = { ...currentPool.moduleMapping }
          let hasNew = false
          for (const key of Object.keys(bundle.moduleMapping) as ModuleKey[]) {
            if (!merged[key] || !merged[key].nodeId) {
              merged[key] = bundle.moduleMapping[key]
              hasNew = true
            }
          }
          if (hasNew) nodePoolPatch.moduleMapping = merged
        }

        if (Object.keys(nodePoolPatch).length === 0) {
          message.info('节点池无新增内容（供应商/节点均已存在）')
          return
        }

        nodePoolStore.setState(nodePoolPatch)
        pushNodePoolNow()
        message.success(`节点池导入成功${result.warnings.length > 0 ? `（${result.warnings.length} 条警告）` : ''}`)
        if (result.warnings.length > 0) {
          Modal.warning({ title: '导入节点池警告', content: result.warnings.join('\n') })
        }
      } catch (e) {
        message.error(`导入节点池失败：${e instanceof Error ? e.message : String(e)}`)
      }
    }
    document.body.appendChild(input)
    input.click()
  }

  return {
    providers: storeProviders,
    providerNodes: storeProviderNodes,
    resolvedNodes,
    moduleMapping,
    nodeTypeFilter,
    setNodeTypeFilter,
    nodeGroupExpanded,
    editingProvider,
    setEditingProvider,
    selectedExistingProvider,
    setSelectedExistingProvider,
    providerForm,
    openProviderEdit,
    editProvider,
    saveProvider,
    removeProvider,
    editingNode,
    setEditingNode,
    nodeForm,
    addNodeForProvider,
    editNode,
    removeNode,
    toggleNodeEnabled,
    saveNode,
    duplicateNode,
    reorderProviders,
    reorderNodes,
    toggleGroup,
    setModuleNode,
    MODULE_LABELS,
    fetchingModels,
    availableModels,
    selectedModels,
    setSelectedModels,
    modelSelectOpen,
    setModelSelectOpen,
    fetchModelsProvider,
    fetchModels,
    batchAddNodes,
    exportRedact,
    setExportRedact,
    handleExportNodePool,
    handleImportNodePool,
  }
}
