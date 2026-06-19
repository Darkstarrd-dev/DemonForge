// 批量章节生成调度器（阶段 D）——复用 M1 startCleanQueue 架构，改造为 draft→finalize 串行子流程。
// 核心差异：任务单位从"清理章节"变为"生成章节（draft→finalize 串行）"；失败策略从重试变为立即停止。

import type { DraftContext } from './generation'
import { generateDraft, finalizeChapter } from './generation'

/** 批量生成任务 */
export interface BatchGenTask {
  chapterId: string
  outlineNodeId: string
  /** draft 阶段的 Context Assembler 输入 */
  draftContext: DraftContext
  /** finalize 所需的现有全局摘要 */
  existingGlobalSummary?: string
  /** finalize 所需的现有角色状态（JSON 字符串） */
  existingStates?: string
}

/** 批量生成节点配置（复用 M1 CleanNode 结构，语义对齐） */
export interface BatchGenNode {
  id: string
  name: string
  baseURL: string
  apiKey?: string
  model: string
  /** 最大并发章节数 */
  maxConcurrency: number
  /** 请求间隔秒数 */
  intervalSec: number
}

/** 任务状态 */
type TaskStatus = 'drafting' | 'finalizing' | 'completed' | 'failed'

/** 批量生成回调 */
export interface BatchGenCallbacks {
  onStart: (chapterId: string, nodeName: string, status: 'drafting' | 'finalizing') => void
  onDraftChunk: (chapterId: string, acc: string) => void
  onFinalizeChunk: (chapterId: string, acc: string) => void
  onComplete: (chapterId: string, result: {
    draftText: string
    chapterSummary: string
    globalSummaryDelta: string
    stateEvents: Array<{ characterId: string; type: string; description: string; timestamp: string }>
  }) => void
  onError: (chapterId: string, error: string) => void
  /** 所有任务完成或停止 */
  onFinish: () => void
}

/** 批量生成句柄 */
export interface BatchGenHandle {
  pause: () => void
  resume: () => void
  stop: () => void
  updateNodes: (nodes: BatchGenNode[]) => void
}

interface NodeRuntime {
  activeCount: number
  lastRequestTime: number
}

interface InternalTask extends BatchGenTask {
  status: TaskStatus
  draftText?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function startBatchGenerate(
  tasks: BatchGenTask[],
  nodes: BatchGenNode[],
  cb: BatchGenCallbacks,
  opts: { isNodeAvailable?: (nodeId: string) => boolean } = {},
): BatchGenHandle {
  if (!nodes.length) throw new Error('无可用节点')
  if (!tasks.length) throw new Error('无任务')

  const { isNodeAvailable } = opts

  let paused = false
  let stopped = false
  let active = 0
  let finished = false

  // 可变状态
  let nodeConfigs: BatchGenNode[] = [...nodes]
  const nodeStates = new Map<string, NodeRuntime>()
  for (const n of nodeConfigs) {
    nodeStates.set(n.id, { activeCount: 0, lastRequestTime: 0 })
  }

  const pendingQueue: InternalTask[] = tasks.map((t) => ({ ...t, status: 'drafting' as const }))
  const activeControllers = new Map<string, AbortController>()

  const maybeFinish = () => {
    if (!finished && active === 0 && pendingQueue.length === 0) {
      finished = true
      cb.onFinish()
    }
  }

  /** 选择候选节点 */
  const pickCandidate = (): { cfg: BatchGenNode; state: NodeRuntime } | null => {
    const now = Date.now()
    const candidates: { cfg: BatchGenNode; state: NodeRuntime }[] = []
    for (const cfg of nodeConfigs) {
      const state = nodeStates.get(cfg.id)
      if (!state) continue
      if (state.activeCount >= cfg.maxConcurrency) continue
      const intervalMs = cfg.intervalSec * 1000
      if (intervalMs > 0 && now - state.lastRequestTime < intervalMs) continue
      // 次数限制：扣减当日额度，额度用尽的节点跳过
      if (isNodeAvailable && !isNodeAvailable(cfg.id)) continue
      candidates.push({ cfg, state })
    }
    if (!candidates.length) return null
    // 排序：最久未用 → 最少连接
    candidates.sort((a, b) => {
      const timeDiff = a.state.lastRequestTime - b.state.lastRequestTime
      if (timeDiff !== 0) return timeDiff
      return a.state.activeCount - b.state.activeCount
    })
    return candidates[0]
  }

  /** 执行单个任务（draft → finalize 串行） */
  const executeTask = async (task: InternalTask, node: BatchGenNode, nodeState: NodeRuntime) => {
    active++
    nodeState.activeCount++
    nodeState.lastRequestTime = Date.now()

    const ac = new AbortController()
    activeControllers.set(task.chapterId, ac)

    try {
      // Phase 1: Draft（生成章节正文）
      cb.onStart(task.chapterId, node.name, 'drafting')
      const draftText = await generateDraft(
        {
          baseURL: node.baseURL,
          apiKey: node.apiKey,
          model: node.model,
          context: task.draftContext,
        },
        (acc) => cb.onDraftChunk(task.chapterId, acc),
        ac.signal,
      )

      if (stopped) return

      task.draftText = draftText
      task.status = 'finalizing'

      // Phase 2: Finalize（提取摘要 + 状态事件）
      cb.onStart(task.chapterId, node.name, 'finalizing')
      const finalizeResult = await finalizeChapter(
        {
          baseURL: node.baseURL,
          apiKey: node.apiKey,
          model: node.model,
          chapterText: draftText,
          existingGlobalSummary: task.existingGlobalSummary,
          existingStates: task.existingStates,
        },
        (acc) => cb.onFinalizeChunk(task.chapterId, acc),
        ac.signal,
      )

      if (stopped) return

      task.status = 'completed'
      cb.onComplete(task.chapterId, {
        draftText,
        ...finalizeResult,
      })
    } catch (e) {
      if (!stopped) {
        task.status = 'failed'
        const errMsg = e instanceof Error ? e.message : String(e)
        cb.onError(task.chapterId, errMsg)

        // 关键差异：批量生成失败即停止（避免剧情崩坏）
        stopped = true
        pendingQueue.length = 0
        for (const [, controller] of activeControllers) {
          controller.abort()
        }
        activeControllers.clear()
      }
    } finally {
      activeControllers.delete(task.chapterId)
      nodeState.activeCount = Math.max(0, nodeState.activeCount - 1)
      active--
    }
  }

  const workerLoop = async () => {
    while (!stopped) {
      if (paused) {
        await sleep(200)
        continue
      }

      const candidate = pickCandidate()
      if (!candidate) {
        if (pendingQueue.length === 0) {
          if (active === 0) break
          await sleep(100)
          continue
        }
        // 有任务但无可用节点 → 等待
        await sleep(100)
        continue
      }

      const { cfg, state } = candidate
      const task = pendingQueue.shift()
      if (!task) {
        if (active === 0) break
        await sleep(100)
        continue
      }

      // fire-and-forget
      executeTask(task, cfg, state)
    }
    maybeFinish()
  }

  // 启动 worker
  const totalWorkers = nodeConfigs.reduce((sum, n) => sum + n.maxConcurrency, 0)
  const workerPromises: Promise<void>[] = []
  for (let i = 0; i < Math.max(totalWorkers, 1); i++) {
    workerPromises.push(workerLoop())
  }

  Promise.all(workerPromises).then(() => maybeFinish())

  return {
    pause: () => { paused = true },
    resume: () => { paused = false },
    stop: () => {
      stopped = true
      pendingQueue.length = 0
      for (const [, ac] of activeControllers) ac.abort()
      activeControllers.clear()
    },
    updateNodes: (newNodes: BatchGenNode[]) => {
      const oldIds = new Set(nodeConfigs.map((n) => n.id))
      for (const n of newNodes) {
        if (!nodeStates.has(n.id)) {
          nodeStates.set(n.id, { activeCount: 0, lastRequestTime: 0 })
        }
      }
      for (const id of oldIds) {
        if (!newNodes.some((n) => n.id === id)) {
          nodeStates.delete(id)
        }
      }
      nodeConfigs = [...newNodes]
    },
  }
}
