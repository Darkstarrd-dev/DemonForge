// M2 设定卡片 · AI 生成服务层——经后端 /api/llm/generate-card 与 /api/llm/card-image-prompts 调用。
// 节点由调用方从节点池选定后传入（面板内选择器，非模块映射）。

import type { EntityCard, EntityType, ProviderNode } from '../types'

/** 选中节点里取连通所需的最小字段。 */
type NodeLike = Pick<ProviderNode, 'baseURL' | 'apiKey' | 'model'>

export interface GenerateCardArgs {
  type: EntityType
  /** 用户描述指令 */
  instruction: string
  /** 模式：新建 / 在已有卡片基础上丰富 */
  mode: 'create' | 'enrich'
  /** enrich 模式下的已有卡片内容（序列化文本） */
  existingCard?: string
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
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? `提示词生成失败 HTTP ${res.status}`)
  }
  const data = (await res.json()) as { prompts: ImagePromptItem[] }
  return Array.isArray(data.prompts) ? data.prompts : []
}
