// 通用对话服务层 —— 支持纯文本推理和多模态理解（OpenAI 兼容格式）
import { parseSSE } from '../sse'

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
  /** 思考过程增量（reasoning 字段流式返回） */
  reasoningDelta?: (delta: string) => void
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

  let fullText = ''
  try {
    for await (const { event, data } of parseSSE(res.body)) {
      const d = data as { delta?: string; text?: string; message?: string }
      if (event === 'request-body') {
        events.requestBody?.(data)
      } else if (event === 'raw') {
        events.rawChunk?.(data as { line: string; json: unknown | null })
      } else if (event === 'reasoning-delta' && typeof d.delta === 'string') {
        events.reasoningDelta?.(d.delta)
      } else if (event === 'delta' && typeof d.delta === 'string') {
        fullText += d.delta
        events.delta(d.delta)
      } else if (event === 'done' && typeof d.text === 'string') {
        events.done(d.text)
        return
      } else if (event === 'error' && typeof d.message === 'string') {
        events.error(d.message)
        return
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
