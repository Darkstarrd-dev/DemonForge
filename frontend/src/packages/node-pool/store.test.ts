import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNodePoolStore, type NodePoolState } from './store'
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping } from './types'

describe('node-pool/store', () => {
  let store: ReturnType<typeof createNodePoolStore>

  beforeEach(() => {
    store = createNodePoolStore()
  })

  const sampleProvider = (id: string): Provider => ({
    id,
    name: `Provider ${id}`,
    baseURL: 'http://localhost/v1',
    apiKeys: [{ id: 'k1', key: 'sk-', enabled: true, state: 'ok' }],
    rotationPolicy: 'round-robin',
    createdAt: Date.now(),
  })

  const sampleNode = (id: string, providerId: string): ProviderNode => ({
    id,
    providerId,
    nodeType: 'text',
    model: 'gpt-4o',
    enabled: true,
    maxConcurrency: 2,
    batchChars: 4000,
    intervalSec: 0,
  })

  const defaultMapping: Record<ModuleKey, ModuleModelMapping> = {
    m1Clean: { nodeId: null },
    m0Arch: { nodeId: null },
    m0Blueprint: { nodeId: null },
    m2Extract: { nodeId: null },
    m2CardImage: { nodeId: null },
    m3Simulate: { nodeId: null },
    m4Generate: { nodeId: null },
    m5Check: { nodeId: null },
    m5Finalize: { nodeId: null },
    batchGenerate: { nodeId: null },
    roleChat: { nodeId: null },
    embedding: { nodeId: null },
  }

  it('初始状态为空', () => {
    const s = store.getState()
    expect(s.providers).toEqual([])
    expect(s.providerNodes).toEqual([])
    expect(s.moduleMapping).toEqual({})
  })

  it('可接收初始状态', () => {
    const p = sampleProvider('p1')
    const n = sampleNode('n1', 'p1')
    store = createNodePoolStore({
      providers: [p],
      providerNodes: [n],
      moduleMapping: defaultMapping,
    })
    const s = store.getState()
    expect(s.providers).toEqual([p])
    expect(s.providerNodes).toEqual([n])
    expect(s.moduleMapping).toEqual(defaultMapping)
  })

  describe('供应商 CRUD', () => {
    it('addProvider 追加到列表', () => {
      const p = sampleProvider('p1')
      store.getState().addProvider(p)
      expect(store.getState().providers).toEqual([p])
    })

    it('updateProvider 替换同 id', () => {
      const p1 = sampleProvider('p1')
      store.getState().addProvider(p1)
      const updated = { ...p1, name: 'Updated' }
      store.getState().updateProvider(updated)
      expect(store.getState().providers[0].name).toBe('Updated')
    })

    it('removeProvider 级联删除其下节点', () => {
      const p1 = sampleProvider('p1')
      const p2 = sampleProvider('p2')
      const n1 = sampleNode('n1', 'p1')
      const n2 = sampleNode('n2', 'p2')
      store.setState({ providers: [p1, p2], providerNodes: [n1, n2] })

      store.getState().removeProvider('p1')
      const s = store.getState()
      expect(s.providers.map((p) => p.id)).toEqual(['p2'])
      expect(s.providerNodes.map((n) => n.id)).toEqual(['n2'])
    })

    it('removeProvider 清理指向其下节点的 moduleMapping', () => {
      const p1 = sampleProvider('p1')
      const n1 = sampleNode('n1', 'p1')
      store.setState({
        providers: [p1],
        providerNodes: [n1],
        moduleMapping: { ...defaultMapping, m1Clean: { nodeId: 'n1' } },
      })

      store.getState().removeProvider('p1')
      expect(store.getState().moduleMapping.m1Clean.nodeId).toBeNull()
    })

    it('removeProvider 不清理指向其他供应商节点的映射', () => {
      const p1 = sampleProvider('p1')
      const p2 = sampleProvider('p2')
      const n1 = sampleNode('n1', 'p1')
      const n2 = sampleNode('n2', 'p2')
      store.setState({
        providers: [p1, p2],
        providerNodes: [n1, n2],
        moduleMapping: { ...defaultMapping, m1Clean: { nodeId: 'n2' } },
      })

      store.getState().removeProvider('p1')
      expect(store.getState().moduleMapping.m1Clean.nodeId).toBe('n2')
    })
  })

  describe('节点 CRUD', () => {
    it('addProviderNode 追加到列表', () => {
      const n = sampleNode('n1', 'p1')
      store.getState().addProviderNode(n)
      expect(store.getState().providerNodes).toEqual([n])
    })

    it('updateProviderNode 替换同 id', () => {
      const n = sampleNode('n1', 'p1')
      store.getState().addProviderNode(n)
      const updated = { ...n, model: 'gpt-5' }
      store.getState().updateProviderNode(updated)
      expect(store.getState().providerNodes[0].model).toBe('gpt-5')
    })

    it('removeProviderNode 清理指向该节点的 moduleMapping', () => {
      const n = sampleNode('n1', 'p1')
      store.setState({
        providerNodes: [n],
        moduleMapping: { ...defaultMapping, m1Clean: { nodeId: 'n1' }, m2Extract: { nodeId: 'n1' } },
      })

      store.getState().removeProviderNode('n1')
      expect(store.getState().moduleMapping.m1Clean.nodeId).toBeNull()
      expect(store.getState().moduleMapping.m2Extract.nodeId).toBeNull()
    })
  })

  describe('consumeProviderUsage', () => {
    it('未开启次数限制 → 始终返回 true 且不修改状态', () => {
      const n = sampleNode('n1', 'p1')
      store.setState({ providerNodes: [n] })
      expect(store.getState().consumeProviderUsage('n1')).toBe(true)
      expect(store.getState().consumeProviderUsage('n1')).toBe(true)
      expect(store.getState().providerNodes[0].usageLeft).toBeUndefined()
    })

    it('开启次数限制 → 扣减 usageLeft', () => {
      const n: ProviderNode = {
        ...sampleNode('n1', 'p1'),
        usageLimitEnabled: true,
        usageLimit: 3,
        usageLeft: 3,
        usageResetDate: '2026-06-30',
      }
      store.setState({ providerNodes: [n] })

      expect(store.getState().consumeProviderUsage('n1')).toBe(true)
      expect(store.getState().providerNodes[0].usageLeft).toBe(2)
      expect(store.getState().consumeProviderUsage('n1')).toBe(true)
      expect(store.getState().consumeProviderUsage('n1')).toBe(true)
      expect(store.getState().providerNodes[0].usageLeft).toBe(0)
      expect(store.getState().consumeProviderUsage('n1')).toBe(false)
    })

    it('跨自然日重置 usageLeft', () => {
      const yesterday = new Date('2026-06-29T12:00:00')
      const today = new Date('2026-06-30T12:00:00')
      vi.setSystemTime(today)

      const n: ProviderNode = {
        ...sampleNode('n1', 'p1'),
        usageLimitEnabled: true,
        usageLimit: 5,
        usageLeft: 0,
        usageResetDate: `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`,
      }
      store.setState({ providerNodes: [n] })

      expect(store.getState().consumeProviderUsage('n1')).toBe(true)
      expect(store.getState().providerNodes[0].usageLeft).toBe(4)
      expect(store.getState().providerNodes[0].usageResetDate).toBe('2026-06-30')

      vi.useRealTimers()
    })

    it('不存在的节点返回 false', () => {
      expect(store.getState().consumeProviderUsage('missing')).toBe(false)
    })
  })

  describe('订阅', () => {
    it('setState 触发订阅并传新状态', () => {
      const listener = vi.fn()
      store.subscribe(listener)
      const p = sampleProvider('p1')
      store.getState().addProvider(p)
      expect(listener).toHaveBeenCalled()
      const lastState = listener.mock.calls[listener.mock.calls.length - 1][0] as NodePoolState
      expect(lastState.providers).toEqual([p])
    })
  })
})
