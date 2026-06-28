// 创作类端点 · 起源域（B-8 拆分）：M0 立项·架构。
// arch（小说架构·雪花法）/ arch-input（创作方向 JSON）/ blueprint（章节蓝图）。
import type { FastifyInstance } from 'fastify'
import type { ProviderConfig } from '../llmClient'
import { ARCH_SYSTEM_PROMPT, ARCH_INPUT_PROMPT, BLUEPRINT_SYSTEM_PROMPT } from '../prompts'
import { streamChat } from './creation.shared'

type ArchBody = ProviderConfig & { topic?: string; genre?: string; chapters?: number; guidance?: string; systemPrompt?: string }
type ArchInputBody = ProviderConfig & { genre?: string; chapters?: number; guidance?: string; systemPrompt?: string }
type BlueprintBody = ProviderConfig & {
  architecture?: string
  existingDirectory?: string
  totalChapters?: number
  startChapter?: number
  systemPrompt?: string
}

export async function originRoutes(app: FastifyInstance) {
  // 生成小说架构（雪花法四步）——SSE 流式
  app.post('/api/llm/arch', async (req, reply) => {
    const { baseURL, apiKey, model, topic, genre, chapters, guidance, systemPrompt } = (req.body ?? {}) as ArchBody
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
      { role: 'system', content: systemPrompt?.trim() || ARCH_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ])
  })

  // 生成创作方向输入（topic/genre/guidance）——SSE 流式，输出 JSON
  app.post('/api/llm/arch-input', async (req, reply) => {
    const { baseURL, apiKey, model, genre, chapters, guidance, systemPrompt } = (req.body ?? {}) as ArchInputBody
    if (!baseURL || !model) {
      reply.status(400).send({ error: '缺少 baseURL / model' })
      return
    }
    const userPrompt = [
      genre?.trim() ? `偏好类型：${genre.trim()}` : '',
      chapters ? `预估总章节数：${chapters}` : '',
      guidance?.trim() ? `已有思路/梗概：${guidance.trim()}` : '',
      '',
      '请按输出格式，脑暴一个完整的创作方向，输出 JSON。',
    ]
      .filter(Boolean)
      .join('\n')

    await streamChat(reply, { baseURL, apiKey, model }, [
      { role: 'system', content: systemPrompt?.trim() || ARCH_INPUT_PROMPT },
      { role: 'user', content: userPrompt || '请自由发挥创意，生成一个有趣的小说创作方向。' },
    ])
  })

  // 生成章节蓝图（节奏化目录）——SSE 流式
  app.post('/api/llm/blueprint', async (req, reply) => {
    const { baseURL, apiKey, model, architecture, existingDirectory, totalChapters, startChapter, systemPrompt } =
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
      { role: 'system', content: systemPrompt?.trim() || BLUEPRINT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ])
  })
}
