// 创作类端点集中处（novel-generator 集成·阶段 B：起源流程）。
// 阶段 C 的 draft / finalize / consistency 同此文件追加。
import type { FastifyInstance, FastifyReply } from 'fastify'
import { chatStream, type ProviderConfig } from '../llmClient.ts'
import { ARCH_SYSTEM_PROMPT, BLUEPRINT_SYSTEM_PROMPT } from '../prompts.ts'

type ArchBody = ProviderConfig & { topic?: string; genre?: string; chapters?: number; guidance?: string }
type BlueprintBody = ProviderConfig & {
  architecture?: string
  existingDirectory?: string
  totalChapters?: number
  startChapter?: number
}

/**
 * 本地 SSE 流式辅助：复刻 routes/llm.ts 的 /api/llm/clean 范式。
 * 断连检测陷阱：必须监听 **响应**（reply.raw）的 close，而非 req.raw——
 * req.raw 在请求体读取完毕后即触发 close（HTTP 正常行为，不代表客户端断开），
 * 若据此 abort 会在 chatStream 收到首个 delta 前取消上游请求，导致空响应。
 */
async function streamChat(
  reply: FastifyReply,
  provider: ProviderConfig,
  messages: { role: 'system' | 'user'; content: string }[],
): Promise<void> {
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

export async function creationRoutes(app: FastifyInstance) {
  // 生成小说架构（雪花法四步）——SSE 流式
  app.post('/api/llm/arch', async (req, reply) => {
    const { baseURL, apiKey, model, topic, genre, chapters, guidance } = (req.body ?? {}) as ArchBody
    if (!baseURL || !model || !topic?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / topic' })
      return
    }
    const userPrompt = [
      `主题：${topic.trim()}`,
      genre?.trim() ? `类型：${genre.trim()}` : '',
      chapters ? `预估总章节数：${chapters}` : '',
      guidance?.trim() ? `核心梗概 / 指导：${guidance.trim()}` : '',
      '',
      '请按工作方法与输出格式，生成这部小说的总体架构。',
    ]
      .filter(Boolean)
      .join('\n')

    await streamChat(reply, { baseURL, apiKey, model }, [
      { role: 'system', content: ARCH_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ])
  })

  // 生成章节蓝图（节奏化目录）——SSE 流式
  app.post('/api/llm/blueprint', async (req, reply) => {
    const { baseURL, apiKey, model, architecture, existingDirectory, totalChapters, startChapter } =
      (req.body ?? {}) as BlueprintBody
    if (!baseURL || !model || !architecture?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / architecture' })
      return
    }
    const begin = startChapter && startChapter > 0 ? startChapter : 1
    const total = totalChapters && totalChapters > 0 ? totalChapters : 30
    // 单次不超过 20 章（对齐 BLUEPRINT_SYSTEM_PROMPT 约束）
    const end = Math.min(begin + 19, total)
    const userPrompt = [
      '【已确认的小说架构】',
      architecture.trim(),
      '',
      existingDirectory?.trim()
        ? `【已有章节目录（请保持连贯，从第 ${begin} 章续写）】\n${existingDirectory.trim()}`
        : `本次从第 ${begin} 章开始生成。`,
      '',
      `全书共约 ${total} 章，本次生成第 ${begin}–${end} 章的蓝图（不超过 20 章）。`,
      '请按输出格式逐章生成。',
    ]
      .filter(Boolean)
      .join('\n')

    await streamChat(reply, { baseURL, apiKey, model }, [
      { role: 'system', content: BLUEPRINT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ])
  })
}
