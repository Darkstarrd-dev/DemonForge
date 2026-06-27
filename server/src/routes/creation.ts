// 创作类端点集中处（novel-generator 集成·阶段 B/C：起源流程 + 生成/管理真实化）。
import type { FastifyInstance, FastifyReply } from 'fastify'
import { chatStream, embed, type ProviderConfig } from '../llmClient'
import {
  ARCH_SYSTEM_PROMPT,
  ARCH_INPUT_PROMPT,
  BLUEPRINT_SYSTEM_PROMPT,
  DRAFT_SYSTEM_PROMPT,
  FINALIZE_SYSTEM_PROMPT,
  CONSISTENCY_SYSTEM_PROMPT,
  EXTRACT_ENTITIES_SYSTEM_PROMPT,
  SIMULATE_CHARACTER_SYSTEM_PROMPT,
  GENERATE_CARD_SYSTEM_PROMPT,
  CARD_IMAGE_PROMPTS_SYSTEM_PROMPT,
} from '../prompts'
import { assembleContext, type AssembleInput } from '../contextAssembler'
import { hijackSSE } from '../utils/sseHelper'

type ArchBody = ProviderConfig & { topic?: string; genre?: string; chapters?: number; guidance?: string }
type ArchInputBody = ProviderConfig & { genre?: string; chapters?: number; guidance?: string }
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
type SimulateBody = ProviderConfig & {
  /** Context Assembler 输入参数 */
  context: AssembleInput
  /** 生成候选数（默认 2） */
  candidateCount?: number
}
type ExtractEntitiesBody = ProviderConfig & {
  /** 所属作品 ID */
  bookId: string
  /** 要提取的章节 ID 列表 */
  chapterIds: string[]
  /** 已存在的卡片名称（用于去重） */
  existingCardNames?: string[]
}
type GenerateCardBody = ProviderConfig & {
  /** 实体类型 character/location/item/skill/faction */
  type: string
  /** 用户描述指令 */
  instruction: string
  /** 模式：新建 / 在已有卡片基础上丰富 */
  mode?: 'create' | 'enrich'
  /** enrich 模式下的已有卡片内容（JSON 字符串或对象的描述） */
  existingCard?: string
}
type CardImagePromptsBody = ProviderConfig & {
  /** 卡片描述（人物/场景/道具设定） */
  cardDescription: string
  /** 用户意图，如「8 个表情差分」 */
  intent: string
  /** 需要的提示词数量 */
  count?: number
}

/** 去掉 LLM 输出里可能的 ```json``` 围栏，返回纯 JSON 文本。 */
function stripJsonFence(text: string): string {
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return t
}

/** 非流式收集一次 chat completion 的完整文本（复用 chatStream 的 no-op delta）。 */
async function collectText(provider: ProviderConfig, system: string, user: string, signal?: AbortSignal): Promise<string> {
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
async function streamChat(
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

  // 生成创作方向输入（topic/genre/guidance）——SSE 流式，输出 JSON
  app.post('/api/llm/arch-input', async (req, reply) => {
    const { baseURL, apiKey, model, genre, chapters, guidance } = (req.body ?? {}) as ArchInputBody
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
      { role: 'system', content: ARCH_INPUT_PROMPT },
      { role: 'user', content: userPrompt || '请自由发挥创意，生成一个有趣的小说创作方向。' },
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

  // M2 设定提取（批量章节并行）——SSE 流式，输出 progress/entity/merge/done/error 事件
  app.post('/api/llm/extract-entities', async (req, reply) => {
    const { baseURL, apiKey, model, bookId, chapterIds, existingCardNames } = (req.body ?? {}) as ExtractEntitiesBody
    if (!baseURL || !model || !bookId || !Array.isArray(chapterIds) || chapterIds.length === 0) {
      reply.status(400).send({ error: '缺少 baseURL / model / bookId / chapterIds' })
      return
    }

    const { raw, send, ac } = hijackSSE(reply)

    try {
      // 1. 从 chapters 表读取章节内容
      const { getDb } = await import('../store/db')
      const db = getDb()
      const placeholders = chapterIds.map(() => '?').join(',')
      const rows = db.prepare(`SELECT data FROM chapters WHERE id IN (${placeholders})`).all(...chapterIds) as { data: string }[]
      const chapters: { id: string; title: string; content: string }[] = []
      for (const row of rows) {
        try {
          const ch = JSON.parse(row.data) as { id: string; title: string; content: string }
          chapters.push(ch)
        } catch {
          continue
        }
      }

      if (chapters.length === 0) {
        send('error', { message: '未找到有效章节' })
        raw.end()
        return
      }

      send('progress', { stage: 'extracting', total: chapters.length, current: 0 })

      // 2. 串行逐章提取实体（避免并行触发上游 RPM 限流）
      interface RawEntity {
        type: string
        name: string
        description: string
        fields: Record<string, string>
        excerpt: string
      }

      const existingSet = new Set(existingCardNames ?? [])
      const entityMap = new Map<string, { entity: RawEntity; refs: { chapterId: string; excerpt: string }[] }>()

      for (let idx = 0; idx < chapters.length; idx++) {
        if (ac.signal.aborted) break
        const ch = chapters[idx]

        const userPrompt = `请从以下章节中提取实体（人物、地点、物品、技能、势力）：\n\n${ch.content}`

        try {
          const full = await chatStream(
            {
              baseURL,
              apiKey,
              model,
              messages: [
                { role: 'system', content: EXTRACT_ENTITIES_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
              ],
              signal: ac.signal,
            },
            () => {}, // 不需要 delta 回调
          )

          // 解析 JSON 输出
          let entities: RawEntity[] = []
          try {
            entities = JSON.parse(full.trim()) as RawEntity[]
          } catch (parseErr) {
            send('error', {
              message: `章节 ${ch.title} 解析失败：${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
            })
            continue
          }

          // 按 (type, name) 合并出处引用
          for (const ent of entities) {
            if (existingSet.has(ent.name)) continue // 去重
            const key = `${ent.type}:${ent.name}`
            if (entityMap.has(key)) {
              entityMap.get(key)!.refs.push({ chapterId: ch.id, excerpt: ent.excerpt })
            } else {
              entityMap.set(key, { entity: ent, refs: [{ chapterId: ch.id, excerpt: ent.excerpt }] })
            }
          }

          send('progress', { stage: 'extracting', total: chapters.length, current: idx + 1 })
        } catch (err) {
          if (ac.signal.aborted) break
          send('error', {
            message: `章节 ${ch.title} 提取失败：${err instanceof Error ? err.message : String(err)}`,
          })
        }
      }

      if (ac.signal.aborted) {
        raw.end()
        return
      }

      send('progress', { stage: 'embedding', total: entityMap.size, current: 0 })

      // 3. 对每张卡片调用 embed() 生成向量
      const cards: Array<{ entity: RawEntity; refs: { chapterId: string; excerpt: string }[]; vector: number[] }> = []
      let embIdx = 0
      for (const { entity, refs } of entityMap.values()) {
        if (ac.signal.aborted) break
        try {
          const text = `${entity.name}\n${entity.description}\n${Object.values(entity.fields).join('\n')}`
          const vectors = await embed({ baseURL, apiKey, model }, [text])
          cards.push({ entity, refs, vector: vectors[0] })
          embIdx++
          send('progress', { stage: 'embedding', total: entityMap.size, current: embIdx })
        } catch (err) {
          send('error', {
            message: `向量化失败（${entity.name}）：${err instanceof Error ? err.message : String(err)}`,
          })
        }
      }

      if (ac.signal.aborted) {
        raw.end()
        return
      }

      // 4. 计算两两余弦相似度，≥0.85 生成 MergeCandidate
      function cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0,
          normA = 0,
          normB = 0
        for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i]
          normA += a[i] * a[i]
          normB += b[i] * b[i]
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB))
      }

      const mergeCandidates: Array<{ cardA: RawEntity; cardB: RawEntity; similarity: number }> = []
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const sim = cosineSimilarity(cards[i].vector, cards[j].vector)
          if (sim >= 0.85) {
            mergeCandidates.push({ cardA: cards[i].entity, cardB: cards[j].entity, similarity: sim })
          }
        }
      }

      send('progress', { stage: 'merging', mergeCandidateCount: mergeCandidates.length })

      // 5. 逐卡发送 entity 事件
      for (const { entity, refs } of cards) {
        send('entity', {
          type: entity.type,
          name: entity.name,
          description: entity.description,
          fields: entity.fields,
          refs,
        })
      }

      // 6. 发送 merge candidates
      for (const mc of mergeCandidates) {
        send('merge', {
          cardAName: mc.cardA.name,
          cardBName: mc.cardB.name,
          similarity: mc.similarity,
        })
      }

      send('done', { entityCount: cards.length, mergeCandidateCount: mergeCandidates.length })
    } catch (err) {
      if (!ac.signal.aborted) {
        send('error', { message: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      raw.end()
    }
  })

  // M2 设定卡片 · AI 直接生成（不依赖原文）——非流式 JSON 响应
  app.post('/api/llm/generate-card', async (req, reply) => {
    const { baseURL, apiKey, model, type, instruction, mode, existingCard } = (req.body ?? {}) as GenerateCardBody
    if (!baseURL || !model || !type?.trim() || !instruction?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / type / instruction' })
      return
    }
    const isEnrich = mode === 'enrich' && existingCard?.trim()
    const userPrompt = [
      `实体类型（type）：${type.trim()}`,
      `模式：${isEnrich ? 'enrich（在已有卡片基础上丰富扩写）' : 'create（从零创作）'}`,
      isEnrich ? `\n【已有卡片内容】\n${existingCard!.trim()}` : '',
      `\n【用户描述/指令】\n${instruction.trim()}`,
      '\n请按输出格式生成单个 JSON 对象。',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      const full = await collectText({ baseURL, apiKey, model }, GENERATE_CARD_SYSTEM_PROMPT, userPrompt)
      let card: unknown
      try {
        card = JSON.parse(stripJsonFence(full))
      } catch (e) {
        reply.status(502).send({ error: `生成结果解析失败：${e instanceof Error ? e.message : String(e)}`, raw: full.slice(0, 500) })
        return
      }
      reply.send({ card })
    } catch (e) {
      reply.status(502).send({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  // M2 设定卡片 · AI 直接生成（SSE 流式）——支持前端的实时输出+停止
  app.post('/api/llm/generate-card-stream', async (req, reply) => {
    const { baseURL, apiKey, model, type, instruction, mode, existingCard } = (req.body ?? {}) as GenerateCardBody
    if (!baseURL || !model || !type?.trim() || !instruction?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / type / instruction' })
      return
    }
    const isEnrich = mode === 'enrich' && existingCard?.trim()
    const userPrompt = [
      `实体类型（type）：${type.trim()}`,
      `模式：${isEnrich ? 'enrich（在已有卡片基础上丰富扩写）' : 'create（从零创作）'}`,
      isEnrich ? `\n【已有卡片内容】\n${existingCard!.trim()}` : '',
      `\n【用户描述/指令】\n${instruction.trim()}`,
      '\n请按输出格式生成单个 JSON 对象。',
    ]
      .filter(Boolean)
      .join('\n')

    const { raw, send, ac } = hijackSSE(reply)
    chatStream(
      { baseURL, apiKey, model, messages: [{ role: 'system', content: GENERATE_CARD_SYSTEM_PROMPT }, { role: 'user', content: userPrompt }], signal: ac.signal },
      (delta) => send('delta', { delta }),
    )
      .then((full) => {
        try {
          const card = JSON.parse(stripJsonFence(full))
          send('done', { card })
        } catch (e) {
          send('error', { message: `生成结果解析失败：${e instanceof Error ? e.message : String(e)}`, raw: full.slice(0, 500) })
        }
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        send('error', { message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => raw.end())
  })

  // M2 设定卡片 · 批量生图提示词生成——非流式 JSON 响应
  app.post('/api/llm/card-image-prompts', async (req, reply) => {
    const { baseURL, apiKey, model, cardDescription, intent, count } = (req.body ?? {}) as CardImagePromptsBody
    if (!baseURL || !model || !cardDescription?.trim() || !intent?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / cardDescription / intent' })
      return
    }
    const n = typeof count === 'number' && count > 0 ? Math.min(count, 30) : 6
    const userPrompt = [
      `【卡片描述】\n${cardDescription.trim()}`,
      `\n【用户意图】\n${intent.trim()}`,
      `\n需要的提示词数量（count）：${n}`,
      '\n请按输出格式生成 JSON 对象，prompts 数组长度必须等于 count。',
    ].join('\n')

    try {
      const full = await collectText({ baseURL, apiKey, model }, CARD_IMAGE_PROMPTS_SYSTEM_PROMPT, userPrompt)
      let parsed: { prompts?: Array<{ label?: string; prompt?: string }> }
      try {
        parsed = JSON.parse(stripJsonFence(full)) as { prompts?: Array<{ label?: string; prompt?: string }> }
      } catch (e) {
        reply.status(502).send({ error: `提示词解析失败：${e instanceof Error ? e.message : String(e)}`, raw: full.slice(0, 500) })
        return
      }
      const prompts = (parsed.prompts ?? [])
        .filter((p) => p && typeof p.prompt === 'string' && p.prompt.trim())
        .map((p) => ({ label: (p.label ?? '').trim(), prompt: p.prompt!.trim() }))
      reply.send({ prompts })
    } catch (e) {
      reply.status(502).send({ error: e instanceof Error ? e.message : String(e) })
    }
  })
}
