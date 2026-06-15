// 真实 LLM 服务层 —— 经自家后端网关（/api/llm/*）调用，替代 mock/impl 中的 M1 清理与 Provider 测试。
// 页面仍只从 services/api.ts 引用；CleanQueueCallbacks/CleanQueueHandle 契约与 mock 版保持一致，
// 仅新增 onError（真实调用会失败）并把节点入参从「名称」升级为「完整配置」。

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

/** 取后端内置默认清理提示词（供设置页「载入默认」/ Step3 占位提示） */
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

// ── M1 清理队列（真实流式，经 /api/llm/clean 的 SSE） ──

export interface CleanNode {
  name: string
  baseURL: string
  apiKey?: string
  model: string
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
  /** 最终输出字符数（done 时回填） */
  outputLength?: number
  /** 首个 delta 到达的时间戳（便于看首字节延迟） */
  firstBytesAt?: number
}

export interface CleanQueueCallbacks {
  onStart: (chapterId: string, nodeName: string) => void
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
}

/** 读取一章的 SSE 流：delta 累积回调，done 回填完整文本，error 抛出 */
async function streamClean(
  node: CleanNode,
  content: string,
  chapterId: string,
  cb: CleanQueueCallbacks,
  signal: AbortSignal,
  systemPrompt?: string,
): Promise<void> {
  let chunksCount = 0
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
  let firstBytesAt: number | undefined
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

/**
 * 真实清理队列：保留 mock 版的 N worker 并发 + 暂停/继续/停止骨架。
 * 调用方需保证 nodes 非空（无可用节点时不应启动）。
 * opts.batchSize 预留（后续实现多章合并请求），当前每 worker 每次仅取 1 章。
 */
export function startCleanQueue(
  chapters: { id: string; content: string }[],
  nodes: CleanNode[],
  cb: CleanQueueCallbacks,
  opts: { concurrency?: number; batchSize?: number; intervalSec?: number; systemPrompt?: string } = {},
): CleanQueueHandle {
  const { concurrency = 3, intervalSec = 0, systemPrompt } = opts
  const queue = [...chapters]
  let paused = false
  let stopped = false
  let active = 0
  let finished = false
  const controllers = new Set<AbortController>()

  const maybeFinish = () => {
    if (!finished && active === 0 && (queue.length === 0 || stopped)) {
      finished = true
      cb.onFinish()
    }
  }

  const worker = async (idx: number) => {
    while (!stopped) {
      if (paused) {
        await new Promise((r) => setTimeout(r, 200))
        continue
      }
      const task = queue.shift()
      if (!task) break
      // 请求间隔（错峰锁）
      if (intervalSec > 0) await new Promise((r) => setTimeout(r, intervalSec * 1000))
      active += 1
      const node = nodes[idx % nodes.length]
      cb.onStart(task.id, node.name)
      const ac = new AbortController()
      controllers.add(ac)
      try {
        await streamClean(node, task.content, task.id, cb, ac.signal, systemPrompt)
      } catch (e) {
        if (!stopped) cb.onError(task.id, e instanceof Error ? e.message : String(e))
      } finally {
        controllers.delete(ac)
        active -= 1
      }
    }
    maybeFinish()
  }

  for (let i = 0; i < concurrency; i++) void worker(i)

  return {
    pause: () => {
      paused = true
    },
    resume: () => {
      paused = false
    },
    stop: () => {
      stopped = true
      queue.length = 0
      controllers.forEach((c) => c.abort())
    },
  }
}
