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
}

export interface ChatEvents {
  delta: (delta: string) => void
  done: (fullText: string) => void
  error: (error: string) => void
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
          if (eventType === 'delta' && typeof data.delta === 'string') {
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
