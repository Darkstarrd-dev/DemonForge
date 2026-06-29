/**
 * 节点运行时状态（Node Runtime）。
 *
 * 调度器内部维护的运行态，不持久化。记录每个节点当前活跃请求数 + 上次请求时间，
 * 供 `isNodeAvailableNow` / `pickLeastLoadedNode` 判定。
 *
 * 本文件属于节点池包，不依赖 novelhelper 业务代码。
 */

/** 单个节点的运行时状态 */
export interface NodeRuntime {
  /** 当前活跃请求数 */
  activeCount: number
  /** 上次请求发起时间戳（ms） */
  lastRequestTime: number
}

/** 节点 id → 运行时状态的映射 */
export type NodeRuntimeMap = Map<string, NodeRuntime>
