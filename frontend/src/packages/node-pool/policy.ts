/**
 * 节点调度策略——纯函数层。
 *
 * 消除 `cleanScheduler.ts` 与 `batch.ts` 在节点可用性检查上的重复逻辑：
 * - 并发未满
 * - 请求间隔已过
 * - 外部可用性（如次数限制）未耗尽
 *
 * 本文件属于节点池包，不依赖 novelhelper 业务代码。
 */

import type { NodeRuntime, NodeRuntimeMap } from './runtime'

/** 可被调度的节点配置基座 */
export interface NodeConfigBase {
  id: string
  maxConcurrency: number
  intervalSec: number
}

/** 可用性检查选项 */
export interface AvailabilityOpts {
  /** 当前时间戳（ms），由调用方统一传入，避免一次调度循环内出现时间漂移 */
  now: number
  /** 外部可用性判定回调，例如次数限制是否耗尽 */
  isExternalAvailable?: (nodeId: string) => boolean
}

/**
 * 检查节点当前是否可接受新请求。
 *
 * 判定条件：
 * 1. 有运行态记录
 * 2. 活跃请求数 < 最大并发
 * 3. 距离上次请求已 >= intervalSec（若 intervalSec > 0）
 * 4. 外部可用性回调返回 true（若提供）
 */
export function isNodeAvailableNow<C extends NodeConfigBase>(
  cfg: C,
  state: NodeRuntime | undefined,
  opts: AvailabilityOpts,
): boolean {
  if (!state) return false
  if (state.activeCount >= cfg.maxConcurrency) return false
  const intervalMs = cfg.intervalSec * 1000
  if (intervalMs > 0 && opts.now - state.lastRequestTime < intervalMs) return false
  if (opts.isExternalAvailable && !opts.isExternalAvailable(cfg.id)) return false
  return true
}

/**
 * 批量调度器专用：从所有节点中挑选"最久未用 → 最少连接"的可用节点。
 *
 * @returns 选中的节点配置及其运行时状态对象（与传入 map 中的是同一引用，调用方可直接修改）
 */
export function pickLeastLoadedNode<C extends NodeConfigBase>(
  nodeConfigs: C[],
  states: NodeRuntimeMap,
  opts: AvailabilityOpts,
): { cfg: C; state: NodeRuntime } | null {
  const candidates: { cfg: C; state: NodeRuntime }[] = []
  for (const cfg of nodeConfigs) {
    const state = states.get(cfg.id)
    if (!state) continue
    if (!isNodeAvailableNow(cfg, state, opts)) continue
    candidates.push({ cfg, state })
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const timeDiff = a.state.lastRequestTime - b.state.lastRequestTime
    if (timeDiff !== 0) return timeDiff
    return a.state.activeCount - b.state.activeCount
  })
  return candidates[0]
}
