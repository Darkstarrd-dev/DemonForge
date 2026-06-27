// M1 清理中央调度器（CleanScheduler 类）。
//
// 由 startCleanQueue 闭包工厂类化而来（A-6）：闭包状态 → 私有字段，调度逻辑 → 方法。
// 流式传输（streamSingleChapter/streamBatch）、熔断（NodeCircuitBreaker）、组 batch（dequeueBatch）
// 均委托给独立单元，本类只负责"取章 → 分配给空闲节点 → 重试/熔断/收口"的调度编排。
//
// 对外契约不变：startCleanQueue(...) 仍返回 CleanQueueHandle，调用方（Step3Clean / book-reader 经 api.ts）零改动。
//
// 模型：节点 = CPU，maxConcurrency = 核心数，章节 = 任务；调度器从共享队列取章分配给有空闲核心的节点。
// intervalSec 是节点级全局计时——同一节点任意两次请求至少间隔该秒数。支持运行中 updateNodes() 热更新节点池。

import {
  streamSingleChapter,
  streamBatch,
  CleanError,
  type CleanNode,
  type CleanQueueCallbacks,
  type CleanQueueHandle,
} from './llm'
import { dequeueBatch } from './dequeue'
import { NodeCircuitBreaker } from './circuitBreaker'

interface NodeRuntime {
  activeCount: number
  lastRequestTime: number
}

interface ChapterTask {
  id: string
  content: string
}

export interface CleanQueueOpts {
  systemPrompt?: string
  isNodeAvailable?: (nodeId: string) => boolean
  autoRetry?: boolean
}

/** 章节级重试预算：单章累计失败达此值判终态失败（非 autoRetry 模式） */
const MAX_RETRIES = 3
/** 节点连续失败达此值触发熔断 */
const NODE_FAIL_LIMIT = 3

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class CleanScheduler {
  private readonly chapters: { id: string; content: string }[]
  private readonly cb: CleanQueueCallbacks
  private readonly systemPrompt?: string
  private readonly isNodeAvailable?: (nodeId: string) => boolean
  private readonly autoRetry?: boolean

  private paused = false
  private stopped = false
  private active = 0
  private finished = false

  // 可变状态——被 worker 循环读取/修改
  private nodeConfigs: CleanNode[]
  private readonly nodeStates = new Map<string, NodeRuntime>()

  private readonly retryQueue: ChapterTask[] = []
  private readonly pendingQueue: ChapterTask[]
  // 章节级累计失败次数（batch 失败时同批所有章共享一致的计数，替代原先写在 task 上的 retryCount——
  // 后者在 batch 重建任务时被归零导致 MAX_RETRIES 失效）
  private readonly failCounts = new Map<string, number>()

  // batch 跟踪：batchId → { controller, chapterIds, nodeId }
  private readonly activeBatches = new Map<string, { ac: AbortController; chapterIds: string[]; nodeId: string }>()
  // 模型切换覆盖：chapterId → 强制节点 id（切换后下轮调度仅匹配该节点）
  private readonly nodeOverrides = new Map<string, string>()
  // 节点熔断：连续失败 NODE_FAIL_LIMIT 次的节点被熔断不再分配新任务（计数/熔断状态封装在 NodeCircuitBreaker）
  private readonly breaker = new NodeCircuitBreaker(NODE_FAIL_LIMIT)
  // 章节级"避开节点"：某章在某节点失败后，重试时优先避开它（除非只剩它），降低同一坏节点反复重试
  private readonly chapterAvoidNodes = new Map<string, Set<string>>()
  // per-worker batch 序号：每 executeBatch 递增，供 UI 区分同一 worker 的多批
  private readonly workerBatchSeq = new Map<string, number>()
  // 已 spawn 的 slot 数：updateNodes 时检测 maxConcurrency 增大并动态 spawn 新 worker
  private readonly spawnedSlots = new Map<string, number>()

  private activeWorkers = 0
  private readonly workerPromises: Promise<void>[] = []

  constructor(
    chapters: { id: string; content: string }[],
    nodes: CleanNode[],
    cb: CleanQueueCallbacks,
    opts: CleanQueueOpts = {},
  ) {
    if (!nodes.length) throw new Error('无可用节点')
    this.chapters = chapters
    this.cb = cb
    this.systemPrompt = opts.systemPrompt
    this.isNodeAvailable = opts.isNodeAvailable
    this.autoRetry = opts.autoRetry
    this.nodeConfigs = [...nodes]
    this.pendingQueue = chapters.map((c) => ({ id: c.id, content: c.content }))
    for (const n of this.nodeConfigs) {
      this.nodeStates.set(n.id, { activeCount: 0, lastRequestTime: 0 })
    }
  }

  /** 启动调度：spawn worker + 返回控制句柄 */
  start(): CleanQueueHandle {
    // round-robin per-slot 创建：slot 0 → N1#1, N2#1, N3#1; slot 1 → N1#2, N2#2, N3#2
    // 顺序保证初始分配连续（N1P1→1-10, N2P1→11-20, N3P1→21-30, N1P2→31-40, ...）
    this.activeWorkers = this.nodeConfigs.reduce((sum, n) => sum + n.maxConcurrency, 0)
    const maxSlot = Math.max(...this.nodeConfigs.map((n) => n.maxConcurrency), 0)
    for (let slot = 0; slot < maxSlot; slot++) {
      for (const node of this.nodeConfigs) {
        if (slot < node.maxConcurrency) {
          this.workerPromises.push(this.workerLoopForNode(node, slot))
        }
      }
    }
    // 记录初始每个节点的 worker 数，供 updateNodes 检测增量
    for (const node of this.nodeConfigs) {
      this.spawnedSlots.set(node.id, node.maxConcurrency)
    }
    // 后台兜底：所有 worker 结束时触发 onFinish
    void Promise.all(this.workerPromises).then(() => this.maybeFinish())

    return {
      pause: () => {
        this.paused = true
      },
      resume: () => {
        this.paused = false
      },
      stop: () => this.stopAll(),
      updateNodes: (newNodes) => this.hotUpdateNodes(newNodes),
      switchBatchNode: (batchId, newNodeId) => this.switchBatchNode(batchId, newNodeId),
    }
  }

  private maybeFinish(): void {
    if (!this.finished && this.active === 0 && this.pendingQueue.length === 0 && this.retryQueue.length === 0) {
      this.finished = true
      this.cb.onFinish()
    }
  }

  /** 节点成功：连续失败计数归零 */
  private markNodeSuccess(nodeId: string): void {
    this.breaker.recordSuccess(nodeId)
  }

  /** 记录节点失败：累加连续失败；刚达阈值则熔断——中止该节点在途 batch（章节回流重试）并通知 UI */
  private markNodeFail(node: CleanNode, reason: string): void {
    if (this.breaker.recordFailure(node.id)) {
      // 立即中止该节点所有在途 batch → catch 块将章节放入 retryQueue 供其他节点接管
      for (const [, batch] of this.activeBatches) {
        if (batch.nodeId === node.id) batch.ac.abort()
      }
      this.cb.onNodeDisabled?.(node.id, node.name, `连续 ${NODE_FAIL_LIMIT} 次失败（${reason}），已自动关闭`)
    }
  }

  /** 让某章在重试时避开指定节点 */
  private avoidNodeForChapter(chapterId: string, nodeId: string): void {
    let set = this.chapterAvoidNodes.get(chapterId)
    if (!set) {
      set = new Set()
      this.chapterAvoidNodes.set(chapterId, set)
    }
    set.add(nodeId)
  }

  private async executeBatch(batch: ChapterTask[], node: CleanNode, workerId: string): Promise<void> {
    const ac = new AbortController()
    const batchSeq = (this.workerBatchSeq.get(workerId) ?? 0) + 1
    this.workerBatchSeq.set(workerId, batchSeq)
    let batchId: string | undefined
    try {
      if (batch.length === 1) {
        const task = batch[0]
        this.cb.onStart(task.id, node.name, undefined, node.id, workerId, batchSeq)
        await streamSingleChapter(node, task.content, task.id, this.cb, ac.signal, this.systemPrompt)
        this.nodeOverrides.delete(task.id)
        this.markNodeSuccess(node.id)
      } else {
        batchId = `batch-${Date.now()}-${batch[0].id}`
        const chapterIds = batch.map((t) => t.id)
        this.activeBatches.set(batchId, { ac, chapterIds, nodeId: node.id })
        batch.forEach((t) => {
          this.cb.onStart(t.id, node.name, t === batch[0] ? batchId : undefined, node.id, workerId, batchSeq)
        })
        await streamBatch(node, batch.map((t) => ({ id: t.id, content: t.content })), this.cb, ac.signal, this.systemPrompt)
        for (const t of batch) this.nodeOverrides.delete(t.id)
        this.activeBatches.delete(batchId)
        this.markNodeSuccess(node.id)
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      const aborted = ac.signal.aborted
      const ce = e instanceof CleanError ? e : null
      const phase = ce?.phase ?? 'stream'
      const completed = ce?.completedIds ?? []
      if (!this.stopped && !aborted) {
        if (phase === 'connect') {
          this.markNodeFail(node, errMsg)
        } else {
          // stream 阶段错误不计入熔断 → 连续失败计数归零（等价一次成功）
          this.breaker.recordSuccess(node.id)
        }
      }

      if (!this.stopped) {
        // 收集本批未完成章（跳过已 onDone 的，避免 batch 部分成功时已完成章被重复推回重试）
        const failedTasks: ChapterTask[] = batch
          .filter((t) => !completed.includes(t.id))
          .map((t) => ({
            id: t.id,
            content: this.chapters.find((c) => c.id === t.id)?.content ?? t.content,
          }))

        // 让失败章重试时避开当前节点（per-node 模型下必须避让，否则同 worker 反复失败）
        failedTasks.forEach((t) => this.avoidNodeForChapter(t.id, node.id))

        for (const t of failedTasks) {
          const fails = (this.failCounts.get(t.id) ?? 0) + 1
          this.failCounts.set(t.id, fails)
          // 节点已熔断时，给章节更宽容的重试预算（否则容易被单章 MAX_RETRIES 提前判死）
          const limit = this.breaker.isDisabled(node.id) ? MAX_RETRIES + 2 : MAX_RETRIES
          if (this.autoRetry) {
            // 自动重试模式：失败章节放回任务池，由其他空闲节点接管（无次数上限）。
            // chapterAvoidNodes 已累加当前节点，下次 dequeueBatch 优先避开它。
            // 兜底：若无可用的节点（全节点熔断或全被该章避开）→ 判终态失败。
            const allAvailNodes = this.breaker.availableNodes(this.nodeConfigs)
            const avoids = this.chapterAvoidNodes.get(t.id)
            const noNodeLeft = allAvailNodes.length === 0 || (avoids != null && allAvailNodes.every((n) => avoids.has(n.id)))
            if (noNodeLeft) {
              this.nodeOverrides.delete(t.id)
              this.cb.onError(t.id, allAvailNodes.length === 0 ? '无可重试节点（所有节点均已熔断）' : `无可重试节点（已避开所有 ${allAvailNodes.length} 个可用节点）：${errMsg}`)
            } else {
              this.retryQueue.push(t)
            }
          } else if (fails < limit) {
            this.retryQueue.push(t)
          } else {
            this.nodeOverrides.delete(t.id)
            this.cb.onError(t.id, `重试 ${fails} 次后仍失败：${errMsg}`)
          }
        }
        if (batchId) this.activeBatches.delete(batchId)
      }
    }
  }

  // per-node-per-slot worker：每个 worker 绑定一个节点，同节点 slot 共享 lastRequestTime（间隔锁）。
  private async workerLoopForNode(assignedNode: CleanNode, slot: number): Promise<void> {
    const workerId = `${assignedNode.id}#${slot + 1}`
    while (!this.stopped) {
      if (this.paused) {
        await sleep(200)
        continue
      }
      // 读最新节点配置（热更新入口：batchSize / intervalSec 即时生效；节点删除/熔断则退出）
      const node = this.nodeConfigs.find((n) => n.id === assignedNode.id)
      if (!node || this.breaker.isDisabled(node.id)) break
      if (slot >= node.maxConcurrency) break
      const state = this.nodeStates.get(node.id)
      if (!state) break

      // 节点级间隔（同节点所有 slot 共享 lastRequestTime）
      const now = Date.now()
      const intervalMs = node.intervalSec * 1000
      if (intervalMs > 0 && now - state.lastRequestTime < intervalMs) {
        await sleep(50)
        continue
      }

      // 次数限制
      if (this.isNodeAvailable && !this.isNodeAvailable(node.id)) {
        await sleep(100)
        continue
      }

      // 取首章（重试优先，由 dequeueBatch 内部从 retryQueue 优先取）
      const first = dequeueBatch(this.retryQueue, this.pendingQueue, 1)[0]  // 先取1字符试探（实际会取首章无论字数）
      if (!first) {
        if (this.active === 0 && this.retryQueue.length === 0 && this.pendingQueue.length === 0) break
        await sleep(100)
        continue
      }

      // 节点覆盖（手动切换模型）：只由指定节点处理
      const overrideNode = this.nodeOverrides.get(first.id)
      if (overrideNode && overrideNode !== node.id) {
        this.retryQueue.unshift(first)
        await sleep(50)
        continue
      }

      // 补满 batch（按字数累积，batchChars 现为字数上限）
      const batch = [first, ...dequeueBatch(this.retryQueue, this.pendingQueue, node.batchChars - first.content.length)]

      // 执行并 await——每 worker 同时只跑一个 batch（maxConcurrency 由 worker 数保证）
      state.activeCount++
      state.lastRequestTime = now
      this.active++
      try {
        await this.executeBatch(batch, node, workerId)
      } finally {
        state.activeCount = Math.max(0, state.activeCount - 1)
        this.active--
      }
    }
    // worker 退出
    this.activeWorkers--
    if (this.activeWorkers === 0) {
      // 全部 worker 退出，若队列非空→全熔断，判错剩余章
      const remaining = [...this.retryQueue.splice(0), ...this.pendingQueue.splice(0)]
      for (const t of remaining) {
        this.cb.onError(t.id, '所有节点均已熔断，无法处理')
      }
      if (!this.finished) {
        this.finished = true
        this.cb.onFinish()
      }
    }
  }

  private stopAll(): void {
    this.stopped = true
    this.pendingQueue.length = 0
    this.retryQueue.length = 0
    for (const [, batch] of this.activeBatches) batch.ac.abort()
    this.activeBatches.clear()
    this.nodeOverrides.clear()
  }

  private hotUpdateNodes(newNodes: CleanNode[]): void {
    const oldIds = new Set(this.nodeConfigs.map((n) => n.id))
    for (const n of newNodes) {
      if (!this.nodeStates.has(n.id)) {
        this.nodeStates.set(n.id, { activeCount: 0, lastRequestTime: 0 })
      }
      // 用户把曾被自动熔断的节点重新纳入（开启参与）→ 视为手动恢复：清熔断与计数
      if (this.breaker.isDisabled(n.id)) {
        this.breaker.reset(n.id)
      }
      oldIds.delete(n.id)
    }
    for (const id of oldIds) {
      const s = this.nodeStates.get(id)
      if (s && s.activeCount === 0) this.nodeStates.delete(id)
    }
    this.nodeConfigs = newNodes
    // maxConcurrency 增大 → 为新增 slot 动态 spawn worker（减小由worker循环自行break）
    for (const n of newNodes) {
      const spawned = this.spawnedSlots.get(n.id) ?? 0
      if (n.maxConcurrency > spawned) {
        for (let slot = spawned; slot < n.maxConcurrency; slot++) {
          this.activeWorkers++
          const wPromise = this.workerLoopForNode(n, slot)
          this.workerPromises.push(wPromise)
          // 兜底：新 worker 最终退出时也要检查 maybeFinish
          void wPromise.then(() => this.maybeFinish())
        }
      }
      this.spawnedSlots.set(n.id, n.maxConcurrency)
    }
  }

  private switchBatchNode(batchId: string, newNodeId: string): void {
    const batch = this.activeBatches.get(batchId)
    if (!batch) return
    // abort 当前请求
    batch.ac.abort()
    // 所有章节标记为用新节点
    for (const cid of batch.chapterIds) {
      this.nodeOverrides.set(cid, newNodeId)
    }
    // 重新入队
    for (const cid of batch.chapterIds) {
      const ch = this.chapters.find((c) => c.id === cid)
      if (ch) {
        this.failCounts.delete(cid) // 手动切换模型 = 新一轮，失败计数归零
        this.retryQueue.unshift({ id: cid, content: ch.content })
      }
    }
    this.activeBatches.delete(batchId)
  }
}

/** 对外入口：构造调度器并启动，返回控制句柄（保持原 startCleanQueue 签名不变） */
export function startCleanQueue(
  chapters: { id: string; content: string }[],
  nodes: CleanNode[],
  cb: CleanQueueCallbacks,
  opts: CleanQueueOpts = {},
): CleanQueueHandle {
  return new CleanScheduler(chapters, nodes, cb, opts).start()
}
