/**
 * Provider / Node 解析器（P1 节点池重构）。
 *
 * 新模型把「供应商（Provider）」与「节点（ProviderNode）」分开持久化：
 * - Provider：name / baseURL / apiKeys[] / rotationPolicy
 * - ProviderNode：providerId / nodeType / model / 并发/批次/额度等
 *
 * 运行时通过本模块把两者合并为 ResolvedProviderNode（旧 ProviderNode 字段超集），
 * 让绝大多数消费方无需关心底层拆分。
 */
import type {
  Provider,
  ProviderApiKey,
  ProviderNode,
  ResolvedProviderNode,
} from '../services/types'

export interface ResolverState {
  providers: Provider[]
  providerNodes: ProviderNode[]
}

/** 取运行时显示名：供应商名 · 模型。 */
export function resolvedNodeName(provider: Provider | undefined, node: ProviderNode): string {
  const pName = provider?.name ?? '(已删除供应商)'
  return `${pName} · ${node.model}`
}

/** 从状态里按 id 找供应商。 */
export function findProviderById(state: ResolverState, providerId: string): Provider | undefined {
  return state.providers.find((p) => p.id === providerId)
}

/** 从状态里按 id 找节点。 */
export function findProviderNodeById(state: ResolverState, nodeId: string): ProviderNode | undefined {
  return state.providerNodes.find((n) => n.id === nodeId)
}

/** 是否支持图生图：仅图片节点且协议为 gpt / xai。 */
function supportsImageEdit(node: ProviderNode): boolean {
  return node.nodeType === 'image' && (node.protocol === 'gpt' || node.protocol === 'xai')
}

/**
 * 按轮询策略从供应商的 apiKeys 中选择一个可用 key。
 * - 只考虑 enabled=true 且 state !== 'disabled' 的 key。
 * - Round-Robin：按 lastUsedAt 最久未用取下一个 ok/exhausted key；全部 exhausted 也返回一个让后端给明确错误。
 * - Failover：固定 state='ok' 的 key；没有 ok 时取下一个非 disabled。
 */
export function selectApiKey(provider: Provider): { key: ProviderApiKey; keyId: string } | null {
  const candidates = provider.apiKeys.filter((k) => k.enabled && k.state !== 'disabled')
  if (candidates.length === 0) return null

  if (provider.rotationPolicy === 'failover') {
    const ok = candidates.find((k) => k.state === 'ok')
    const target = ok ?? candidates[0]
    return { key: target, keyId: target.id }
  }

  // Round-robin：优先 ok，其次 exhausted，按 lastUsedAt 升序（最久未用优先）
  const sorted = [...candidates].sort((a, b) => (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0))
  const ok = sorted.find((k) => k.state === 'ok')
  const target = ok ?? sorted[0]
  return { key: target, keyId: target.id }
}

/** 标记某 key 已被使用（更新 lastUsedAt）。 */
export function markKeyUsed(provider: Provider, keyId: string): Provider {
  return {
    ...provider,
    apiKeys: provider.apiKeys.map((k) =>
      k.id === keyId ? { ...k, lastUsedAt: Date.now() } : k,
    ),
  }
}

/** 根据错误信息/状态码更新 key 状态。返回更新后的 Provider。 */
export function updateKeyStateByError(
  provider: Provider,
  keyId: string,
  statusCode?: number,
  errorText?: string,
): Provider {
  const text = (errorText ?? '').toLowerCase()
  let nextState: ProviderApiKey['state'] | undefined

  if (statusCode === 401 || statusCode === 403 || text.includes('invalid api key')) {
    nextState = 'disabled'
  } else if (
    statusCode === 429 ||
    text.includes('rate limit') ||
    text.includes('quota exceeded') ||
    text.includes('insufficient quota') ||
    text.includes('额度') ||
    text.includes('余额不足')
  ) {
    nextState = 'exhausted'
  } else if (statusCode == null || statusCode >= 500) {
    // 网络/5xx：累加连续失败，达到阈值标 disabled
    const key = provider.apiKeys.find((k) => k.id === keyId)
    const failures = (key?.consecFailures ?? 0) + 1
    if (failures >= 3) nextState = 'disabled'
    else {
      return {
        ...provider,
        apiKeys: provider.apiKeys.map((k) =>
          k.id === keyId ? { ...k, consecFailures: failures } : k,
        ),
      }
    }
  }

  if (!nextState) return provider

  return {
    ...provider,
    apiKeys: provider.apiKeys.map((k) =>
      k.id === keyId
        ? {
            ...k,
            state: nextState,
            consecFailures: nextState === 'disabled' ? (k.consecFailures ?? 0) : 0,
          }
        : k,
    ),
  }
}

/**
 * 解析单个节点：合并 Provider 连接信息 + 选中 API KEY。
 * 找不到供应商时返回 null（节点已孤儿，UI 应提示）。
 */
export function resolveProviderNode(
  state: ResolverState,
  nodeId: string,
): ResolvedProviderNode | null {
  const node = findProviderNodeById(state, nodeId)
  if (!node) return null
  const provider = findProviderById(state, node.providerId)
  if (!provider) return null

  const selected = selectApiKey(provider)
  if (!selected) {
    // 无可用 key 时仍返回 ResolvedProviderNode，但 apiKey 为空，方便调用方给出明确错误
    return {
      ...node,
      providerName: provider.name,
      name: resolvedNodeName(provider, node),
      baseURL: provider.baseURL,
      apiKey: '',
      apiKeyId: '',
      supportsImageEdit: supportsImageEdit(node),
    }
  }

  return {
    ...node,
    providerName: provider.name,
    name: resolvedNodeName(provider, node),
    baseURL: provider.baseURL,
    apiKey: selected.key.key,
    apiKeyId: selected.keyId,
    supportsImageEdit: supportsImageEdit(node),
  }
}

/** 解析全部节点（过滤已孤儿节点）。 */
export function resolveProviderNodes(state: ResolverState): ResolvedProviderNode[] {
  return state.providerNodes
    .map((n) => resolveProviderNode(state, n.id))
    .filter((n): n is ResolvedProviderNode => n !== null)
}

/**
 * 解析单个节点并**标记该 key 为已用**（写回 provider.lastUsedAt）。
 * 用于实际发请求前：调用方拿到 ResolvedProviderNode 后应把 provider 状态写回 store。
 */
export function resolveAndUseProviderNode(
  state: ResolverState,
  nodeId: string,
): { node: ResolvedProviderNode | null; provider?: Provider } {
  const node = resolveProviderNode(state, nodeId)
  if (!node || !node.apiKeyId) return { node }
  const provider = findProviderById(state, node.providerId)
  if (!provider) return { node }
  const updated = markKeyUsed(provider, node.apiKeyId)
  return { node, provider: updated }
}
