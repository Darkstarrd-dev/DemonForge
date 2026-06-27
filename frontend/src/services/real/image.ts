// 文生图真实服务层 —— 经后端 /api/image/generate 网关调用 ModelScope。
// SSE 解析统一走 services/sse.ts 的 parseSSE。
import { parseSSE } from '../sse'

export interface ImageGenParams {
  baseURL: string
  apiKey: string
  model: string
  prompt: string
  /** 输出分辨率字符串，如 "1024x1024"（对应 ModelScope payload 的 size 字段） */
  size?: string
  /** 采样步数，可选 */
  steps?: number
  /** guidance scale，可选 */
  guidance?: number
  /** 随机种子，可选 */
  seed?: number
  /** 反向提示词，可选 */
  negativePrompt?: string
  /** 输入图片列表（Base64 data URL），用于图片编辑（Image2Image） */
  imageInputs?: string[]
}

/** 调试事件载荷：展示后端发给 ModelScope 的 payload 与各阶段返回的原始响应 */
export interface ImageGenDebug {
  stage: 'submit' | 'poll' | 'fetchImage'
  payload?: unknown
  response?: unknown
  error?: string
}

export interface ImageGenEvents {
  submitted: (data: { taskId: string }) => void
  polling: (data: { status: string; attempt: number }) => void
  done: (data: { image: string; model: string }) => void
  /** 调试事件：每次提交/轮询/取图时触发，携带 payload 与 ModelScope 返回的响应体 */
  debug: (data: ImageGenDebug) => void
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

  for await (const { event, data } of parseSSE(res.body)) {
    const parsed = data as Record<string, unknown>
    if (event === 'submitted') events.submitted?.(parsed as unknown as { taskId: string })
    else if (event === 'polling') events.polling?.(parsed as unknown as { status: string; attempt: number })
    else if (event === 'done') events.done?.(parsed as unknown as { image: string; model: string })
    else if (event === 'debug') events.debug?.(parsed as unknown as ImageGenDebug)
    else if (event === 'error') throw new Error((parsed.message as string) ?? '生成失败')
  }
}
