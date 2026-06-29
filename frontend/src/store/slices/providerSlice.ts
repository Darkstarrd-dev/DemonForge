import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { seedProviders, seedProviderNodes, seedModuleMapping } from '../../mocks/seed'
import { localDateKey } from '../../utils/date'

/** Provider 域：供应商列表 / 节点列表 / 模块→模型映射 / 次数限制扣减。 */
export type ProviderSlice = Pick<
  AppState,
  | 'providers'
  | 'providerNodes'
  | 'moduleMapping'
  | 'consumeProviderUsage'
  | 'addProvider'
  | 'updateProvider'
  | 'removeProvider'
  | 'addProviderNode'
  | 'updateProviderNode'
  | 'removeProviderNode'
>

export const createProviderSlice: StateCreator<AppState, [], [], ProviderSlice> = (set, get) => ({
  providers: seedProviders,
  providerNodes: seedProviderNodes,
  moduleMapping: seedModuleMapping,

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
        n.id === nodeId ? { ...n, usageLeft: next, usageResetDate: resetDate } : n,
      ),
    }))
    return true
  },

  addProvider: (provider) => {
    set((s) => ({ providers: [...s.providers, provider] }))
  },
  updateProvider: (provider) => {
    set((s) => ({
      providers: s.providers.map((p) => (p.id === provider.id ? provider : p)),
    }))
  },
  removeProvider: (id) => {
    set((s) => ({
      providers: s.providers.filter((p) => p.id !== id),
      providerNodes: s.providerNodes.filter((n) => n.providerId !== id),
      // 同时清理 moduleMapping 中指向被删供应商下节点的映射
      moduleMapping: Object.fromEntries(
        Object.entries(s.moduleMapping).map(([k, v]) => [
          k,
          v && (v as { nodeId?: string }).nodeId && s.providerNodes.some((n) => n.id === (v as { nodeId?: string }).nodeId && n.providerId === id)
            ? { nodeId: null }
            : v,
        ]),
      ) as AppState['moduleMapping'],
    }))
  },

  addProviderNode: (node) => {
    set((s) => ({ providerNodes: [...s.providerNodes, node] }))
  },
  updateProviderNode: (node) => {
    set((s) => ({
      providerNodes: s.providerNodes.map((n) => (n.id === node.id ? node : n)),
    }))
  },
  removeProviderNode: (id) => {
    set((s) => ({
      providerNodes: s.providerNodes.filter((n) => n.id !== id),
      moduleMapping: Object.fromEntries(
        Object.entries(s.moduleMapping).map(([k, v]) => [
          k,
          v && (v as { nodeId?: string }).nodeId === id ? { nodeId: null } : v,
        ]),
      ) as AppState['moduleMapping'],
    }))
  },
})
