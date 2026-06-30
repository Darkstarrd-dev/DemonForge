/**
 * 节点池持久化辅助：settings.json 载荷构造 / 启动 hydrate。
 *
 * 与 serialize.ts 区分：
 * - serialize.ts：独立导出/导入节点池备份包（带 version/app/kind 包装）。
 * - persistence.ts：与 settings.json 交互的薄层（无包装，保持引用稳定以配合脏检查）。
 */
import type {
  Provider,
  ProviderNode,
  ModuleKey,
  ModuleModelMapping,
  NodePoolStateCore,
} from './types'
import { normalizeProvider, normalizeProviderNode } from './normalize'

/** 旧版 ProviderNode 形态（迁移用）：扁平结构，自身携带 baseURL/apiKey/model。 */
interface OldProviderNode {
  id: string
  name: string
  nodeType: 'text' | 'image'
  baseURL: string
  apiKey: string
  model: string
  protocol?: 'modelscope' | 'gpt' | 'xai'
  enabled?: boolean
  lastTestResult?: 'ok' | 'fail' | null
  maxConcurrency?: number
  batchChars?: number
  intervalSec?: number
  usageLimitEnabled?: boolean
  usageLimit?: number
  usageLeft?: number
  usageResetDate?: string
  isMultimodal?: boolean
  supportsImageEdit?: boolean
}

export interface NodePoolSettingsPayload {
  providers: Provider[]
  providerNodes: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
}

/** 构造写入 settings.json 的节点池载荷（直接透传引用，不重新规范化，配合持久化脏检查）。 */
export function toNodePoolSettingsPayload(
  state: NodePoolStateCore,
): NodePoolSettingsPayload {
  return {
    providers: state.providers,
    providerNodes: state.providerNodes,
    moduleMapping: state.moduleMapping,
  }
}

export interface HydrateNodePoolOptions {
  /** 当 settings 缺少某些 ModuleKey 时，用此默认值填充。 */
  defaultMapping?: Record<ModuleKey, ModuleModelMapping>
}

/**
 * 从 settings.json 原始对象中解析并规范化节点池状态。
 *
 * 处理：
 * - 新两层格式：providers + providerNodes
 * - 旧扁平格式：providers 数组元素含 model/apiKey → 拆成 Provider + ProviderNode
 * - moduleMapping 与 defaultMapping 合并
 *
 * 返回 Partial<NodePoolStateCore>，可直接 setState 到 nodePoolStore。
 */
export function hydrateNodePoolState(
  raw: unknown,
  opts: HydrateNodePoolOptions = {},
): Partial<NodePoolStateCore> {
  const patch: Partial<NodePoolStateCore> = {}
  const d = raw as Partial<{
    providers: (Provider | OldProviderNode)[]
    providerNodes: ProviderNode[]
    moduleMapping: Record<ModuleKey, ModuleModelMapping>
  }>

  if (Array.isArray(d.providers) && d.providers.length > 0) {
    const first = d.providers[0]
    const isOldProviderNode =
      first &&
      typeof first === 'object' &&
      typeof (first as OldProviderNode).model === 'string'

    if (isOldProviderNode) {
      const migratedProviders: Provider[] = []
      const migratedNodes: ProviderNode[] = []
      for (const legacy of d.providers as unknown as OldProviderNode[]) {
        const providerId = legacy.id
        migratedProviders.push(
          normalizeProvider({
            id: providerId,
            name: legacy.name ?? '未命名供应商',
            baseURL: legacy.baseURL,
            apiKey: legacy.apiKey,
            createdAt: Date.now(),
          } as Parameters<typeof normalizeProvider>[0]),
        )
        migratedNodes.push(
          normalizeProviderNode({
            id: providerId,
            providerId,
            nodeType: legacy.nodeType,
            protocol: legacy.protocol,
            model: legacy.model,
            enabled: legacy.enabled,
            lastTestResult: legacy.lastTestResult,
            maxConcurrency: legacy.maxConcurrency,
            batchChars: legacy.batchChars,
            intervalSec: legacy.intervalSec,
            usageLimitEnabled: legacy.usageLimitEnabled,
            usageLimit: legacy.usageLimit,
            usageLeft: legacy.usageLeft,
            usageResetDate: legacy.usageResetDate,
            isMultimodal: legacy.isMultimodal,
          } as Parameters<typeof normalizeProviderNode>[0]),
        )
      }
      patch.providers = migratedProviders
      patch.providerNodes = migratedNodes
    } else {
      patch.providers = (d.providers as Provider[]).map((p) =>
        normalizeProvider(p),
      )
      patch.providerNodes = Array.isArray(d.providerNodes)
        ? d.providerNodes.map((n) => normalizeProviderNode(n))
        : []
    }
  } else if (Array.isArray(d.providerNodes) && d.providerNodes.length > 0) {
    // providers 为空或缺失，但 providerNodes 存在 → 按新格式只恢复节点
    patch.providers = []
    patch.providerNodes = d.providerNodes.map((n) => normalizeProviderNode(n))
  }

  if (d.moduleMapping && typeof d.moduleMapping === 'object') {
    patch.moduleMapping = {
      ...(opts.defaultMapping ?? {}),
      ...d.moduleMapping,
    }
  }

  return patch
}
