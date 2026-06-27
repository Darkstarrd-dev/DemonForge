import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { seedProviders, seedModuleMapping } from '../../mocks/seed'
import { localDateKey } from '../../utils/date'

/** Provider 域：节点池 / 模块→模型映射 / 次数限制扣减。 */
export type ProviderSlice = Pick<AppState, 'providers' | 'moduleMapping' | 'consumeProviderUsage'>

export const createProviderSlice: StateCreator<AppState, [], [], ProviderSlice> = (set, get) => ({
  providers: seedProviders,
  moduleMapping: seedModuleMapping,

  consumeProviderUsage: (nodeId) => {
    const node = get().providers.find((p) => p.id === nodeId)
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
      providers: s.providers.map((p) =>
        p.id === nodeId ? { ...p, usageLeft: next, usageResetDate: resetDate } : p,
      ),
    }))
    return true
  },
})
