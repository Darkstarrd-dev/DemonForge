import { describe, it, expect } from 'vitest'
import { serializeNodePool, hydrateNodePoolBundle, NODE_POOL_BUNDLE_VERSION } from './serialize'
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping } from './types'

const sampleProvider: Provider = {
  id: 'prov-1',
  name: '本地',
  baseURL: 'http://127.0.0.1:8080/v1',
  apiKeys: [{ id: 'key-1', key: 'sk-12345678', enabled: true, state: 'ok' }],
  rotationPolicy: 'round-robin',
  createdAt: 1,
}

const sampleNode: ProviderNode = {
  id: 'node-1',
  providerId: 'prov-1',
  nodeType: 'text',
  model: 'qwen',
  enabled: true,
  lastTestResult: null,
  maxConcurrency: 2,
  batchChars: 10000,
  intervalSec: 0,
}

const defaultMapping: Record<ModuleKey, ModuleModelMapping> = {
  m0Arch: { nodeId: null },
  m0Blueprint: { nodeId: null },
  m1Clean: { nodeId: null },
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

describe('serializeNodePool', () => {
  it('序列化为标准 NodePoolBundle', () => {
    const bundle = serializeNodePool({
      providers: [sampleProvider],
      providerNodes: [sampleNode],
      moduleMapping: defaultMapping,
    })
    expect(bundle.version).toBe(NODE_POOL_BUNDLE_VERSION)
    expect(bundle.kind).toBe('node-pool')
    expect(bundle.app).toBe('novelhelper')
    expect(bundle.providers).toHaveLength(1)
    expect(bundle.providerNodes).toHaveLength(1)
    expect(bundle.moduleMapping.m1Clean.nodeId).toBeNull()
  })

  it('redact 模式脱敏 apiKeys.key', () => {
    const bundle = serializeNodePool(
      { providers: [sampleProvider], providerNodes: [sampleNode], moduleMapping: defaultMapping },
      { redact: true },
    )
    const key = bundle.providers[0].apiKeys[0].key
    expect(key.startsWith('sk-1')).toBe(true)
    expect(key.endsWith('****')).toBe(true)
    expect(key.length).toBeLessThan(sampleProvider.apiKeys[0].key.length)
  })

  it('缺字段时 normalize 补默认值', () => {
    const bundle = serializeNodePool({
      providers: [{
        id: 'prov-2',
        name: '云端',
        baseURL: 'https://api.example.com/v1',
        apiKeys: [{ key: '' }],
      } as unknown as Provider],
      providerNodes: [{
        id: 'node-2',
        providerId: 'prov-2',
        model: 'demo',
      } as unknown as ProviderNode],
      moduleMapping: {},
    })
    expect(bundle.providers[0].rotationPolicy).toBe('round-robin')
    expect(bundle.providers[0].apiKeys[0].enabled).toBe(true)
    expect(bundle.providerNodes[0].nodeType).toBe('text')
    expect(bundle.providerNodes[0].maxConcurrency).toBe(2)
  })
})

describe('hydrateNodePoolBundle', () => {
  it('解析标准 bundle', () => {
    const raw = JSON.stringify(serializeNodePool({
      providers: [sampleProvider],
      providerNodes: [sampleNode],
      moduleMapping: defaultMapping,
    }))
    const result = hydrateNodePoolBundle(raw, { defaultMapping })
    expect(result.fatal).toBeNull()
    expect(result.bundle).not.toBeNull()
    expect(result.bundle!.providers).toHaveLength(1)
    expect(result.bundle!.providerNodes).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
  })

  it('裸对象（无 bundle 包装）自动适配', () => {
    const raw = JSON.stringify({ providers: [sampleProvider], providerNodes: [sampleNode] })
    const result = hydrateNodePoolBundle(raw, { defaultMapping })
    expect(result.fatal).toBeNull()
    expect(result.bundle).not.toBeNull()
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.bundle!.moduleMapping.m1Clean).toBeDefined()
  })

  it('坏条目跳过并记 warning', () => {
    const raw = JSON.stringify({
      providers: [sampleProvider, { name: 'bad' }],
      providerNodes: [sampleNode, { id: 'bad' }],
      moduleMapping: {},
    })
    const result = hydrateNodePoolBundle(raw, { defaultMapping })
    expect(result.fatal).toBeNull()
    expect(result.bundle!.providers).toHaveLength(1)
    expect(result.bundle!.providerNodes).toHaveLength(1)
    expect(result.warnings.some((w) => w.includes('缺少核心字段'))).toBe(true)
  })

  it('非 JSON 返回 fatal', () => {
    const result = hydrateNodePoolBundle('not json')
    expect(result.bundle).toBeNull()
    expect(result.fatal).not.toBeNull()
  })

  it('moduleMapping 与 defaultMapping 合并', () => {
    const raw = JSON.stringify(serializeNodePool({
      providers: [sampleProvider],
      providerNodes: [sampleNode],
      moduleMapping: { m1Clean: { nodeId: 'node-1' } } as Record<ModuleKey, ModuleModelMapping>,
    }))
    const result = hydrateNodePoolBundle(raw, { defaultMapping })
    expect(result.bundle!.moduleMapping.m1Clean.nodeId).toBe('node-1')
    expect(result.bundle!.moduleMapping.m2Extract.nodeId).toBeNull()
  })
})
