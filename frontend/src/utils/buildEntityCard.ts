// 把一份 AI 生成/编辑的卡片草稿组装为入库的 EntityCard（单卡保存与批量保存共用字段规则）。
import type { EntityCard, EntityType } from '../services/types'
import { genId } from '../store/appStore'

export interface CardDraft {
  name: string
  aliases?: string[]
  description?: string
  fields?: Record<string, string>
  styleNote?: string
  styleExamples?: string[]
}

/** 由草稿 + 类型 + 归属书构造 EntityCard。styleNote/styleExamples 仅 character 保留。 */
export function buildEntityCard(draft: CardDraft, type: EntityType, bookId: string): EntityCard {
  const now = new Date().toISOString()
  return {
    id: genId('card'),
    bookId,
    type,
    name: draft.name.trim(),
    aliases: draft.aliases ?? [],
    description: (draft.description ?? '').trim(),
    fields: draft.fields ?? {},
    ...(type === 'character' && draft.styleNote?.trim() ? { styleNote: draft.styleNote.trim() } : {}),
    ...(type === 'character' && draft.styleExamples?.length
      ? { styleExamples: draft.styleExamples.map((s) => s.trim()).filter(Boolean) }
      : {}),
    refs: [],
    images: [],
    updatedAt: now,
  }
}
