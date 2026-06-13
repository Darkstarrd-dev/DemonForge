// Provider 抽象层（P0 起点）—— OpenAI 兼容客户端。
// 后端无状态：每次调用由前端传入 {baseURL, apiKey, model}，这里只做协议适配与转发。

export interface ProviderConfig {
  baseURL: string
  apiKey?: string
  model?: string
}

/** 规范化 baseURL：去尾部斜杠；若未以 /vN 结尾则补 /v1（兼容用户填 http://x 或 http://x/v1） */
function normalizeBase(baseURL: string): string {
  let b = baseURL.trim().replace(/\/+$/, '')
  if (!/\/v\d+$/.test(b)) b += '/v1'
  return b
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
  content: string
}

export interface ChatStreamOptions extends ProviderConfig {
  messages: ChatMessage[]
  signal?: AbortSignal
}

/** POST /v1/chat/completions (stream:true) —— 逐增量回调，返回完整文本；失败抛错由调用方处理 */
export async function chatStream(
  opts: ChatStreamOptions,
  onDelta: (delta: string) => void,
): Promise<string> {
  const url = `${normalizeBase(opts.baseURL)}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(opts.apiKey) },
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true }),
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
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = json.choices?.[0]?.delta?.content ?? ''
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
