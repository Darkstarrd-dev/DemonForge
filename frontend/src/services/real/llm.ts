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

export class CleanError extends Error {
  phase: 'connect' | 'stream'
  completedIds: string[]
  constructor(message: string, phase: 'connect' | 'stream', completedIds: string[] = []) {
    super(message)
    this.name = 'CleanError'
    this.phase = phase
    this.completedIds = completedIds
  }
}

export interface CleanNode {
  id: string
  name: string
  baseURL: string
  apiKey?: string
  model: string
  maxConcurrency: number
  batchChars: number  // 批次字数上限（非章节数）
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

// ── 单章 SSE 流式请求（batchSize=1 时用） ──
// 同时被调度器（cleanScheduler 的 CleanScheduler）内部调用，以及全屏阅读模式单章清理直接调用。
// 注：本文件刻意保留手写 SSE 解析（未套用 services/sse.ts::parseSSE）——清理流需累积原始
//   字节（rawChunks）用于失败时 Debug Info 的 responseBody 诊断，且 streamBatch 还要按
//   CHAPTER_SEP 增量拆分多章。这两点是 parseSSE（纯 {event,data}）不覆盖的业务需求，
//   故作为 A-5 的明确例外。

export async function streamSingleChapter(
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
    throw new CleanError(e instanceof Error ? e.message : String(e), 'connect')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: res.status, responseBody: text.slice(0, 2000), error: `HTTP ${res.status}` })
    throw new CleanError(`网关错误 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`, 'connect')
  }
  if (!res.body) {
    cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: res.status, error: '响应无 body' })
    throw new CleanError('响应无 body', 'connect')
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
          throw new CleanError(msg, firstBytesAt !== undefined ? 'stream' : 'connect')
        }
      }
      if (done) break
    }
  } catch (e) {
    if (!sseReported && !signal.aborted) {
      const errMsg = e instanceof Error ? e.message : String(e)
      cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, chunksCount, error: errMsg, responseBody: rawChunks.slice(0, 2000) })
    }
    throw e instanceof CleanError ? e : new CleanError(e instanceof Error ? e.message : String(e), firstBytesAt !== undefined ? 'stream' : 'connect')
  }
  const endMsg = '流式响应意外结束'
  const phase = firstBytesAt !== undefined ? 'stream' : 'connect'
  cb.onDebug?.({ type: 'error', chapterId, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, chunksCount, error: endMsg, responseBody: rawChunks.slice(0, 2000) })
  throw new CleanError(endMsg, phase)
}

// ── 多章合并请求（batchSize > 1） ──

function buildBatchContent(batch: { id: string; content: string }[]): string {
  const instr = `[The following text contains ${batch.length} chapters to clean. Each chapter is marked with a "===CHAPTER_ID:X===" header. You MUST return exactly ${batch.length} cleaned chapters, preserving each chapter's header line exactly, with chapters separated by "${CHAPTER_SEP}". Do NOT merge or omit any chapter.]\n\n`
  return instr + batch.map((c) => `===CHAPTER_ID:${c.id}===\n${c.content}`).join(`\n\n${CHAPTER_SEP}\n\n`)
}

export async function streamBatch(
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
    throw new CleanError(e instanceof Error ? e.message : String(e), 'connect')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    batch.forEach((c) => cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: res.status, responseBody: text.slice(0, 2000), error: `HTTP ${res.status}` }))
    throw new CleanError(`网关错误 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`, 'connect')
  }
  if (!res.body) {
    batch.forEach((c) => cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: res.status, error: '响应无 body' }))
    throw new CleanError('响应无 body', 'connect')
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
          if (shortIds.length) throw new CleanError(`批量输出不完整：${shortIds.length} 章过短（${shortIds.join(', ')}）`, firstBytesAt !== undefined ? 'stream' : 'connect', [...completedIds])
          return
        } else if (event === 'error') {
          const msg = parsed.message ?? '清理失败'
          batch.forEach((c) => {
            if (!completedIds.has(c.id)) {
              cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, statusCode: 200, chunksCount, firstBytesAt, responseBody: msg, error: msg })
            }
          })
          throw new CleanError(msg, firstBytesAt !== undefined ? 'stream' : 'connect', [...completedIds])
        }
      }
      if (done) break
    }
    // 流意外结束 → 用累积文本做最终拆分
    const shortIdsAtEnd = finalizeBatch(acc)
    if (shortIdsAtEnd.length) throw new CleanError(`流意外结束且部分章节过短（${shortIdsAtEnd.join(', ')}）`, firstBytesAt !== undefined ? 'stream' : 'connect', [...completedIds])
  } catch (e) {
    if (!signal.aborted) {
      batch.forEach((c) => {
        if (!completedIds.has(c.id)) {
          cb.onDebug?.({ type: 'error', chapterId: c.id, timestamp: Date.now(), nodeName: node.name, nodeId: node.id, chunksCount, error: e instanceof Error ? e.message : String(e), responseBody: rawChunks.slice(0, 2000) })
        }
      })
    }
    throw e instanceof CleanError ? e : new CleanError(e instanceof Error ? e.message : String(e), firstBytesAt !== undefined ? 'stream' : 'connect', [...completedIds])
  }
}
