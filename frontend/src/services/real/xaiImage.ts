// xAI Imagine 文生图服务层 —— 经后端 /api/image/xai-generate 网关调用 xAI Images API。
// SSE 解析统一走 services/sse.ts 的 parseSSE。
import { parseSSE } from '../sse'

export interface XaiImageParams {
  baseURL: string
  apiKey: string
  model: string
  prompt: string
  aspectRatio?: string
  resolution?: string
  n?: number
  /** 输入图片（data URL），用于图生图编辑 */
  imageInputs?: string[]
}

export interface XaiImageDone {
  image: string // data URL (data:image/png;base64,...)
  model: string
  n?: number
}

/** 调试事件载荷：展示后端发给 xAI 的 payload 与各阶段返回的原始响应 */
export interface XaiImageDebug {
  stage: 'submit' | 'response' | 'retry'
  payload?: unknown
  response?: unknown
  error?: string
  attempt?: number
  maxRetries?: number
}

export interface XaiImageEvents {
  start: (data: { message: string }) => void
  done: (data: XaiImageDone) => void
  /** 调试事件：提交/响应/重试时触发，携带 payload 与原始响应体 */
  debug: (data: XaiImageDebug) => void
}

/** xAI Imagine 流式请求：转发 POST 到后端，逐 SSE 事件回调；失败（error 事件或网络）抛错。 */
export async function generateImageXai(
  params: XaiImageParams,
  events: Partial<XaiImageEvents>,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/image/xai-generate', {
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

  for await (const { event, data } of parseSSE(res.body)) {
    const parsed = data as Record<string, unknown>
    if (event === 'start') events.start?.(parsed as unknown as { message: string })
    else if (event === 'done') events.done?.(parsed as unknown as XaiImageDone)
    else if (event === 'debug') events.debug?.(parsed as unknown as XaiImageDebug)
    else if (event === 'error') throw new Error((parsed.message as string) ?? 'xAI 生图失败')
  }
}