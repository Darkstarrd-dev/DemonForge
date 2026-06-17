// 创作类端点集中处（novel-generator 集成·阶段 B/C：起源流程 + 生成/管理真实化）。
import type { FastifyInstance, FastifyReply } from 'fastify'
import { chatStream, type ProviderConfig } from '../llmClient'
import {
  ARCH_SYSTEM_PROMPT,
  BLUEPRINT_SYSTEM_PROMPT,
  DRAFT_SYSTEM_PROMPT,
  FINALIZE_SYSTEM_PROMPT,
  CONSISTENCY_SYSTEM_PROMPT,
} from '../prompts'
import { assembleContext, type AssembleInput } from '../contextAssembler'

type ArchBody = ProviderConfig & { topic?: string; genre?: string; chapters?: number; guidance?: string }
type BlueprintBody = ProviderConfig & {
  architecture?: string
  existingDirectory?: string
  totalChapters?: number
  startChapter?: number
}
type DraftBody = ProviderConfig & {
  /** Context Assembler 输入参数（由前端组装好传入） */
  context: AssembleInput
  /** 用户额外指导（可选） */
  userGuidance?: string
  /** 目标字数（默认 3000） */
  targetWordCount?: number
}
type FinalizeBody = ProviderConfig & {
  /** 章节完整正文 */
  chapterText: string
  /** 现有全局摘要 */
  existingGlobalSummary?: string
  /** 现有角色状态列表（JSON 字符串） */
  existingStates?: string
}
type ConsistencyBody = ProviderConfig & {
  /** 待审校章节正文 */
  chapterText: string
  /** 小说架构（JSON 字符串） */
  architecture?: string
  /** 角色状态列表（JSON 字符串） */
  characterStates?: string
  /** 前文摘要 */
  previousSummary?: string
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

  // 生成章节草稿（M4）——SSE 流式
  app.post('/api/llm/draft', async (req, reply) => {
    const { baseURL, apiKey, model, context, userGuidance, targetWordCount } = (req.body ?? {}) as DraftBody
    if (!baseURL || !model || !context?.bookId) {
      reply.status(400).send({ error: '缺少 baseURL / model / context.bookId' })
      return
    }

    // 组装上下文
    const ctx = await assembleContext(context)

    // 构建 user prompt（将 Context Assembler 结果转为文本）
    const sections = [
      '# 小说架构',
      ctx.architecture
        ? [
            '## 核心种子',
            ctx.architecture.seed,
            '## 角色动力学',
            ctx.architecture.characterDynamics,
            '## 世界观',
            ctx.architecture.worldBuilding,
            '## 三幕式情节',
            ctx.architecture.plotStructure,
          ].join('\n')
        : '（无架构）',
      '',
      '# 本章蓝图',
      ctx.currentOutline
        ? [
            `第 ${ctx.currentOutline.order} 章 ${ctx.currentOutline.title}`,
            `定位：${ctx.currentOutline.positioning ?? '—'}`,
            `核心作用：${ctx.currentOutline.role ?? '—'}`,
            `悬念密度：${ctx.currentOutline.suspenseDensity ?? '—'}`,
            `伏笔：${ctx.currentOutline.foreshadow ?? '—'}`,
            `认知颠覆：${'★'.repeat(ctx.currentOutline.twistLevel ?? 0)}${'☆'.repeat(5 - (ctx.currentOutline.twistLevel ?? 0))}`,
            `简述：${ctx.currentOutline.summary}`,
          ].join('\n')
        : '（无蓝图）',
      '',
      '# 下章蓝图（用于承上启下）',
      ctx.nextOutline ? `第 ${ctx.nextOutline.order} 章 ${ctx.nextOutline.title}：${ctx.nextOutline.summary}` : '（无）',
      '',
      '# 前文摘要',
      '## 全书滚动摘要',
      ctx.globalSummary || '（无）',
      '## 前一章摘要',
      ctx.prevChapterSummary || '（本章是第一章）',
      '',
      '# 角色状态',
      ctx.characterTimeline.length > 0
        ? ctx.characterTimeline.map((e) => `- [${e.eventType}] ${e.description}`).join('\n')
        : '（无角色状态记录）',
      '',
      '# 背景资料（RAG 检索）',
      ctx.ragChunks.length > 0 ? ctx.ragChunks.map((c) => `【${c.source}】\n${c.text}`).join('\n\n') : '（无相关资料）',
      '',
      '# 已采纳的推演片段（必须保留原文）',
      ctx.adoptedFragments.length > 0
        ? ctx.adoptedFragments.map((f, i) => `## 片段 ${i + 1}\n${f}`).join('\n\n')
        : '（无已采纳片段，全章自由创作）',
      '',
      userGuidance ? `# 用户指导\n${userGuidance.trim()}\n` : '',
      `# 写作要求\n目标字数：约 ${targetWordCount ?? 3000} 字。\n现在开始创作。`,
    ]

    const userPrompt = sections.filter(Boolean).join('\n')

    await streamChat(reply, { baseURL, apiKey, model }, [
      { role: 'system', content: DRAFT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ])
  })

  // 定稿章节（M5 finalize）——SSE 流式，输出 JSON
  app.post('/api/llm/finalize', async (req, reply) => {
    const { baseURL, apiKey, model, chapterText, existingGlobalSummary, existingStates } = (req.body ??
      {}) as FinalizeBody
    if (!baseURL || !model || !chapterText?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / chapterText' })
      return
    }

    const userPrompt = [
      '# 待定稿章节',
      chapterText.trim(),
      '',
      '# 现有全局摘要',
      existingGlobalSummary?.trim() || '（无）',
      '',
      '# 现有角色状态',
      existingStates?.trim() || '（无）',
      '',
      '现在执行定稿，输出 JSON（不要 ```json``` 标记）。',
    ].join('\n')

    await streamChat(reply, { baseURL, apiKey, model }, [
      { role: 'system', content: FINALIZE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ])
  })

  // 一致性审校（M5 consistency）——SSE 流式，输出 JSON
  app.post('/api/llm/consistency', async (req, reply) => {
    const { baseURL, apiKey, model, chapterText, architecture, characterStates, previousSummary } = (req.body ??
      {}) as ConsistencyBody
    if (!baseURL || !model || !chapterText?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / chapterText' })
      return
    }

    const userPrompt = [
      '# 待审校章节',
      chapterText.trim(),
      '',
      '# 小说架构',
      architecture?.trim() || '（无）',
      '',
      '# 角色当前状态',
      characterStates?.trim() || '（无）',
      '',
      '# 前文摘要',
      previousSummary?.trim() || '（无）',
      '',
      '现在执行一致性审校，输出 JSON（不要 ```json``` 标记）。',
    ].join('\n')

    await streamChat(reply, { baseURL, apiKey, model }, [
      { role: 'system', content: CONSISTENCY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ])
  })
}
