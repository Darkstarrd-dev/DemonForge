/**
 * 节点池独立 store。
 *
 * 不依赖 novelhelper 业务代码，可被任何项目独立引入。
 * 通过 createNodePoolStore 工厂创建，默认导出 nodePoolStore 单例供 app 层挂载种子/持久化。
 */
import { createStore, type StoreApi } from 'zustand'
import type {
  Provider,
  ProviderNode,
  ModuleKey,
  ModuleModelMapping,
  NodePoolStateCore,
} from './types'

/** 本地时区自然日键，格式 YYYY-MM-DD。 */
function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 节点池状态：数据 + CRUD action。 */
export interface NodePoolState extends NodePoolStateCore {
  /**
   * 次数限制：派发任务前调用，判定该节点当前是否可用并扣减当日剩余次数。
   * - 未开启次数限制 → 直接返回 true。
   * - 跨本地自然日 → 重置 usageLeft = usageLimit。
   * - usageLeft <= 0 → 返回 false（调度器应跳过该节点）。
   * - 否则 usageLeft -= 1 并写回，返回 true。
   */
  consumeProviderUsage: (nodeId: string) => boolean
  /** 新增供应商。 */
  addProvider: (provider: Provider) => void
  /** 更新供应商。 */
  updateProvider: (provider: Provider) => void
  /** 删除供应商，级联删除其下所有节点，并清理 moduleMapping 指向这些节点的映射。 */
  removeProvider: (id: string) => void
  /** 新增节点。 */
  addProviderNode: (node: ProviderNode) => void
  /** 更新节点。 */
  updateProviderNode: (node: ProviderNode) => void
  /** 删除节点，并清理 moduleMapping 指向该节点的映射。 */
  removeProviderNode: (id: string) => void
}

export function createNodePoolStore(
  initial?: Partial<NodePoolState>,
): StoreApi<NodePoolState> {
  return createStore<NodePoolState>((set, get) => ({
    providers: initial?.providers ?? [],
    providerNodes: initial?.providerNodes ?? [],
    moduleMapping:
      initial?.moduleMapping ?? ({} as Record<ModuleKey, ModuleModelMapping>),

    consumeProviderUsage: (nodeId) => {
      const node = get().providerNodes.find((n) => n.id === nodeId)
      if (!node) return false
      if (!node.usageLimitEnabled) return true
      const today = localDateKey()
      let left = node.usageLeft ?? 0
      let resetDate = node.usageResetDate ?? ''
      if (resetDate !== today) {
        left = node.usageLimit ?? 0
        resetDate = today
      }
      if (left <= 0) return false
      const next = left - 1
      set((s) => ({
        providerNodes: s.providerNodes.map((n) =>
          n.id === nodeId
            ? { ...n, usageLeft: next, usageResetDate: resetDate }
            : n,
        ),
      }))
      return true
    },

    addProvider: (provider) => {
      set((s) => ({ providers: [...s.providers, provider] }))
    },
    updateProvider: (provider) => {
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === provider.id ? provider : p,
        ),
      }))
    },
    removeProvider: (id) => {
      set((s) => {
        const remainingNodes = s.providerNodes.filter((n) => n.providerId !== id)
        // 清理 moduleMapping 中指向被删供应商下节点的映射
        const nextMapping = Object.fromEntries(
          Object.entries(s.moduleMapping).map(([k, v]) => {
            if (!v || !v.nodeId) return [k, v]
            const mappedNode = s.providerNodes.find((n) => n.id === v.nodeId)
            return mappedNode && mappedNode.providerId === id
              ? [k, { nodeId: null }]
              : [k, v]
          }),
        ) as Record<ModuleKey, ModuleModelMapping>
        return {
          providers: s.providers.filter((p) => p.id !== id),
          providerNodes: remainingNodes,
          moduleMapping: nextMapping,
        }
      })
    },

    addProviderNode: (node) => {
      set((s) => ({ providerNodes: [...s.providerNodes, node] }))
    },
    updateProviderNode: (node) => {
      set((s) => ({
        providerNodes: s.providerNodes.map((n) =>
          n.id === node.id ? node : n,
        ),
      }))
    },
    removeProviderNode: (id) => {
      set((s) => {
        const nextMapping = Object.fromEntries(
          Object.entries(s.moduleMapping).map(([k, v]) => [
            k,
            v && v.nodeId === id ? { nodeId: null } : v,
          ]),
        ) as Record<ModuleKey, ModuleModelMapping>
        return {
          providerNodes: s.providerNodes.filter((n) => n.id !== id),
          moduleMapping: nextMapping,
        }
      })
    },
  }))
}

/** 默认单例（由 app 层在启动时注入种子/持久化数据）。 */
export const nodePoolStore = createNodePoolStore()
