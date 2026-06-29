/**
 * Provider / Node 规范化（纯函数，无副作用，无框架依赖）。
 *
 * 从 appStore.ts 抽出——backup.ts 的纯函数单测需要引用它，而 appStore 依赖 zustand/浏览器
 * 环境无法在纯 node 下加载。此处独立成模块，appStore 与 backup.ts 共用。
 */
import type { Provider, ProviderApiKey, ProviderNode, ProviderRotationPolicy } from '../services/types'

const genKeyId = (() => {
  let i = 0
  return () => `key-${Date.now()}-${++i}`
})()

/** 规范化 ProviderApiKey：为旧版/缺字段数据补默认值。 */
export function normalizeProviderApiKey(
  k: Partial<ProviderApiKey> & { key: string },
): ProviderApiKey {
  return {
    id: k.id || genKeyId(),
    key: k.key,
    label: typeof k.label === 'string' ? k.label : '',
    enabled: k.enabled !== false,
    state:
      k.state === 'exhausted' || k.state === 'disabled'
        ? (k.state as ProviderApiKey['state'])
        : 'ok',
    lastUsedAt: typeof k.lastUsedAt === 'number' ? k.lastUsedAt : undefined,
    consecFailures: typeof k.consecFailures === 'number' ? k.consecFailures : 0,
  }
}

/** 规范化 Provider：为旧版/缺字段数据补默认值。 */
export function normalizeProvider(p: Partial<Provider> & { id: string; name: string; baseURL: string }): Provider {
  const apiKeys: ProviderApiKey[] = []
  if (Array.isArray(p.apiKeys) && p.apiKeys.length > 0) {
    p.apiKeys.forEach((k) => {
      if (k && typeof k === 'object' && typeof (k as ProviderApiKey).key === 'string') {
        apiKeys.push(normalizeProviderApiKey(k as ProviderApiKey))
      }
    })
  }
  // 向后兼容：旧版 ProviderNode 拆过来的 apiKey 字段 → 单 key
  const legacyKey = (p as { apiKey?: string }).apiKey
  if (apiKeys.length === 0 && typeof legacyKey === 'string') {
    apiKeys.push(normalizeProviderApiKey({ key: legacyKey }))
  }
  if (apiKeys.length === 0) {
    apiKeys.push(normalizeProviderApiKey({ key: '' }))
  }

  const policy = (p as { rotationPolicy?: string }).rotationPolicy
  const rotationPolicy: ProviderRotationPolicy =
    policy === 'failover' ? 'failover' : 'round-robin'

  return {
    id: p.id,
    name: p.name,
    baseURL: p.baseURL,
    apiKeys,
    rotationPolicy,
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
  }
}

/** 规范化 ProviderNode：为旧版/缺字段数据补默认值。 */
export function normalizeProviderNode(
  n: Partial<ProviderNode> & { id: string; providerId: string; model: string },
): ProviderNode {
  const nodeType = n.nodeType === 'image' ? 'image' : 'text'
  return {
    ...n,
    providerId: n.providerId,
    nodeType,
    model: n.model,
    protocol:
      nodeType === 'image'
        ? n.protocol === 'gpt'
          ? 'gpt'
          : n.protocol === 'xai'
            ? 'xai'
            : 'modelscope'
        : undefined,
    enabled: n.enabled !== false,
    lastTestResult: n.lastTestResult ?? null,
    maxConcurrency: typeof n.maxConcurrency === 'number' && n.maxConcurrency > 0 ? n.maxConcurrency : 2,
    batchChars:
      typeof n.batchChars === 'number' && n.batchChars > 0
        ? n.batchChars
        : // 向后兼容：旧版 batchSize 转换为 batchChars
          typeof (n as { batchSize?: number }).batchSize === 'number'
          ? (n as { batchSize?: number }).batchSize! * 3000
          : 10000,
    intervalSec: typeof n.intervalSec === 'number' && n.intervalSec >= 0 ? n.intervalSec : 0,
    usageLimitEnabled: n.usageLimitEnabled === true,
    usageLimit: typeof n.usageLimit === 'number' && n.usageLimit >= 0 ? n.usageLimit : 0,
    usageLeft: typeof n.usageLeft === 'number' && n.usageLeft >= 0 ? n.usageLeft : 0,
    usageResetDate: typeof n.usageResetDate === 'string' ? n.usageResetDate : '',
    isMultimodal: n.isMultimodal === true,
  }
}
