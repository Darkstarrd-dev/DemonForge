// 真实 LLM 服务层 —— 经自家后端网关（/api/llm/*）调用，替代 mock/impl 中的 M1 清理与 Provider 测试。

export interface TestResult {
  ok: boolean
  models: string[]
  error?: string
}

/** 连通性测试：经后端转发 GET {baseURL}/v1/models */
export async function testProvider(node: {
  baseURL: string
  apiKey?: string
  model?: string
}): Promise<TestResult> {
  try {
    const res = await fetch('/api/llm/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model }),
    })
    if (!res.ok) return { ok: false, models: [], error: `网关错误 HTTP ${res.status}` }
    return (await res.json()) as TestResult
  } catch (e) {
    return { ok: false, models: [], error: e instanceof Error ? e.message : '网关不可达（后端未启动？）' }
  }
}

/** 取后端内置默认清理提示词 */
export async function getDefaultPrompt(): Promise<string> {
  try {
    const res = await fetch('/api/llm/prompt')
    if (!res.ok) return ''
    const data = (await res.json()) as { prompt?: string }
    return data.prompt ?? ''
  } catch {
    return ''
  }
}

// ── 类型定义 ──

/** 多章合并分隔符，服务端 prompt.ts 中同名常量保持一致 */
export const CHAPTER_SEP = '<<<|||CHAPTER_SEP|||>>>'

export interface CleanNode {
  id: string
  name: string
  baseURL: string
  apiKey?: string
  model: string
  maxConcurrency: number
  batchSize: number
  intervalSec: number
}

export interface CleanQueueDebugEvent {
  type: 'request' | 'response' | 'error'
  chapterId: string
  chapterTitle?: string
  timestamp: number
  nodeName?: string
  nodeId?: string
  model?: string
  /** 本次请求实际打包的章节数（1=单章路径，>1=批量路径）。用于排查"章节数 vs 请求数" */
  batchSize?: number
  contentLength?: number
  requestBody?: Record<string, unknown>
  statusCode?: number
  responseBody?: string
  chunksCount?: number
  error?: string
  outputLength?: number
  firstBytesAt?: number
}

export interface CleanQueueCallbacks {
  onStart: (chapterId: string, nodeName: string, batchId?: string, nodeId?: string, workerId?: string, batchSeq?: number) => void
  onChunk: (chapterId: string, acc: string) => void
  onDone: (chapterId: string, cleaned: string) => void
  onError: (chapterId: string, message: string) => void
  onFinish: () => void
  onDebug?: (event: CleanQueueDebugEvent) => void
  /** 节点连续失败达阈值被自动熔断（不再分配新任务）。UI 据此把节点开关切到关闭。 */
  onNodeDisabled?: (nodeId: string, nodeName: string, reason: string) => void
}

export interface CleanQueueHandle {
  pause: () => void
  resume: () => void
  stop: () => void
  updateNodes: (nodes: CleanNode[]) => void
  switchBatchNode: (batchId: string, newNodeId: string) => void
}

// ── 节点运行时状态 ──

interface NodeRuntime {
  activeCount: number
  lastRequestTime: number
}

interface ChapterTask {
  id: string
  content: string
}

// ── 单章 SSE 流式请求（batchSize=1 时用） ──

async function streamSingleChapter(
  node: CleanNode,
  content: string,
  chapterId: string,
  cb: CleanQueueCallbacks,
  signal: AbortSignal,
  systemPrompt?: string,
): Promise<void> {
  let chunksCount = 0
  let firstBytesAt: number | undefined
  const reqBody = {
    baseURL: node.baseURL,
    model: node.model,
    apiKey: node.apiKey ? `${node.apiKey.slice(0, 6)}***` : '(空)',
    batchSize: 1,
    systemPromptLen: systemPrompt ? systemPrompt.length : 0,
  }
  cb.onDebug?.({ type: 'request', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, model: node.model, batchSize: 1, contentLength: content.length, requestBody: reqBody })

  let res: Response
  try {
    res = await fetch('/api/llm/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, content, systemPrompt }),
      signal,
    })
  } catch (e) {
    cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, error: `fetch 失败：${e instanceof Error ? e.message : String(e)}` })
    throw e
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: res.status, responseBody: text.slice(0, 2000), error: `HTTP ${res.status}` })
    throw new Error(`网关错误 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  if (!res.body) {
    cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: res.status, error: '响应无 body' })
    throw new Error('响应无 body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let acc = ''
  let rawChunks = ''
  let sseReported = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      const text = value ? decoder.decode(value, { stream: !done }) : ''
      buffer += text
      rawChunks += text
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const evt of events) {
        if (!evt.trim()) continue
        let event = 'message'
        let data = ''
        for (const line of evt.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trim()
        }
        if (!data) continue
        const parsed = JSON.parse(data) as { delta?: string; text?: string; message?: string }
        if (event === 'delta') {
          if (firstBytesAt === undefined) firstBytesAt = Date.now()
          chunksCount += 1
          acc += parsed.delta ?? ''
          cb.onChunk(chapterId, acc)
        } else if (event === 'done') {
          const outText = parsed.text ?? acc
          // 成功响应不再记录流式正文（responseBody），仅保留诊断字段
          cb.onDebug?.({ type: 'response', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, model: node.model, statusCode: 200, chunksCount, outputLength: outText.length, firstBytesAt })
          cb.onDone(chapterId, outText)
          return
        } else if (event === 'error') {
          const msg = parsed.message ?? '清理失败'
          cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: 200, chunksCount, firstBytesAt, responseBody: msg, error: msg })
          sseReported = true
          throw new Error(msg)
        }
      }
      if (done) break
    }
  } catch (e) {
    if (!sseReported && !signal.aborted) {
      const errMsg = e instanceof Error ? e.message : String(e)
      cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, chunksCount, error: errMsg, responseBody: rawChunks.slice(0, 2000) })
    }
    throw e
  }
  const endMsg = '流式响应意外结束'
  cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, chunksCount, error: endMsg, responseBody: rawChunks.slice(0, 2000) })
  throw new Error(endMsg)
}

// ── 多章合并请求（batchSize > 1） ──

function buildBatchContent(batch: { id: string; content: string }[]): string {
  const instr = `[The following text contains ${batch.length} chapters to clean. Each chapter is marked with a "===CHAPTER_ID:X===" header. You MUST return exactly ${batch.length} cleaned chapters, preserving each chapter's header line exactly, with chapters separated by "${CHAPTER_SEP}". Do NOT merge or omit any chapter.]\n\n`
  return instr + batch.map((c) => `===CHAPTER_ID:${c.id}===\n${c.content}`).join(`\n\n${CHAPTER_SEP}\n\n`)
}

async function streamBatch(
  node: CleanNode,
  batch: { id: string; content: string }[],
  cb: CleanQueueCallbacks,
  signal: AbortSignal,
  systemPrompt?: string,
): Promise<void> {
  const combinedContent = buildBatchContent(batch)
  const firstChapterId = batch[0]?.id ?? 'batch'

  let chunksCount = 0
  let firstBytesAt: number | undefined
  const reqBody = {
    baseURL: node.baseURL,
    model: node.model,
    apiKey: node.apiKey ? `${node.apiKey.slice(0, 6)}***` : '(空)',
    batchSize: batch.length,
    systemPromptLen: systemPrompt ? systemPrompt.length : 0,
  }
  cb.onDebug?.({ type: 'request', chapterId: firstChapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, model: node.model, batchSize: batch.length, contentLength: combinedContent.length, requestBody: reqBody })

  let res: Response
  try {
    res = await fetch('/api/llm/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, content: combinedContent, systemPrompt }),
      signal,
    })
  } catch (e) {
    batch.forEach((c) => cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, error: `fetch 失败：${e instanceof Error ? e.message : String(e)}` }))
    throw e
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    batch.forEach((c) => cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: res.status, responseBody: text.slice(0, 2000), error: `HTTP ${res.status}` }))
    throw new Error(`网关错误 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  if (!res.body) {
    batch.forEach((c) => cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: res.status, error: '响应无 body' }))
    throw new Error('响应无 body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let acc = ''
  let rawChunks = ''
  const completedIds = new Set<string>()

  /** 尝试按 SEP 拆分流式已完成的部分，未完成的部分只传当前章文本 */
  const tryFlushCompleted = () => {
    const parts = acc.split(CHAPTER_SEP)
    // 已完成部分（除最后一截）→ onDone
    if (parts.length > 1) {
      for (const part of parts.slice(0, -1)) {
        const idMatch = part.match(/===CHAPTER_ID:([^=]+)===/)
        const chapterId = idMatch ? idMatch[1].trim() : null
        const cleanText = part.replace(/===CHAPTER_ID:[^=]+===/g, '').trim()
        if (cleanText.length >= 10 && chapterId && !completedIds.has(chapterId)) {
          completedIds.add(chapterId)
          // 成功响应不再记录流式正文（responseBody），仅保留诊断字段
          cb.onDebug?.({ type: 'response', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, model: node.model, statusCode: 200, chunksCount, outputLength: cleanText.length, firstBytesAt })
          cb.onDone(chapterId, cleanText)
        }
      }
    }
    // 最后一截 = 当前进行中的章 → 只传它的纯文本（不含前几章）
    const lastPart = parts[parts.length - 1]
    const idMatch = lastPart.match(/===CHAPTER_ID:([^=]+)===/)
    const curChapterId = idMatch ? idMatch[1].trim() : batch[0]?.id ?? null
    const curText = lastPart.replace(/===CHAPTER_ID:[^=]+===/g, '').trim()
    if (curChapterId && !completedIds.has(curChapterId)) {
      cb.onChunk(curChapterId, curText)
    }
  }

  /**
   * done / 流意外结束时，按 SEP 做最终拆分；已 onDone 过的章跳过。
   * 返回"过短/未产出"的章节 id——调用方据此抛错，由 executeTask 的 catch 走重试，
   * 避免"过短只记日志、章节永远停在 processing"的静默卡死。
   */
  const finalizeBatch = (fullText: string): string[] => {
    const parts = fullText.split(CHAPTER_SEP)
    const shortIds: string[] = []
    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i]
      if (completedIds.has(entry.id)) continue
      const raw = parts[i] ?? ''
      const cleanText = raw.replace(/===CHAPTER_ID:[^=]+===/g, '').trim()
      if (cleanText.length < 10) {
        shortIds.push(entry.id)
        cb.onDebug?.({ type: 'error', chapterId: entry.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, chunksCount, error: `输出过短（${cleanText.length} 字符）` })
      } else {
        // 成功响应不再记录流式正文（responseBody），仅保留诊断字段
        cb.onDebug?.({ type: 'response', chapterId: entry.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, model: node.model, statusCode: 200, chunksCount, outputLength: cleanText.length, firstBytesAt })
        cb.onDone(entry.id, cleanText)
      }
    }
    return shortIds
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      const text = value ? decoder.decode(value, { stream: !done }) : ''
      buffer += text
      rawChunks += text
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const evt of events) {
        if (!evt.trim()) continue
        let event = 'message'
        let data = ''
        for (const line of evt.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trim()
        }
        if (!data) continue
        const parsed = JSON.parse(data) as { delta?: string; text?: string; message?: string }
        if (event === 'delta') {
          if (firstBytesAt === undefined) firstBytesAt = Date.now()
          chunksCount += 1
          acc += parsed.delta ?? ''
          tryFlushCompleted()
        } else if (event === 'done') {
          const fullText = parsed.text ?? acc
          const shortIds = finalizeBatch(fullText)
          // 批量内部分章节过短/未产出 → 抛错走重试（已 onDone 的成功章不受影响）
          if (shortIds.length) throw new Error(`批量输出不完整：${shortIds.length} 章过短（${shortIds.join(', ')}）`)
          return
        } else if (event === 'error') {
          const msg = parsed.message ?? '清理失败'
          batch.forEach((c) => {
            if (!completedIds.has(c.id)) {
              cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: 200, chunksCount, firstBytesAt, responseBody: msg, error: msg })
            }
          })
          throw new Error(msg)
        }
      }
      if (done) break
    }
    // 流意外结束 → 用累积文本做最终拆分
    const shortIdsAtEnd = finalizeBatch(acc)
    if (shortIdsAtEnd.length) throw new Error(`流意外结束且部分章节过短（${shortIdsAtEnd.join(', ')}）`)
  } catch (e) {
    if (!signal.aborted) {
      batch.forEach((c) => {
        if (!completedIds.has(c.id)) {
          cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, chunksCount, error: e instanceof Error ? e.message : String(e), responseBody: rawChunks.slice(0, 2000) })
        }
      })
    }
    throw e
  }
}

// ── 中央调度器 ──

/**
 * 模型：节点 = CPU，maxConcurrency = 核心数，章节 = 任务
 * 调度器从共享队列取章，分配给有空闲核心的节点。
 * intervalSec 是节点级全局计时——同一节点任意两次请求至少间隔该秒数。
 * 支持运行中 updateNodes() 热更新节点池配置。
 */
export function startCleanQueue(
  chapters: { id: string; content: string }[],
  nodes: CleanNode[],
  cb: CleanQueueCallbacks,
  opts: { systemPrompt?: string; isNodeAvailable?: (nodeId: string) => boolean } = {},
): CleanQueueHandle {
  if (!nodes.length) throw new Error('无可用节点')

  const { systemPrompt, isNodeAvailable } = opts

  let paused = false
  let stopped = false
  let active = 0
  let finished = false

  // 可变状态——被 worker 循环读取/修改
  let nodeConfigs: CleanNode[] = [...nodes]
  const nodeStates = new Map<string, NodeRuntime>()
  for (const n of nodeConfigs) {
    nodeStates.set(n.id, { activeCount: 0, lastRequestTime: 0 })
  }

  const retryQueue: ChapterTask[] = []
  const pendingQueue: ChapterTask[] = chapters.map((c) => ({ id: c.id, content: c.content }))
  const MAX_RETRIES = 3
  // 章节级累计失败次数（batch 失败时同批所有章共享一致的计数，替代原先写在 task 上的 retryCount——
  // 后者在 batch 重建任务时被归零导致 MAX_RETRIES 失效）
  const failCounts = new Map<string, number>()

  // batch 跟踪：batchId → { controller, chapterIds, nodeId }
  const activeBatches = new Map<string, { ac: AbortController; chapterIds: string[]; nodeId: string }>()
  // 模型切换覆盖：chapterId → 强制节点 id（切换后下轮调度仅匹配该节点）
  const nodeOverrides = new Map<string, string>()
  // 节点熔断：连续失败 NODE_FAIL_LIMIT 次的节点加入此集合，pickCandidate 永久跳过
  const disabledNodes = new Set<string>()
  // 节点连续失败计数（成功即归零）；超过阈值触发 onNodeDisabled + 熔断
  const NODE_FAIL_LIMIT = 3
  const nodeConsecFails = new Map<string, number>()
  // 章节级"避开节点"：某章在某节点失败后，重试时优先避开它（除非只剩它），降低同一坏节点反复重试
  const chapterAvoidNodes = new Map<string, Set<string>>()
  // per-worker batch 序号：每 executeBatch 递增，供 UI 区分同一 worker 的多批
  const workerBatchSeq = new Map<string, number>()
  // 已 spawn 的 slot 数：updateNodes 时检测 maxConcurrency 增大并动态 spawn 新 worker
  const spawnedSlots = new Map<string, number>()

  const maybeFinish = () => {
    if (!finished && active === 0 && pendingQueue.length === 0 && retryQueue.length === 0) {
      finished = true
      cb.onFinish()
    }
  }

  /** 从队列取 batchSize 个任务 */
  const dequeueBatch = (batchSize: number): ChapterTask[] => {
    const result: ChapterTask[] = []
    // 优先重试队列
    for (let i = 0; i < batchSize && retryQueue.length > 0; i++) {
      result.push(retryQueue.shift()!)
    }
    // 再从 pending 队列补足
    for (let i = result.length; i < batchSize && pendingQueue.length > 0; i++) {
      result.push(pendingQueue.shift()!)
    }
    return result
  }

  /** 取本章应避开的节点（仅一个最强避让，传给 worker；多个避让时取最近失败的） */
  const markNodeSuccess = (nodeId: string) => {
    nodeConsecFails.set(nodeId, 0)
  }

  /** 记录节点失败：累加连续失败；达 NODE_FAIL_LIMIT 则熔断该节点并通知 UI */
  const markNodeFail = (node: CleanNode, reason: string) => {
    if (disabledNodes.has(node.id)) return // 已熔断不再重复处理
    const fails = (nodeConsecFails.get(node.id) ?? 0) + 1
    nodeConsecFails.set(node.id, fails)
    if (fails >= NODE_FAIL_LIMIT) {
      disabledNodes.add(node.id)
      // 立即中止该节点所有在途 batch → catch 块将章节放入 retryQueue 供其他节点接管
      for (const [, batch] of activeBatches) {
        if (batch.nodeId === node.id) batch.ac.abort()
      }
      cb.onNodeDisabled?.(node.id, node.name, `连续 ${NODE_FAIL_LIMIT} 次失败（${reason}），已自动关闭`)
    }
  }

  /** 让某章在重试时避开指定节点 */
  const avoidNodeForChapter = (chapterId: string, nodeId: string) => {
    let set = chapterAvoidNodes.get(chapterId)
    if (!set) {
      set = new Set()
      chapterAvoidNodes.set(chapterId, set)
    }
    set.add(nodeId)
  }

  const executeBatch = async (batch: ChapterTask[], node: CleanNode, workerId: string) => {
    const ac = new AbortController()
    const batchSeq = (workerBatchSeq.get(workerId) ?? 0) + 1
    workerBatchSeq.set(workerId, batchSeq)
    let batchId: string | undefined
    try {
      if (batch.length === 1) {
        const task = batch[0]
        cb.onStart(task.id, node.name, undefined, node.id, workerId, batchSeq)
        await streamSingleChapter(node, task.content, task.id, cb, ac.signal, systemPrompt)
        nodeOverrides.delete(task.id)
        markNodeSuccess(node.id)
      } else {
        batchId = `batch-${Date.now()}-${batch[0].id}`
        const chapterIds = batch.map((t) => t.id)
        activeBatches.set(batchId, { ac, chapterIds, nodeId: node.id })
        batch.forEach((t) => {
          cb.onStart(t.id, node.name, t === batch[0] ? batchId : undefined, node.id, workerId, batchSeq)
        })
        await streamBatch(node, batch.map((t) => ({ id: t.id, content: t.content })), cb, ac.signal, systemPrompt)
        for (const t of batch) nodeOverrides.delete(t.id)
        activeBatches.delete(batchId)
        markNodeSuccess(node.id)
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      if (!stopped) {
        // 节点级熔断：网关/网络类错误（HTTP 5xx、fetch 失败、SSE error）累计到节点，
        // 达阈值自动关闭该节点，避免对坏节点无限重试。
        const isNodeLevel = /HTTP\s*5\d\d|fetch\s*失败|网关错误|signal is aborted/i.test(errMsg)
        if (isNodeLevel) markNodeFail(node, errMsg)

        // 收集本批所有未完成章
        const failedTasks: ChapterTask[] = batch.map((t) => ({
          id: t.id,
          content: chapters.find((c) => c.id === t.id)?.content ?? t.content,
        }))

        // 让失败章重试时避开当前节点（per-node 模型下必须避让，否则同 worker 反复失败）
        failedTasks.forEach((t) => avoidNodeForChapter(t.id, node.id))

        for (const t of failedTasks) {
          const fails = (failCounts.get(t.id) ?? 0) + 1
          failCounts.set(t.id, fails)
          // 节点已熔断时，给章节更宽容的重试预算（否则容易被单章 MAX_RETRIES 提前判死）
          const limit = disabledNodes.has(node.id) ? MAX_RETRIES + 2 : MAX_RETRIES
          if (fails < limit) {
            retryQueue.push(t)
          } else {
            nodeOverrides.delete(t.id)
            cb.onError(t.id, `重试 ${fails} 次后仍失败：${errMsg}`)
          }
        }
        if (batchId) activeBatches.delete(batchId)
      }
    }
  }

  // per-node-per-slot worker：每个 worker 绑定一个节点，同节点 slot 共享 lastRequestTime（间隔锁）。
  const workerLoopForNode = async (assignedNode: CleanNode, slot: number) => {
    const workerId = `${assignedNode.id}#${slot + 1}`
    while (!stopped) {
      if (paused) {
        await sleep(200)
        continue
      }
      // 读最新节点配置（热更新入口：batchSize / intervalSec 即时生效；节点删除/熔断则退出）
      const node = nodeConfigs.find((n) => n.id === assignedNode.id)
      if (!node || disabledNodes.has(node.id)) break
      if (slot >= node.maxConcurrency) break
      const state = nodeStates.get(node.id)
      if (!state) break

      // 节点级间隔（同节点所有 slot 共享 lastRequestTime）
      const now = Date.now()
      const intervalMs = node.intervalSec * 1000
      if (intervalMs > 0 && now - state.lastRequestTime < intervalMs) {
        await sleep(50)
        continue
      }

      // 次数限制
      if (isNodeAvailable && !isNodeAvailable(node.id)) {
        await sleep(100)
        continue
      }

      // 取首章（重试优先，由 dequeueBatch 内部从 retryQueue 优先取）
      const first = dequeueBatch(1)[0]
      if (!first) {
        if (active === 0 && retryQueue.length === 0 && pendingQueue.length === 0) break
        await sleep(100)
        continue
      }

      // 节点覆盖（手动切换模型）：只由指定节点处理
      const overrideNode = nodeOverrides.get(first.id)
      if (overrideNode && overrideNode !== node.id) {
        retryQueue.unshift(first)
        await sleep(50)
        continue
      }

      // 补满 batch（同步取，保证连续）
      const batch = [first, ...dequeueBatch(node.batchSize - 1)]

      // 执行并 await——每 worker 同时只跑一个 batch（maxConcurrency 由 worker 数保证）
      state.activeCount++
      state.lastRequestTime = now
      active++
      try {
        await executeBatch(batch, node, workerId)
      } finally {
        state.activeCount = Math.max(0, state.activeCount - 1)
        active--
      }
    }
    // worker 退出
    activeWorkers--
    if (activeWorkers === 0) {
      // 全部 worker 退出，若队列非空→全熔断，判错剩余章
      const remaining = [...retryQueue.splice(0), ...pendingQueue.splice(0)]
      for (const t of remaining) {
        cb.onError(t.id, '所有节点均已熔断，无法处理')
      }
      if (!finished) {
        finished = true
        cb.onFinish()
      }
    }
  }

  // round-robin per-slot 创建：slot 0 → N1#1, N2#1, N3#1; slot 1 → N1#2, N2#2, N3#2
  // 顺序保证初始分配连续（N1P1→1-10, N2P1→11-20, N3P1→21-30, N1P2→31-40, ...）
  const maxConc = nodeConfigs.reduce((sum, n) => sum + n.maxConcurrency, 0)
  let activeWorkers = maxConc
  const workerPromises: Promise<void>[] = []
  const maxSlot = Math.max(...nodeConfigs.map((n) => n.maxConcurrency), 0)
  for (let slot = 0; slot < maxSlot; slot++) {
    for (const node of nodeConfigs) {
      if (slot < node.maxConcurrency) {
        workerPromises.push(workerLoopForNode(node, slot))
      }
    }
  }
  // 记录初始每个节点的 worker 数，供 updateNodes 检测增量
  for (const node of nodeConfigs) {
    spawnedSlots.set(node.id, node.maxConcurrency)
  }

  // 后台兜底：所有 worker 结束时触发 onFinish
  Promise.all(workerPromises).then(() => maybeFinish())

  return {
    pause: () => { paused = true },
    resume: () => { paused = false },
    stop: () => {
      stopped = true
      pendingQueue.length = 0
      retryQueue.length = 0
      for (const [, batch] of activeBatches) batch.ac.abort()
      activeBatches.clear()
      nodeOverrides.clear()
    },
    updateNodes: (newNodes: CleanNode[]) => {
      const oldIds = new Set(nodeConfigs.map((n) => n.id))
      for (const n of newNodes) {
        if (!nodeStates.has(n.id)) {
          nodeStates.set(n.id, { activeCount: 0, lastRequestTime: 0 })
        }
        // 用户把曾被自动熔断的节点重新纳入（开启参与）→ 视为手动恢复：清熔断与计数
        if (disabledNodes.has(n.id)) {
          disabledNodes.delete(n.id)
          nodeConsecFails.set(n.id, 0)
        }
        oldIds.delete(n.id)
      }
      for (const id of oldIds) {
        const s = nodeStates.get(id)
        if (s && s.activeCount === 0) nodeStates.delete(id)
      }
      nodeConfigs = newNodes
      // maxConcurrency 增大 → 为新增 slot 动态 spawn worker（减小由worker循环自行break）
      for (const n of newNodes) {
        const spawned = spawnedSlots.get(n.id) ?? 0
        if (n.maxConcurrency > spawned) {
          for (let slot = spawned; slot < n.maxConcurrency; slot++) {
            activeWorkers++
            const wPromise = workerLoopForNode(n, slot)
            workerPromises.push(wPromise)
            // 兜底：新 worker 最终退出时也要检查 maybeFinish
            wPromise.then(() => maybeFinish())
          }
        }
        spawnedSlots.set(n.id, n.maxConcurrency)
      }
    },
    switchBatchNode: (batchId: string, newNodeId: string) => {
      const batch = activeBatches.get(batchId)
      if (!batch) return
      // abort 当前请求
      batch.ac.abort()
      // 所有章节标记为用新节点
      for (const cid of batch.chapterIds) {
        nodeOverrides.set(cid, newNodeId)
      }
      // 重新入队
      for (const cid of batch.chapterIds) {
        const ch = chapters.find((c) => c.id === cid)
        if (ch) {
          failCounts.delete(cid) // 手动切换模型 = 新一轮，失败计数归零
          retryQueue.unshift({ id: cid, content: ch.content })
        }
      }
      activeBatches.delete(batchId)
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
