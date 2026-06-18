import type { FastifyInstance } from 'fastify'
import { generateImageModelScope, type ImageGenConfig } from '../imageClient'

type GenerateBody = ImageGenConfig

export async function imageRoutes(app: FastifyInstance) {
  // 文生图：后端转发 ModelScope「提交→轮询→取图」异步流程，用 SSE 把进度回推前端。
  // 客户端断连检测同 /api/llm/clean：监听 reply.raw 的 close（见 llm.ts 注释）。
  app.post('/api/image/generate', async (req, reply) => {
    const { baseURL, apiKey, model, prompt } = (req.body ?? {}) as GenerateBody
    if (!baseURL || !apiKey || !model || !prompt?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / apiKey / model / prompt' })
      return
    }

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    const send = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const ac = new AbortController()
    raw.on('close', () => ac.abort())

    generateImageModelScope(
      { baseURL, apiKey, model, prompt },
      (type, payload) => send(type, payload),
      ac.signal,
    )
      .then(() => {
        /* done 事件已在回调中发送 */
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        send('error', { message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => raw.end())
  })
}
