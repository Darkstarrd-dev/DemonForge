// 文生图真实服务层 —— 经后端 /api/image/generate 网关调用 ModelScope。
// SSE 客户端解析复用 creation.ts 的 reader/decoder/\n\n event 解析范式（多事件分发版）。

export interface ImageGenParams {
  baseURL: string
  apiKey: string
  model: string
  prompt: string
}

export interface ImageGenEvents {
  submitted: (data: { taskId: string }) => void
  polling: (data: { status: string; attempt: number }) => void
  done: (data: { image: string; model: string }) => void
}

/**
 * 文生图流式请求：转发 POST 到后端，逐 SSE 事件回调；失败（error 事件或网络）抛错。
 * done 事件携带生成图片的 data URL，由调用方渲染。
 */
export async function generateImage(
  params: ImageGenParams,
  events: Partial<ImageGenEvents>,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/image/generate', {
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
      if (event === 'submitted') events.submitted?.(parsed as unknown as { taskId: string })
      else if (event === 'polling') events.polling?.(parsed as unknown as { status: string; attempt: number })
      else if (event === 'done') events.done?.(parsed as unknown as { image: string; model: string })
      else if (event === 'error') throw new Error((parsed.message as string) ?? '生成失败')
    }
    if (done) break
  }
}
