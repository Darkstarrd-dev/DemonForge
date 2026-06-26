// GPT Image 文生图服务层 —— 经后端 /api/image/gpt-generate 网关调用 OpenAI Images API。
// SSE 客户端解析复用 image.ts 的 reader/decoder/\n\n event 解析范式。

export interface GptImageParams {
  baseURL: string
  apiKey?: string
  model: string
  prompt: string
  size?: string
  quality?: string
  background?: string
  moderation?: string
}

export interface GptImageDone {
  image: string // data URL (data:image/png;base64,...)
  model: string
  revisedPrompt?: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

/** 调试事件载荷：展示后端发给 GPT Image 的 payload 与各阶段返回的原始响应 */
export interface GptImageDebug {
  stage: 'submit' | 'response' | 'fetchImage'
  payload?: unknown
  response?: unknown
  error?: string
}

export interface GptImageEvents {
  start: (data: { message: string }) => void
  downloading: (data: { message: string }) => void
  done: (data: GptImageDone) => void
  /** 调试事件：提交/响应/取图时触发，携带 payload 与 GPT 返回的响应体 */
  debug: (data: GptImageDebug) => void
}

/** GPT Image 流式请求：转发 POST 到后端，逐 SSE 事件回调；失败（error 事件或网络）抛错。 */
export async function generateImageGpt(
  params: GptImageParams,
  events: Partial<GptImageEvents>,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/image/gpt-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    throw new Error(`网关错误 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  if (!res.body) throw new Error('响应无 body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    const text = value ? decoder.decode(value, { stream: !done }) : ''
    buffer += text
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      if (!chunk.trim()) continue
      let event = 'message'
      let data = ''
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      const parsed = JSON.parse(data) as Record<string, unknown>
      if (event === 'start') events.start?.(parsed as unknown as { message: string })
      else if (event === 'downloading') events.downloading?.(parsed as unknown as { message: string })
      else if (event === 'done') events.done?.(parsed as unknown as GptImageDone)
      else if (event === 'debug') events.debug?.(parsed as unknown as GptImageDebug)
      else if (event === 'error') throw new Error((parsed.message as string) ?? 'GPT 生图失败')
    }
    if (done) break
  }
}