import type { FastifyInstance } from 'fastify'
import { readFileSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { generateImageModelScope, type ImageGenConfig } from '../imageClient'
import { hijackSSE } from '../utils/sseHelper'
import { getImageArchiveDir } from '../utils/imageArchive'

type GenerateBody = ImageGenConfig

export async function imageRoutes(app: FastifyInstance) {
  // 归档图片静态访问：/api/image/file/<name> → 从归档目录读取并返回（防目录穿越）。
  app.get('/api/image/file/:name', async (req, reply) => {
    const raw = (req.params as { name: string }).name
    const name = basename(decodeURIComponent(raw)) // 防穿越：只取文件名部分
    if (!name || name.includes('..')) {
      reply.status(400).send({ error: '非法文件名' })
      return
    }
    const file = join(getImageArchiveDir(), name)
    if (!existsSync(file)) {
      reply.status(404).send({ error: '图片不存在' })
      return
    }
    const ext = extname(name).toLowerCase()
    const mime = ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : 'application/octet-stream'
    reply.header('Cache-Control', 'public, max-age=31536000, immutable') // 文件名唯一，可强缓存
    reply.type(mime).send(readFileSync(file))
  })

  // 文生图：后端转发 ModelScope「提交→轮询→取图」异步流程，用 SSE 把进度回推前端。
  // 客户端断连检测同 /api/llm/clean：监听 reply.raw 的 close（见 llm.ts 注释）。
  app.post('/api/image/generate', async (req, reply) => {
    const { baseURL, apiKey, model, prompt, size, steps, guidance, seed, negativePrompt, imageInputs } =
      (req.body ?? {}) as GenerateBody
    if (!baseURL || !apiKey || !model || !prompt?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / apiKey / model / prompt' })
      return
    }

    const { raw, send, ac } = hijackSSE(reply)

    generateImageModelScope(
      { baseURL, apiKey, model, prompt, size, steps, guidance, seed, negativePrompt, imageInputs },
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
