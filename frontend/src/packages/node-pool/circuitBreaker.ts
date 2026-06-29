/**
 * 节点熔断器：连续失败计数 + 阈值熔断 + 手动恢复。
 *
 * 纯状态机，不感知调度器的 activeBatches / onNodeDisabled 回调——
 * 触发熔断的副作用（中止在途 batch、通知 UI）由调用方在 recordFailure 返回 true 时自行处理，
 * 以此解耦熔断判定与调度器专属副作用。
 *
 * 本文件属于节点池包，不依赖 novelhelper 业务代码。
 */

export class NodeCircuitBreaker {
  /** 节点连续失败计数（成功或恢复即归零） */
  private readonly consecFails = new Map<string, number>()
  /** 已熔断的节点 id 集合 */
  private readonly disabled = new Set<string>()
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  isDisabled(nodeId: string): boolean {
    return this.disabled.has(nodeId)
  }

  /** 成功 → 连续失败计数归零（不影响已熔断状态） */
  recordSuccess(nodeId: string): void {
    this.consecFails.set(nodeId, 0)
  }

  /**
   * 记录一次失败：累加连续失败计数。
   * @returns 本次是否**刚刚**触发熔断（达阈值且此前未熔断）；调用方据此执行副作用。
   *          已熔断的节点再次失败返回 false（不重复触发）。
   */
  recordFailure(nodeId: string): boolean {
    if (this.disabled.has(nodeId)) return false
    const fails = (this.consecFails.get(nodeId) ?? 0) + 1
    this.consecFails.set(nodeId, fails)
    if (fails >= this.limit) {
      this.disabled.add(nodeId)
      return true
    }
    return false
  }

  /** 手动恢复（用户重新启用曾被熔断的节点）：清熔断 + 连续失败计数归零 */
  reset(nodeId: string): void {
    this.disabled.delete(nodeId)
    this.consecFails.set(nodeId, 0)
  }

  /** 过滤出未熔断的节点（保持原顺序） */
  availableNodes<T extends { id: string }>(nodes: T[]): T[] {
    return nodes.filter((n) => !this.disabled.has(n.id))
  }
}
