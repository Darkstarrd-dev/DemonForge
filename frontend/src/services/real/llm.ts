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
  model?: string
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
  onStart: (chapterId: string, nodeName: string, batchId?: string) => void
  onChunk: (chapterId: string, acc: string) => void
  onDone: (chapterId: string, cleaned: string) => void
  onError: (chapterId: string, message: string) => void
  onFinish: () => void
  onDebug?: (event: CleanQueueDebugEvent) => void
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
    systemPromptLen: systemPrompt ? systemPrompt.length : 0,
  }
  cb.onDebug?.({ type: 'request', chapterId, timestamp: Date.now(), nodeName: node.name, model: node.model, contentLength: content.length, requestBody: reqBody })

  let res: Response
  try {
    res = await fetch('/api/llm/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, content, systemPrompt }),
      signal,
    })
  } catch (e) {
    cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), error: `fetch 失败：${e instanceof Error ? e.message : String(e)}` })
    throw e
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), statusCode: res.status, responseBody: text.slice(0, 2000), error: `HTTP ${res.status}` })
    throw new Error(`网关错误 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  if (!res.body) {
    cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), statusCode: res.status, error: '响应无 body' })
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
          cb.onDebug?.({ type: 'response', chapterId, timestamp: Date.now(), statusCode: 200, chunksCount, outputLength: outText.length, firstBytesAt, responseBody: outText.slice(0, 500) })
          cb.onDone(chapterId, outText)
          return
        } else if (event === 'error') {
          const msg = parsed.message ?? '清理失败'
          cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), statusCode: 200, chunksCount, firstBytesAt, responseBody: msg, error: msg })
          sseReported = true
          throw new Error(msg)
        }
      }
      if (done) break
    }
  } catch (e) {
    if (!sseReported && !signal.aborted) {
      const errMsg = e instanceof Error ? e.message : String(e)
      cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), chunksCount, error: errMsg, responseBody: rawChunks.slice(0, 2000) })
    }
    throw e
  }
  const endMsg = '流式响应意外结束'
  cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), chunksCount, error: endMsg, responseBody: rawChunks.slice(0, 2000) })
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
  cb.onDebug?.({ type: 'request', chapterId: firstChapterId, timestamp: Date.now(), nodeName: node.name, model: node.model, contentLength: combinedContent.length, requestBody: reqBody })

  let res: Response
  try {
    res = await fetch('/api/llm/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, content: combinedContent, systemPrompt }),
      signal,
    })
  } catch (e) {
    batch.forEach((c) => cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), error: `fetch 失败：${e instanceof Error ? e.message : String(e)}` }))
    throw e
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    batch.forEach((c) => cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), statusCode: res.status, responseBody: text.slice(0, 2000), error: `HTTP ${res.status}` }))
    throw new Error(`网关错误 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  if (!res.body) {
    batch.forEach((c) => cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), statusCode: res.status, error: '响应无 body' }))
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
          cb.onDebug?.({ type: 'response', chapterId, timestamp: Date.now(), statusCode: 200, chunksCount, outputLength: cleanText.length, firstBytesAt, responseBody: cleanText.slice(0, 500) })
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

  /** done / 流意外结束时，按 SEP 做最终拆分；已 onDone 过的章跳过，过短判失败 */
  const finalizeBatch = (fullText: string) => {
    const parts = fullText.split(CHAPTER_SEP)
    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i]
      if (completedIds.has(entry.id)) continue
      const raw = parts[i] ?? ''
      const cleanText = raw.replace(/===CHAPTER_ID:[^=]+===/g, '').trim()
      if (cleanText.length < 10) {
        cb.onDebug?.({ type: 'error', chapterId: entry.id, timestamp: Date.now(), chunksCount, error: `输出过短（${cleanText.length} 字符）`, responseBody: cleanText })
      } else {
        cb.onDebug?.({ type: 'response', chapterId: entry.id, timestamp: Date.now(), statusCode: 200, chunksCount, outputLength: cleanText.length, firstBytesAt, responseBody: cleanText.slice(0, 500) })
        cb.onDone(entry.id, cleanText)
      }
    }
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
          finalizeBatch(fullText)
          return
        } else if (event === 'error') {
          const msg = parsed.message ?? '清理失败'
          batch.forEach((c) => {
            if (!completedIds.has(c.id)) {
              cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), statusCode: 200, chunksCount, firstBytesAt, responseBody: msg, error: msg })
            }
          })
          throw new Error(msg)
        }
      }
      if (done) break
    }
    // 流意外结束 → 用累积文本做最终拆分
    finalizeBatch(acc)
  } catch (e) {
    if (!signal.aborted) {
      batch.forEach((c) => {
        if (!completedIds.has(c.id)) {
          cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), chunksCount, error: e instanceof Error ? e.message : String(e), responseBody: rawChunks.slice(0, 2000) })
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
  opts: { systemPrompt?: string } = {},
): CleanQueueHandle {
  if (!nodes.length) throw new Error('无可用节点')

  const { systemPrompt } = opts

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

  /** 选择候选节点——有空闲核心且间隔已过 */
  const pickCandidate = (): { cfg: CleanNode; state: NodeRuntime } | null => {
    const now = Date.now()
    const candidates: { cfg: CleanNode; state: NodeRuntime }[] = []
    for (const cfg of nodeConfigs) {
      const state = nodeStates.get(cfg.id)
      if (!state) continue
      if (state.activeCount >= cfg.maxConcurrency) continue
      const intervalMs = cfg.intervalSec * 1000
      if (intervalMs > 0 && now - state.lastRequestTime < intervalMs) continue
      candidates.push({ cfg, state })
    }
    if (!candidates.length) return null
    // 排序：最久未用 → 最少连接 → 原序号
    candidates.sort((a, b) => {
      const timeDiff = a.state.lastRequestTime - b.state.lastRequestTime
      if (timeDiff !== 0) return timeDiff
      const countDiff = a.state.activeCount - b.state.activeCount
      if (countDiff !== 0) return countDiff
      return nodeConfigs.indexOf(a.cfg) - nodeConfigs.indexOf(b.cfg)
    })
    return candidates[0]
  }

  const executeTask = async (task: ChapterTask, node: CleanNode, nodeState: NodeRuntime) => {
    active++
    nodeState.activeCount++
    nodeState.lastRequestTime = Date.now()
    const ac = new AbortController()
    let batchId: string | undefined
    try {
      if (node.batchSize <= 1) {
        cb.onStart(task.id, node.name)
        await streamSingleChapter(node, task.content, task.id, cb, ac.signal, systemPrompt)
        nodeOverrides.delete(task.id)
      } else {
        // batch 模式：生成 batchId，取出 batchSize 章
        batchId = `batch-${Date.now()}-${task.id}`
        const batchTasks = [task, ...dequeueBatch(node.batchSize - 1)]
        const chapterIds = batchTasks.map((t) => t.id)
        activeBatches.set(batchId, { ac, chapterIds, nodeId: node.id })
        batchTasks.forEach((t) => {
          cb.onStart(t.id, node.name, t === task ? batchId : undefined)
        })
        await streamBatch(node, batchTasks.map((t) => ({ id: t.id, content: t.content })), cb, ac.signal, systemPrompt)
        // 清除覆盖
        for (const t of batchTasks) nodeOverrides.delete(t.id)
        activeBatches.delete(batchId)
      }
    } catch (e) {
      if (!stopped) {
        const enqueueRetry = (t: ChapterTask) => {
          const fails = (failCounts.get(t.id) ?? 0) + 1
          failCounts.set(t.id, fails)
          if (fails < MAX_RETRIES) {
            retryQueue.push(t)
          } else {
            nodeOverrides.delete(t.id)
            cb.onError(t.id, `重试 ${MAX_RETRIES} 次后仍失败：${e instanceof Error ? e.message : String(e)}`)
          }
        }
        enqueueRetry(task)
        // batch 中其他章（非 anchor）也重试——复用同一 task 对象（无 retryCount 字段，计数走 failCounts）
        if (batchId) {
          const batchInfo = activeBatches.get(batchId)
          if (batchInfo) {
            for (const cid of batchInfo.chapterIds) {
              if (cid !== task.id) {
                enqueueRetry({ id: cid, content: chapters.find((c) => c.id === cid)?.content ?? '' })
              }
            }
          }
          activeBatches.delete(batchId)
        }
      }
    } finally {
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
      // 读最新节点配置（热更新入口）
      const candidate = pickCandidate()
      if (!candidate) {
        if (retryQueue.length === 0 && pendingQueue.length === 0) {
          if (active === 0) break
          await sleep(100)
          continue
        }
        // 有任务但无可用节点（都在忙或在冷却）→ 等一会
        await sleep(100)
        continue
      }
      const { cfg, state } = candidate
      const task = dequeueBatch(1)[0]
      if (!task) {
        if (active === 0) break
        await sleep(100)
        continue
      }
      // 检查节点覆盖：切换模型后章节只由指定节点处理
      const overrideNode = nodeOverrides.get(task.id)
      if (overrideNode && overrideNode !== cfg.id) {
        retryQueue.unshift(task)
        await sleep(50)
        continue
      }
      // fire-and-forget：不 await，立即回循环抢下一个节点
      executeTask(task, cfg, state)
    }
    maybeFinish()
  }

  // 总 worker 数 = 所有节点最大并发之和
  const totalWorkers = nodeConfigs.reduce((sum, n) => sum + n.maxConcurrency, 0)
  const workerPromises: Promise<void>[] = []
  for (let i = 0; i < Math.max(totalWorkers, 1); i++) {
    workerPromises.push(workerLoop())
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
        oldIds.delete(n.id)
      }
      for (const id of oldIds) {
        const s = nodeStates.get(id)
        if (s && s.activeCount === 0) nodeStates.delete(id)
      }
      nodeConfigs = newNodes
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
