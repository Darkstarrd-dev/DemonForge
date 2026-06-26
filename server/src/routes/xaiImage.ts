// xAI Imagine 图片生成路由 — SSE 流式端点
// 协议：同步（非异步任务），POST /v1/images/generations
// 文生图 + 图生图编辑（image_url 参数）

import type { FastifyInstance } from 'fastify'
import { hijackSSE } from '../utils/sseHelper'
import { generateImageXai, type XaiImageConfig } from '../xaiImageClient'

interface XaiImageBody {
  baseURL: string
  apiKey: string
  model: string
  prompt: string
  aspectRatio?: string
  resolution?: string
  n?: number
  imageInputs?: string[]
}

export async function xaiImageRoutes(app: FastifyInstance) {
  app.post('/api/image/xai-generate', async (request, reply) => {
    const { raw, send, ac } = hijackSSE(reply)

    const body = request.body as XaiImageBody

    const cfg: XaiImageConfig = {
      baseURL: body.baseURL,
      apiKey: body.apiKey,
      model: body.model,
      prompt: body.prompt,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      n: body.n,
      imageInputs: body.imageInputs,
    }

    try {
      await generateImageXai(
        cfg,
        (type, data) => {
          send(type, data)
        },
        ac.signal,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      send('error', { message: msg })
      if (!raw.destroyed) raw.end()
    }
  })
}