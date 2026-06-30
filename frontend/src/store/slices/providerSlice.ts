import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { seedProviders, seedProviderNodes, seedModuleMapping } from '../../mocks/seed'
import { nodePoolStore } from '../../packages/node-pool/store'

/**
 * Provider 域：供应商列表 / 节点列表 / 模块→模型映射 / 次数限制扣减。
 *
 * 实际状态与逻辑已下沉到独立的 nodePoolStore（frontend/src/packages/node-pool/store.ts）；
 * 本 slice 是 AppState 的兼容薄封装：
 * - 注入种子数据（首次启动）。
 * - 订阅 nodePoolStore 并同步回 AppState（驱动持久化与现有 selector）。
 * - 所有 action 委托给 nodePoolStore。
 */
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

export const createProviderSlice: StateCreator<AppState, [], [], ProviderSlice> = (
  set,
) => {
  // 注入种子数据（仅在空 store 时），保持首次启动体验与旧实现一致。
  if (nodePoolStore.getState().providers.length === 0) {
    nodePoolStore.setState({
      providers: seedProviders,
      providerNodes: seedProviderNodes,
      moduleMapping: seedModuleMapping,
    })
  }

  // nodePoolStore 是独立 store，AppState 需订阅同步以驱动持久化与现有 selector。
  nodePoolStore.subscribe((s) => {
    set({
      providers: s.providers,
      providerNodes: s.providerNodes,
      moduleMapping: s.moduleMapping,
    })
  })

  return {
    providers: nodePoolStore.getState().providers,
    providerNodes: nodePoolStore.getState().providerNodes,
    moduleMapping: nodePoolStore.getState().moduleMapping,
    consumeProviderUsage: (nodeId) =>
      nodePoolStore.getState().consumeProviderUsage(nodeId),
    addProvider: (provider) =>
      nodePoolStore.getState().addProvider(provider),
    updateProvider: (provider) =>
      nodePoolStore.getState().updateProvider(provider),
    removeProvider: (id) =>
      nodePoolStore.getState().removeProvider(id),
    addProviderNode: (node) =>
      nodePoolStore.getState().addProviderNode(node),
    updateProviderNode: (node) =>
      nodePoolStore.getState().updateProviderNode(node),
    removeProviderNode: (id) =>
      nodePoolStore.getState().removeProviderNode(id),
  }
}
