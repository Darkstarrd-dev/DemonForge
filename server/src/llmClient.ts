// Provider 抽象层（P0 起点）—— OpenAI 兼容客户端。
// 后端无状态：每次调用由前端传入 {baseURL, apiKey, model}，这里只做协议适配与转发。

export interface ProviderConfig {
  baseURL: string
  apiKey?: string
  model?: string
}

/** 规范化 baseURL：提取 origin，统一拼 /v1 */
function normalizeBase(baseURL: string): string {
  const raw = baseURL.trim()
  const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`http://${raw}`)
  return `${url.origin}/v1`
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

export interface ListModelsResult {
  ok: boolean
  models: string[]
  error?: string
}

/** GET /v1/models —— 连通性测试 + 列出可用模型 */
export async function listModels(cfg: ProviderConfig): Promise<ListModelsResult> {
  const url = `${normalizeBase(cfg.baseURL)}/models`
  try {
    const res = await fetch(url, { headers: { ...authHeaders(cfg.apiKey) } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, models: [], error: `HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}` }
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> }
    const models = Array.isArray(data.data)
      ? data.data.map((m) => m.id).filter((x): x is string => !!x)
      : []
    return { ok: true, models }
  } catch (e) {
    return { ok: false, models: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>
}

export interface ChatStreamOptions extends ProviderConfig {
  messages: ChatMessage[]
  signal?: AbortSignal
  temperature?: number
  top_p?: number
  max_tokens?: number
}

/** 构造发给上游 /v1/chat/completions 的请求 body（不含 baseURL/apiKey，用于 debug 回传） */
export function buildRequestBody(opts: ChatStreamOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { model: opts.model, messages: opts.messages, stream: true }
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature
  if (typeof opts.top_p === 'number') body.top_p = opts.top_p
  if (typeof opts.max_tokens === 'number') body.max_tokens = opts.max_tokens
  return body
}

/** POST /v1/chat/completions (stream:true) —— 逐增量回调，返回完整文本；失败抛错由调用方处理。
 * onRaw（可选）：透传每个上游 SSE chunk 的原始 payload，供节点测试 Debug Info 使用。
 * onReasoningDelta（可选）：透传 reasoning 字段的增量（思考过程流式返回）。 */
export async function chatStream(
  opts: ChatStreamOptions,
  onDelta: (delta: string) => void,
  onRaw?: (raw: { line: string; json: unknown | null }) => void,
  onReasoningDelta?: (delta: string) => void,
): Promise<string> {
  const url = `${normalizeBase(opts.baseURL)}/chat/completions`
  const body = buildRequestBody(opts)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(opts.apiKey) },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t || !t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (payload === '[DONE]') {
        onRaw?.({ line: '[DONE]', json: null })
        continue
      }
      try {
        const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string; reasoning?: string } }> }
        onRaw?.({ line: payload, json })
        const delta = json.choices?.[0]?.delta?.content ?? ''
        const reasoningDelta = json.choices?.[0]?.delta?.reasoning ?? ''
        if (reasoningDelta && onReasoningDelta) {
          onReasoningDelta(reasoningDelta)
        }
        if (delta) {
          full += delta
          onDelta(delta)
        }
      } catch {
        // 忽略不完整 / 非 JSON 的 keep-alive 行
      }
    }
  }
  return full
}

/** POST /v1/embeddings —— 批量文本向量化，返回每条文本的向量；失败抛错由调用方处理 */
export async function embed(cfg: ProviderConfig, input: string[]): Promise<number[][]> {
  const url = `${normalizeBase(cfg.baseURL)}/embeddings`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.apiKey) },
    body: JSON.stringify({ model: cfg.model, input }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`)
  }
  const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> }
  const vectors = Array.isArray(data.data) ? data.data.map((d) => d.embedding ?? []) : []
  if (!vectors.length || vectors.some((v) => v.length === 0)) {
    throw new Error('embedding 响应为空或维度异常')
  }
  return vectors
}
