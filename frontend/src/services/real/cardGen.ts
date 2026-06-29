// M2 设定卡片 · AI 生成服务层——经后端 /api/llm/generate-card 与 /api/llm/card-image-prompts 调用。
// 节点由调用方从节点池选定后传入（面板内选择器，非模块映射）。

import type { EntityCard, EntityType, ResolvedProviderNode } from '../types'
import { parseSSE } from '../sse'

/** 选中节点里取连通所需的最小字段。 */
type NodeLike = Pick<ResolvedProviderNode, 'baseURL' | 'apiKey' | 'model'>

export interface GenerateCardArgs {
  type: EntityType
  /** 用户描述指令（可空=按类型随机生成） */
  instruction: string
  /** 模式：新建 / 在已有卡片基础上丰富 */
  mode: 'create' | 'enrich'
  /** enrich 模式下的已有卡片内容（序列化文本） */
  existingCard?: string
  /** 系统提示词覆盖（按类型，空=用后端默认） */
  systemPrompt?: string
}

/** AI 生成的卡片字段（对齐 EntityCard 的可编辑子集）。 */
export interface GeneratedCard {
  name: string
  aliases: string[]
  description: string
  fields: Record<string, string>
  styleNote?: string
  styleExamples?: string[]
}

/** 单条生图提示词。 */
export interface ImagePromptItem {
  label: string
  prompt: string
}

/** 调 /api/llm/generate-card，返回结构化卡片字段。 */
export async function generateCard(node: NodeLike, args: GenerateCardArgs): Promise<GeneratedCard> {
  const res = await fetch('/api/llm/generate-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: node.baseURL,
      apiKey: node.apiKey,
      model: node.model,
      type: args.type,
      instruction: args.instruction,
      mode: args.mode,
      ...(args.existingCard ? { existingCard: args.existingCard } : {}),
      ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? `生成失败 HTTP ${res.status}`)
  }
  const data = (await res.json()) as { card: Partial<GeneratedCard> }
  const c = data.card ?? {}
  return {
    name: typeof c.name === 'string' ? c.name : '',
    aliases: Array.isArray(c.aliases) ? c.aliases.filter((a): a is string => typeof a === 'string') : [],
    description: typeof c.description === 'string' ? c.description : '',
    fields: c.fields && typeof c.fields === 'object' ? (c.fields as Record<string, string>) : {},
    styleNote: typeof c.styleNote === 'string' ? c.styleNote : undefined,
    styleExamples: Array.isArray(c.styleExamples)
      ? c.styleExamples.filter((s): s is string => typeof s === 'string')
      : undefined,
  }
}

/** 流式生成卡片：经 /api/llm/generate-card-stream（SSE）逐 delta 回调，结束 onDone(card)。
 *  previewBody 同步返回给调用方做 Debug 展示；signal 用于中途停止。 */
export interface StreamGenerateCardHandlers {
  /** 流式文本增量（拼接为右栏实时输出 + Debug sseChunks 累积） */
  onDelta?: (delta: string) => void
  /** 解析成功的卡片字段 */
  onDone?: (card: GeneratedCard) => void
  /** 后端回传的真实请求体（system+user 完整 messages），供 Debug actualBody 展示 */
  onMeta?: (actualBody: object) => void
}

export async function streamGenerateCard(
  node: NodeLike,
  args: GenerateCardArgs,
  handlers: StreamGenerateCardHandlers,
  signal?: AbortSignal,
): Promise<{ previewBody: object }> {
  const body = {
    baseURL: node.baseURL,
    apiKey: node.apiKey,
    model: node.model,
    type: args.type,
    instruction: args.instruction,
    mode: args.mode,
    ...(args.existingCard ? { existingCard: args.existingCard } : {}),
    ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
  }
  const res = await fetch('/api/llm/generate-card-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`生成失败 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  if (!res.body) throw new Error('响应无 body')

  for await (const { event, data } of parseSSE(res.body)) {
    const parsed = data as Record<string, unknown>
    if (event === 'delta') handlers.onDelta?.(String(parsed.delta ?? ''))
    else if (event === 'meta') handlers.onMeta?.((parsed.actualBody ?? {}) as object)
    else if (event === 'done') {
      const c = (parsed.card ?? {}) as Partial<GeneratedCard>
      handlers.onDone?.({
        name: typeof c.name === 'string' ? c.name : '',
        aliases: Array.isArray(c.aliases) ? c.aliases.filter((a): a is string => typeof a === 'string') : [],
        description: typeof c.description === 'string' ? c.description : '',
        fields: c.fields && typeof c.fields === 'object' ? (c.fields as Record<string, string>) : {},
        styleNote: typeof c.styleNote === 'string' ? c.styleNote : undefined,
        styleExamples: Array.isArray(c.styleExamples)
          ? c.styleExamples.filter((s): s is string => typeof s === 'string')
          : undefined,
      })
    } else if (event === 'error') throw new Error((parsed.message as string) ?? '生成失败')
  }
  return { previewBody: body }
}

/** 把一张卡片序列化为可读文本，供 enrich 模式喂回 LLM。 */
export function serializeCardForEnrich(card: Pick<EntityCard, 'name' | 'aliases' | 'description' | 'fields' | 'styleNote' | 'styleExamples'>): string {
  const lines = [
    `名称：${card.name}`,
    card.aliases.length ? `别名：${card.aliases.join('、')}` : '',
    `描述：${card.description}`,
    ...Object.entries(card.fields).map(([k, v]) => `${k}：${v}`),
    card.styleNote ? `语言风格：${card.styleNote}` : '',
    card.styleExamples?.length ? `台词例句：\n${card.styleExamples.map((e) => `- ${e}`).join('\n')}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export interface CardImagePromptsArgs {
  cardDescription: string
  intent: string
  count: number
  systemPrompt?: string
}

/** 调 /api/llm/card-image-prompts，返回一组生图提示词。 */
export async function generateCardImagePrompts(node: NodeLike, args: CardImagePromptsArgs): Promise<ImagePromptItem[]> {
  const res = await fetch('/api/llm/card-image-prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: node.baseURL,
      apiKey: node.apiKey,
      model: node.model,
      cardDescription: args.cardDescription,
      intent: args.intent,
      count: args.count,
      ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? `提示词生成失败 HTTP ${res.status}`)
  }
  const data = (await res.json()) as { prompts: ImagePromptItem[] }
  return Array.isArray(data.prompts) ? data.prompts : []
}

/** 把 LLM 返回的卡片对象规整为 GeneratedCard（容错缺字段）。 */
function normalizeGenerated(c: Partial<GeneratedCard>): GeneratedCard {
  return {
    name: typeof c.name === 'string' ? c.name : '',
    aliases: Array.isArray(c.aliases) ? c.aliases.filter((a): a is string => typeof a === 'string') : [],
    description: typeof c.description === 'string' ? c.description : '',
    fields: c.fields && typeof c.fields === 'object' ? (c.fields as Record<string, string>) : {},
    styleNote: typeof c.styleNote === 'string' ? c.styleNote : undefined,
    styleExamples: Array.isArray(c.styleExamples)
      ? c.styleExamples.filter((s): s is string => typeof s === 'string')
      : undefined,
  }
}

/** 批量生成 · 单条侧写。 */
export interface CardProfile {
  name: string
  brief: string
}

/** 批量生成第一步：根据数量+要求生成一组简短侧写（/api/llm/card-profiles）。 */
export async function generateCardProfiles(
  node: NodeLike,
  args: { type: EntityType; count: number; instruction: string; systemPrompt?: string },
): Promise<CardProfile[]> {
  const res = await fetch('/api/llm/card-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: node.baseURL,
      apiKey: node.apiKey,
      model: node.model,
      type: args.type,
      count: args.count,
      instruction: args.instruction,
      ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? `侧写生成失败 HTTP ${res.status}`)
  }
  const data = (await res.json()) as { profiles?: CardProfile[] }
  return Array.isArray(data.profiles) ? data.profiles : []
}

/** 批量生成第二步：一次请求把一批侧写扩写为完整卡片（/api/llm/generate-cards-batch）。 */
export async function generateCardsBatch(
  node: NodeLike,
  args: { type: EntityType; profiles: CardProfile[]; instruction: string; systemPrompt?: string },
  signal?: AbortSignal,
): Promise<{ cards: GeneratedCard[]; actualBody: object | null }> {
  const res = await fetch('/api/llm/generate-cards-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: node.baseURL,
      apiKey: node.apiKey,
      model: node.model,
      type: args.type,
      profiles: args.profiles,
      instruction: args.instruction,
      ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
    }),
    signal,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? `批量生成失败 HTTP ${res.status}`)
  }
  const data = (await res.json()) as { cards?: Partial<GeneratedCard>[]; actualBody?: object }
  return {
    cards: Array.isArray(data.cards) ? data.cards.map(normalizeGenerated) : [],
    actualBody: data.actualBody ?? null,
  }
}
