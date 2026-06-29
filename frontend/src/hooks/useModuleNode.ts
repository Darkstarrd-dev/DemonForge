/**
 * 节点选择归一化 · 默认节点解析 hook（P1 地基）。
 *
 * 统一各模块「默认节点」的解析链，替代散落各处的临时解析：
 * - M0 旧取 `moduleMapping.m0Arch` 兜底首个
 * - M2 旧取 `moduleMapping.m2Extract`
 * - role-chat 旧直接 `textNodes[0]`（因 ModuleKey 无 roleChat 键，本非 bug）
 *
 * 解析优先级（临时本次生效，不写回 moduleMapping）：
 *   1. localOverride（调用方 state，用户本次显式选择）
 *   2. moduleMapping[moduleKey].nodeId（模块默认配置）
 *   3. 首个 enabled 同 kind 节点（兜底）
 *
 * `isDefault` 表示当前命中走的是「moduleMapping 默认或兜底」而非用户临时选择，
 * 用于驱动按钮「（默认）」后缀显示。
 */
import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import type { ModuleKey, ResolvedProviderNode } from '../services/types'
import { resolveProviderNode, resolveProviderNodes } from '../utils/providerResolver'

export interface ModuleNodeState {
  /** 解析出的节点 id（无可用节点时为空串）。 */
  nodeId: string
  /** 节点对象（无可用时 undefined）。 */
  node: ResolvedProviderNode | undefined
  /** 是否走了默认（即 value 未给或值无效）。决定按钮「（默认）」后缀。 */
  isDefault: boolean
}

/**
 * @param moduleKey 模块映射键（如 'm0Arch' / 'm2Extract'）。
 * @param kind      节点类型（文本/图片）。
 * @param localOverride 调用方维护的临时选中 id（undefined=未选，走默认）。
 */
export function useModuleNode(
  moduleKey: ModuleKey,
  kind: 'text' | 'image',
  localOverride?: string,
): ModuleNodeState {
  const providers = useAppStore((s) => s.providers)
  const providerNodes = useAppStore((s) => s.providerNodes)
  const moduleMapping = useAppStore((s) => s.moduleMapping)

  return useMemo(() => {
    const resolved = resolveProviderNodes({ providers, providerNodes })
    const enabledOfKind = resolved.filter((n) => n.enabled && n.nodeType === kind)

    // 1. 本地覆盖优先（用户本次显式选择）
    if (localOverride) {
      const found = resolveProviderNode({ providers, providerNodes }, localOverride)
      if (found && found.enabled && found.nodeType === kind) {
        return { nodeId: found.id, node: found, isDefault: false }
      }
    }

    // 2. moduleMapping 默认
    const mappedId = moduleMapping[moduleKey]?.nodeId
    if (mappedId) {
      const found = resolveProviderNode({ providers, providerNodes }, mappedId)
      if (found && found.enabled && found.nodeType === kind) {
        return { nodeId: found.id, node: found, isDefault: true }
      }
    }

    // 3. 兜底首个 enabled 同 kind 节点
    const first = enabledOfKind[0]
    return { nodeId: first?.id ?? '', node: first, isDefault: true }
  }, [providers, providerNodes, moduleMapping, moduleKey, kind, localOverride])
}
