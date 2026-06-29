/**
 * 节点池配置的独立序列化 / 反序列化。
 *
 * 支持：
 * 1. 单独导出节点池（不依赖整体 settings 备份）。
 * 2. 导入节点池到另一实例（增量合并由调用方决定）。
 * 3. 脱敏导出：apiKeys.key 只保留前 4 位 + ****。
 * 4. 向后兼容：缺字段 / 旧版本自动补默认值。
 *
 * 本文件属于节点池包，仅依赖节点池内部类型与 normalize 函数，
 * 不依赖 novelhelper 业务代码。
 */
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping, NodePoolStateCore } from './types'
import { normalizeProvider, normalizeProviderNode } from './normalize'

/** 节点池独立备份包格式版本。 */
export const NODE_POOL_BUNDLE_VERSION = 1

export interface NodePoolBundle {
  version: number
  exportedAt: string
  app: 'novelhelper'
  kind: 'node-pool'
  providers: Provider[]
  providerNodes: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
}

export interface SerializeNodePoolOptions {
  /** true 则脱敏 apiKeys.key（分享/迁移场景）。 */
  redact?: boolean
}

function redactProvider(p: Provider): Provider {
  return {
    ...p,
    apiKeys: p.apiKeys.map((k) => ({
      ...k,
      key: k.key.length > 4 ? `${k.key.slice(0, 4)}****` : '****',
    })),
  }
}

/** 把节点池状态序列化为独立备份包（纯函数）。 */
export function serializeNodePool(
  state: NodePoolStateCore,
  opts: SerializeNodePoolOptions = {},
): NodePoolBundle {
  return {
    version: NODE_POOL_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'novelhelper',
    kind: 'node-pool',
    providers: (state.providers ?? []).map((p) =>
      opts.redact ? redactProvider(normalizeProvider(p)) : normalizeProvider(p),
    ),
    providerNodes: (state.providerNodes ?? []).map((n) => normalizeProviderNode(n)),
    moduleMapping: { ...(state.moduleMapping ?? {}) },
  }
}

export interface HydrateNodePoolOptions {
  /** 当 bundle 缺少某些 ModuleKey 时，用此默认值填充。 */
  defaultMapping?: Record<ModuleKey, ModuleModelMapping>
}

export interface HydrateNodePoolResult {
  bundle: NodePoolBundle | null
  warnings: string[]
  fatal: string | null
}

/**
 * 解析节点池独立备份包（纯函数，容错）。
 *
 * 策略：
 * - 非 JSON / 非对象 → fatal。
 * - 缺 version → 当 v0，warning。
 * - providers / providerNodes 每项单独 try/catch，坏条目跳过记 warning。
 * - moduleMapping 与 defaultMapping 合并，确保新增的 ModuleKey 有默认值。
 */
export function hydrateNodePoolBundle(
  raw: string,
  opts: HydrateNodePoolOptions = {},
): HydrateNodePoolResult {
  const warnings: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { bundle: null, warnings, fatal: `文件不是有效的 JSON：${String(err)}` }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { bundle: null, warnings, fatal: '文件内容不是 JSON 对象' }
  }
  const obj = parsed as Record<string, unknown>

  // 兼容"裸节点池数组/对象"旧格式：无 version/app/kind 但有 providers
  const looksLikeBarePool =
    obj.version === undefined &&
    obj.app === undefined &&
    (obj.providers !== undefined || obj.providerNodes !== undefined)
  if (looksLikeBarePool) {
    warnings.push('检测到裸节点池对象（无 bundle 包装），已自动适配。')
    const bundle = normalizeBundle(
      {
        version: 0,
        exportedAt: '',
        app: 'novelhelper',
        kind: 'node-pool',
        providers: obj.providers,
        providerNodes: obj.providerNodes,
        moduleMapping: obj.moduleMapping,
      } as Record<string, unknown>,
      warnings,
      opts,
    )
    return { bundle, warnings, fatal: null }
  }

  const version = typeof obj.version === 'number' ? obj.version : -1
  if (version < 0) {
    warnings.push('未检测到 version 字段，按旧版处理。')
  } else if (version > NODE_POOL_BUNDLE_VERSION) {
    warnings.push(
      `bundle 版本 v${version} 高于当前支持 v${NODE_POOL_BUNDLE_VERSION}，多余字段将被忽略。`,
    )
  }

  const app = typeof obj.app === 'string' ? obj.app : ''
  if (app && app !== 'novelhelper') {
    warnings.push(`app 字段为 "${app}"（非 novelhelper），仍尝试导入。`)
  }

  if (obj.kind !== undefined && obj.kind !== 'node-pool') {
    warnings.push(`kind 字段为 "${String(obj.kind)}"（非 node-pool），仍按节点池处理。`)
  }

  const bundle = normalizeBundle(obj, warnings, opts)
  return { bundle, warnings, fatal: null }
}

function normalizeBundle(
  obj: Record<string, unknown>,
  warnings: string[],
  opts: HydrateNodePoolOptions,
): NodePoolBundle {
  const providers: Provider[] = []
  if (Array.isArray(obj.providers)) {
    obj.providers.forEach((p, i) => {
      if (!p || typeof p !== 'object') {
        warnings.push(`providers 第 ${i + 1} 项不是对象，已跳过。`)
        return
      }
      const item = p as Record<string, unknown>
      if (
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.baseURL !== 'string'
      ) {
        warnings.push(`providers 第 ${i + 1} 项缺少核心字段(id/name/baseURL)，已跳过。`)
        return
      }
      try {
        providers.push(normalizeProvider(item as Parameters<typeof normalizeProvider>[0]))
      } catch (err) {
        warnings.push(`providers 第 ${i + 1} 项规范化失败：${String(err)}，已跳过。`)
      }
    })
  }

  const providerNodes: ProviderNode[] = []
  if (Array.isArray(obj.providerNodes)) {
    obj.providerNodes.forEach((n, i) => {
      if (!n || typeof n !== 'object') {
        warnings.push(`providerNodes 第 ${i + 1} 项不是对象，已跳过。`)
        return
      }
      const item = n as Record<string, unknown>
      if (
        typeof item.id !== 'string' ||
        typeof item.providerId !== 'string' ||
        typeof item.model !== 'string'
      ) {
        warnings.push(`providerNodes 第 ${i + 1} 项缺少核心字段(id/providerId/model)，已跳过。`)
        return
      }
      try {
        providerNodes.push(
          normalizeProviderNode(item as Parameters<typeof normalizeProviderNode>[0]),
        )
      } catch (err) {
        warnings.push(`providerNodes 第 ${i + 1} 项规范化失败：${String(err)}，已跳过。`)
      }
    })
  }

  let moduleMapping: Record<ModuleKey, ModuleModelMapping> = {
    ...(opts.defaultMapping ?? {}) as Record<ModuleKey, ModuleModelMapping>,
  }
  if (obj.moduleMapping && typeof obj.moduleMapping === 'object') {
    moduleMapping = { ...moduleMapping, ...(obj.moduleMapping as Record<ModuleKey, ModuleModelMapping>) }
  }

  return {
    version:
      typeof obj.version === 'number' && obj.version >= 0
        ? obj.version
        : NODE_POOL_BUNDLE_VERSION,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    app: 'novelhelper',
    kind: 'node-pool' as const,
    providers,
    providerNodes,
    moduleMapping,
  }
}
