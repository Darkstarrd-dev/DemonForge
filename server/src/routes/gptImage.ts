import type { FastifyInstance } from 'fastify'
import { generateImageGpt, type GptImageConfig } from '../gptImageClient'
import { hijackSSE } from '../utils/sseHelper'

type GenerateBody = GptImageConfig

export async function gptImageRoutes(app: FastifyInstance) {
  // GPT Image 生图：POST /v1/images/generations 同步协议，SSE 回推进度与结果。
  app.post('/api/image/gpt-generate', async (req, reply) => {
    const { baseURL, apiKey, model, prompt, size, quality, background, moderation } =
      (req.body ?? {}) as GenerateBody
    if (!baseURL || !model || !prompt?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / prompt' })
      return
    }

    const { raw, send, ac } = hijackSSE(reply)

    generateImageGpt(
      { baseURL, apiKey, model, prompt, size, quality, background, moderation },
      (type, payload) => send(type, payload),
      ac.signal,
    )
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        send('error', { message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => raw.end())
  })
}