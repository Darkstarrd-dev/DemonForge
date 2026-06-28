// 创作类端点 · 生成域（B-8 拆分）：M3 推演 + M4 草稿 + M5 定稿/审校。
// draft（M4 章节草稿）/ finalize（M5 定稿）/ consistency（M5 一致性审校）/ simulate（M3 角色推演·多候选）。
// 共用 Context Assembler（draft/simulate）。
import type { FastifyInstance } from 'fastify'
import { chatStream, type ProviderConfig } from '../llmClient'
import {
  DRAFT_SYSTEM_PROMPT,
  FINALIZE_SYSTEM_PROMPT,
  CONSISTENCY_SYSTEM_PROMPT,
  SIMULATE_CHARACTER_SYSTEM_PROMPT,
} from '../prompts'
import { assembleContext, type AssembleInput } from '../contextAssembler'
import { hijackSSE } from '../utils/sseHelper'
import { streamChat } from './creation.shared'

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
type SimulateBody = ProviderConfig & {
  /** Context Assembler 输入参数 */
  context: AssembleInput
  /** 生成候选数（默认 2） */
  candidateCount?: number
}

export async function generateRoutes(app: FastifyInstance) {
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

  // M3 角色推演（simulate）——SSE 流式，串行生成多个候选
  app.post('/api/llm/simulate', async (req, reply) => {
    const { baseURL, apiKey, model, context, candidateCount } = (req.body ?? {}) as SimulateBody
    if (!baseURL || !model || !context?.bookId || !context?.sceneId || !context?.targetCharacterId) {
      reply.status(400).send({ error: '缺少 baseURL / model / context.bookId / sceneId / targetCharacterId' })
      return
    }

    // 组装上下文
    const ctx = await assembleContext(context)

    if (!ctx.scene || !ctx.targetCharacter) {
      reply.status(404).send({ error: '场景或角色不存在' })
      return
    }

    // 构建 user prompt
    const sections = [
      '# 目标角色卡',
      `**名称**：${ctx.targetCharacter.name}`,
      `**描述**：${ctx.targetCharacter.description}`,
      ctx.targetCharacter.styleNote ? `**语言风格**：${ctx.targetCharacter.styleNote}` : '',
      ctx.targetCharacter.styleExamples && ctx.targetCharacter.styleExamples.length > 0
        ? `**台词例句**：\n${ctx.targetCharacter.styleExamples.map((ex) => `- "${ex}"`).join('\n')}`
        : '',
      Object.keys(ctx.targetCharacter.fields).length > 0
        ? `**其他属性**：\n${Object.entries(ctx.targetCharacter.fields)
            .map(([k, v]) => `- ${k}：${v}`)
            .join('\n')}`
        : '',
      '',
      '# 场景描述',
      `**场景**：${ctx.scene.desc}`,
      `**场景目标**：${ctx.scene.goal}`,
      '',
      '# 前情摘要',
      ctx.scene.prevSummary || '（无）',
      '',
      '# 在场角色',
      ctx.presentCharacters.length > 0
        ? ctx.presentCharacters.map((c) => `- ${c.name}：${c.description}`).join('\n')
        : '（仅目标角色在场）',
      '',
      '# 背景资料（RAG 检索）',
      ctx.ragChunks.length > 0 ? ctx.ragChunks.map((c) => `【${c.source}】\n${c.text}`).join('\n\n') : '（无相关资料）',
      '',
      '# 已有片段（供参考）',
      ctx.adoptedFragments.length > 0
        ? ctx.adoptedFragments.map((f, i) => `## 片段 ${i + 1}\n${f}`).join('\n\n')
        : '（无已有片段，本角色首次推演）',
      '',
      '现在基于以上信息，推演该角色在此场景中的言行举止（200–400 字）。',
    ]

    const userPrompt = sections.filter(Boolean).join('\n')
    const count = candidateCount && candidateCount > 0 ? candidateCount : 2

    // 手动实现多候选 SSE 流式（串行生成，每个候选一个 delta 流 + candidate-done 事件）
    const { raw, send, ac } = hijackSSE(reply)

    try {
      for (let i = 0; i < count; i++) {
        if (ac.signal.aborted) break

        const candidateText = await chatStream(
          {
            baseURL,
            apiKey,
            model,
            messages: [
              { role: 'system', content: SIMULATE_CHARACTER_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            signal: ac.signal,
          },
          (delta) => send('delta', { candidateIndex: i, delta }),
        )

        if (candidateText.trim().length < 50) {
          send('error', { message: `候选 ${i + 1} 输出过短（${candidateText.trim().length} 字符），判为失败` })
          break
        }

        send('candidate-done', { candidateIndex: i, text: candidateText })
      }

      if (!ac.signal.aborted) {
        send('done', {})
      }
    } catch (e: unknown) {
      if (!ac.signal.aborted) {
        send('error', { message: e instanceof Error ? e.message : String(e) })
      }
    } finally {
      raw.end()
    }
  })
}
