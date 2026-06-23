// 通用对话服务层 —— 支持纯文本推理和多模态理解（OpenAI 兼容格式）

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>
}

export interface ChatParams {
  baseURL: string
  apiKey?: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  topP?: number
  maxTokens?: number
  /** Debug Info：true 时后端回传 actual request body + 透传上游 raw chunks */
  includeRaw?: boolean
}

export interface ChatEvents {
  delta: (delta: string) => void
  done: (fullText: string) => void
  error: (error: string) => void
  /** Debug Info：后端实际发给上游的 request body */
  requestBody?: (body: unknown) => void
  /** Debug Info：上游原始 SSE chunk（json 为 null 表示 [DONE]） */
  rawChunk?: (raw: { line: string; json: unknown | null }) => void
}

/**
 * 通用对话流式调用（SSE）
 * 支持纯文本和多模态（图片+文本）输入
 */
export async function streamChat(
  params: ChatParams,
  events: ChatEvents,
  signal?: AbortSignal,
): Promise<void> {
  const body: any = {
    baseURL: params.baseURL,
    apiKey: params.apiKey,
    model: params.model,
    messages: params.messages,
  }
  if (typeof params.temperature === 'number') body.temperature = params.temperature
  if (typeof params.topP === 'number') body.top_p = params.topP
  if (typeof params.maxTokens === 'number') body.max_tokens = params.maxTokens
  if (params.includeRaw) body.includeRaw = true

  const res = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    events.error(`HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ''}`)
    return
  }

  if (!res.body) {
    events.error('响应体为空')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('event:')) continue

        const eventMatch = trimmed.match(/^event:\s*(\w+)/)
        if (!eventMatch) continue
        const eventType = eventMatch[1]

        const dataLine = lines[lines.indexOf(line) + 1]
        if (!dataLine?.trim().startsWith('data:')) continue
        const dataJson = dataLine.trim().slice(5).trim()

        try {
          const data = JSON.parse(dataJson)
          if (eventType === 'request-body') {
            events.requestBody?.(data)
          } else if (eventType === 'raw') {
            events.rawChunk?.(data as { line: string; json: unknown | null })
          } else if (eventType === 'delta' && typeof data.delta === 'string') {
            fullText += data.delta
            events.delta(data.delta)
          } else if (eventType === 'done' && typeof data.text === 'string') {
            events.done(data.text)
            return
          } else if (eventType === 'error' && typeof data.message === 'string') {
            events.error(data.message)
            return
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }

    // 正常结束（没有收到 done 事件）
    if (fullText) {
      events.done(fullText)
    }
  } catch (e) {
    if (signal?.aborted) return
    events.error(e instanceof Error ? e.message : String(e))
  }
}

/**
 * 生成对话标题：用同一节点后台静默调用，取首条 user + assistant 摘要。
 * 失败抛错由调用方兜底（如用首条 user 消息截断）。
 */
export async function generateTitle(
  params: { baseURL: string; apiKey?: string; model: string },
  firstUser: string,
  firstAssistant: string,
  signal?: AbortSignal,
): Promise<string> {
  const titlePrompt = `请用 10 字以内为以下对话生成简短标题，只输出标题文字，无引号无标点。

用户：${firstUser.slice(0, 200)}
助手：${firstAssistant.slice(0, 200)}`

  let title = ''
  await streamChat(
    {
      baseURL: params.baseURL,
      apiKey: params.apiKey,
      model: params.model,
      messages: [{ role: 'user', content: titlePrompt }],
      maxTokens: 30,
    },
    {
      delta: (d) => { title += d },
      done: (full) => { title = full },
      error: (err) => { throw new Error(err) },
    },
    signal,
  )
  const cleaned = title.trim().replace(/^["'"，。.!！?？]+|["'"，。.!！?？]+$/g, '').slice(0, 20)
  return cleaned || firstUser.slice(0, 15)
}
