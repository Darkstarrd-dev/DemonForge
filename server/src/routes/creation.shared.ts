// 创作类端点共享辅助（B-8：creation.ts 按领域拆分后的公共 helper）。
// 三个领域文件（creation.origin / creation.generate / creation.m2）共用：
//   - stripJsonFence：剥 ```json``` 围栏
//   - collectText：非流式收集一次完整文本
//   - streamChat：本地 SSE 流式辅助（含断连检测陷阱说明）
import type { FastifyReply } from 'fastify'
import { chatStream, type ProviderConfig } from '../llmClient'
import { hijackSSE } from '../utils/sseHelper'

/** 去掉 LLM 输出里可能的 ```json``` 围栏，返回纯 JSON 文本。 */
export function stripJsonFence(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return t
}

/** 非流式收集一次 chat completion 的完整文本（复用 chatStream 的 no-op delta）。 */
export async function collectText(provider: ProviderConfig, system: string, user: string, signal?: AbortSignal): Promise<string> {
  return chatStream(
    { baseURL: provider.baseURL, apiKey: provider.apiKey, model: provider.model, messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], signal },
    () => {},
  )
}

/**
 * 本地 SSE 流式辅助：复刻 routes/llm.ts 的 /api/llm/clean 范式。
 * 断连检测陷阱：必须监听 **响应**（reply.raw）的 close，而非 req.raw——
 * req.raw 在请求体读取完毕后即触发 close（HTTP 正常行为，不代表客户端断开），
 * 若据此 abort 会在 chatStream 收到首个 delta 前取消上游请求，导致空响应。
 */
export async function streamChat(
  reply: FastifyReply,
  provider: ProviderConfig,
  messages: { role: 'system' | 'user'; content: string }[],
): Promise<void> {
  const { raw, send, ac } = hijackSSE(reply)

  chatStream(
    { baseURL: provider.baseURL, apiKey: provider.apiKey, model: provider.model, messages, signal: ac.signal },
    (delta) => send('delta', { delta }),
  )
    .then((full) => {
      if (full.trim().length < 10) send('error', { message: `输出过短（${full.trim().length} 字符），判为失败` })
      else send('done', { text: full })
    })
    .catch((e: unknown) => {
      if (ac.signal.aborted) return
      send('error', { message: e instanceof Error ? e.message : String(e) })
    })
    .finally(() => raw.end())
}
