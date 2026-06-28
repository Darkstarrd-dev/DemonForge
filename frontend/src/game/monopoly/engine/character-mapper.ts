import type { EntityCard } from '../../../services/types'
import type { MonopolyCharacter } from '../types'

const COLORS = [
  '#E74C3C', '#3498DB', '#27AE60', '#F39C12',
  '#9B59B6', '#16A085', '#E67E22', '#1ABC9C',
  '#2ECC71', '#E91E63', '#00BCD4', '#FF5722',
]

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

export function mapEntityCardToCharacter(card: EntityCard): MonopolyCharacter {
  const persona = [card.description, card.styleNote ? `语言风格：${card.styleNote}` : '']
    .filter(Boolean)
    .join('\n')

  return {
    id: card.id,
    name: card.name,
    persona,
    color: hashColor(card.name),
    avatarAssetRef: card.coverImageId ? { spriteId: card.coverImageId } : undefined,
  }
}
