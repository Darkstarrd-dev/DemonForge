// 创作类端点 · M2 设定库域（B-8 拆分）。
// extract-entities（批量章节提取+向量化+合并候选）/ generate-card（AI 直接生成·非流式）/
// generate-card-stream（AI 直接生成·SSE 流式）/ card-image-prompts（批量生图提示词）。
import type { FastifyInstance } from 'fastify'
import { chatStream, embed, type ProviderConfig } from '../llmClient'
import {
  EXTRACT_ENTITIES_SYSTEM_PROMPT,
  GENERATE_CARD_SYSTEM_PROMPT,
  CARD_IMAGE_PROMPTS_SYSTEM_PROMPT,
  GENERATE_CARD_PROFILES_SYSTEM_PROMPT,
  GENERATE_CARDS_BATCH_SYSTEM_PROMPT,
} from '../prompts'
import { hijackSSE } from '../utils/sseHelper'
import { stripJsonFence, collectText } from './creation.shared'

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
  /** 用户描述指令（可空=按类型随机生成） */
  instruction?: string
  /** 模式：新建 / 在已有卡片基础上丰富 */
  mode?: 'create' | 'enrich'
  /** enrich 模式下的已有卡片内容（JSON 字符串或对象的描述） */
  existingCard?: string
  /** 系统提示词覆盖（按类型，前端从 m2CardGenPromptByType[type] 取；空=用默认） */
  systemPrompt?: string
}
type CardImagePromptsBody = ProviderConfig & {
  /** 卡片描述（人物/场景/道具设定） */
  cardDescription: string
  /** 用户意图，如「8 个表情差分」 */
  intent: string
  /** 需要的提示词数量 */
  count?: number
}
type CardProfilesBody = ProviderConfig & {
  /** 实体类型 */
  type: string
  /** 需要的侧写数量 */
  count?: number
  /** 整体要求/主题（可空） */
  instruction?: string
}
type GenerateCardsBatchBody = ProviderConfig & {
  /** 实体类型 */
  type: string
  /** 侧写列表（一次请求扩写这一批） */
  profiles: { name: string; brief: string }[]
  /** 整体要求/主题（可空） */
  instruction?: string
}

/** 构造卡片生成的 user prompt；instruction 为空时走「按类型随机自由创作」。 */
function buildCardUserPrompt(type: string, isEnrich: boolean, existingCard: string | undefined, instruction: string): string {
  const hasInstruction = !!instruction.trim()
  return [
    `实体类型（type）：${type.trim()}`,
    `模式：${isEnrich ? 'enrich（在已有卡片基础上丰富扩写）' : 'create（从零创作）'}`,
    isEnrich ? `\n【已有卡片内容】\n${existingCard!.trim()}` : '',
    hasInstruction
      ? `\n【用户描述/指令】\n${instruction.trim()}`
      : '\n【用户描述/指令】\n（用户未提供具体描述）请自由随机创作一个该类型的设定：自行决定全部细节（姓名/外貌/性格/能力/背景等），追求新颖、有记忆点、避免俗套与雷同。',
    '\n请按输出格式生成单个 JSON 对象。',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function m2Routes(app: FastifyInstance) {
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
    const { baseURL, apiKey, model, type, instruction, mode, existingCard, systemPrompt } = (req.body ?? {}) as GenerateCardBody
    if (!baseURL || !model || !type?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / type' })
      return
    }
    const isEnrich = !!(mode === 'enrich' && existingCard?.trim())
    const userPrompt = buildCardUserPrompt(type, isEnrich, existingCard, instruction ?? '')
    const sys = systemPrompt?.trim() || GENERATE_CARD_SYSTEM_PROMPT

    try {
      const full = await collectText({ baseURL, apiKey, model }, sys, userPrompt)
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
    const { baseURL, apiKey, model, type, instruction, mode, existingCard, systemPrompt } = (req.body ?? {}) as GenerateCardBody
    if (!baseURL || !model || !type?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / type' })
      return
    }
    const isEnrich = !!(mode === 'enrich' && existingCard?.trim())
    const userPrompt = buildCardUserPrompt(type, isEnrich, existingCard, instruction ?? '')
    const sys = systemPrompt?.trim() || GENERATE_CARD_SYSTEM_PROMPT
    const messages: { role: 'system' | 'user'; content: string }[] = [
      { role: 'system', content: sys },
      { role: 'user', content: userPrompt },
    ]

    const { raw, send, ac } = hijackSSE(reply)
    // Debug：先回传真实提交给节点的完整请求体（system+user 完整 messages），供前端 actualBody 展示
    send('meta', { actualBody: { model, messages, stream: true } })
    chatStream(
      { baseURL, apiKey, model, messages, signal: ac.signal },
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

  // M2 设定卡片 · 返回 AI 生成的默认系统提示词（供前端「编辑提示词」回显与「重置默认」）
  app.get('/api/llm/card-gen-prompt', async (_req, reply) => {
    reply.send({ prompt: GENERATE_CARD_SYSTEM_PROMPT })
  })

  // M2 设定卡片 · 批量生成第一步：根据数量+要求生成一组简短侧写——非流式 JSON 响应
  app.post('/api/llm/card-profiles', async (req, reply) => {
    const { baseURL, apiKey, model, type, count, instruction } = (req.body ?? {}) as CardProfilesBody
    if (!baseURL || !model || !type?.trim()) {
      reply.status(400).send({ error: '缺少 baseURL / model / type' })
      return
    }
    const n = typeof count === 'number' && count > 0 ? Math.min(Math.floor(count), 50) : 5
    const userPrompt = [
      `实体类型（type）：${type.trim()}`,
      `需要的侧写数量（count）：${n}`,
      instruction?.trim()
        ? `\n【整体要求/主题】\n${instruction.trim()}`
        : '\n【整体要求/主题】\n（未提供）请自由发挥，追求新颖多样、彼此差异化。',
      `\n请按输出格式生成 JSON 对象，profiles 数组长度必须等于 ${n}。`,
    ].join('\n')

    try {
      const full = await collectText({ baseURL, apiKey, model }, GENERATE_CARD_PROFILES_SYSTEM_PROMPT, userPrompt)
      let parsed: { profiles?: Array<{ name?: string; brief?: string }> }
      try {
        parsed = JSON.parse(stripJsonFence(full)) as { profiles?: Array<{ name?: string; brief?: string }> }
      } catch (e) {
        reply.status(502).send({ error: `侧写解析失败：${e instanceof Error ? e.message : String(e)}`, raw: full.slice(0, 500) })
        return
      }
      const profiles = (parsed.profiles ?? [])
        .filter((p) => p && typeof p.name === 'string' && p.name.trim())
        .map((p) => ({ name: p.name!.trim(), brief: (p.brief ?? '').trim() }))
      reply.send({ profiles })
    } catch (e) {
      reply.status(502).send({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  // M2 设定卡片 · 批量生成第二步：一次请求把一批侧写各自扩写为完整卡片——非流式 JSON 数组响应
  app.post('/api/llm/generate-cards-batch', async (req, reply) => {
    const { baseURL, apiKey, model, type, profiles, instruction } = (req.body ?? {}) as GenerateCardsBatchBody
    if (!baseURL || !model || !type?.trim() || !Array.isArray(profiles) || profiles.length === 0) {
      reply.status(400).send({ error: '缺少 baseURL / model / type / profiles' })
      return
    }
    const profileText = profiles.map((p, i) => `${i + 1}. ${p.name}：${p.brief}`).join('\n')
    const userPrompt = [
      `实体类型（type）：${type.trim()}`,
      instruction?.trim() ? `\n【整体要求】\n${instruction.trim()}` : '',
      `\n【侧写列表（共 ${profiles.length} 条，请逐条扩写、顺序一致）】\n${profileText}`,
      `\n请按输出格式生成 JSON 数组，长度必须等于 ${profiles.length}。`,
    ]
      .filter(Boolean)
      .join('\n')
    const messages = [
      { role: 'system' as const, content: GENERATE_CARDS_BATCH_SYSTEM_PROMPT },
      { role: 'user' as const, content: userPrompt },
    ]

    try {
      const full = await collectText({ baseURL, apiKey, model }, GENERATE_CARDS_BATCH_SYSTEM_PROMPT, userPrompt)
      let cards: unknown
      try {
        cards = JSON.parse(stripJsonFence(full))
      } catch (e) {
        reply.status(502).send({ error: `批量结果解析失败：${e instanceof Error ? e.message : String(e)}`, raw: full.slice(0, 800) })
        return
      }
      if (!Array.isArray(cards)) {
        reply.status(502).send({ error: '批量结果不是 JSON 数组', raw: full.slice(0, 500) })
        return
      }
      reply.send({ cards, actualBody: { model, messages, stream: false } })
    } catch (e) {
      reply.status(502).send({ error: e instanceof Error ? e.message : String(e) })
    }
  })
}
