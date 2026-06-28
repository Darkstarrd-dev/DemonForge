import { describe, it, expect } from 'vitest'
import { mapEntityCardToCharacter } from '../engine/character-mapper'
import type { EntityCard } from '../../../services/types'

describe('mapEntityCardToCharacter', () => {
  const baseCard: EntityCard = {
    id: 'card-char-001',
    bookId: '',
    name: '孙小美',
    type: 'character',
    aliases: [],
    fields: {},
    description: '聪明伶俐的女孩子，擅长理财。',
    refs: [],
    updatedAt: '2026-01-01',
  }

  it('映射基本字段', () => {
    const char = mapEntityCardToCharacter(baseCard)
    expect(char.id).toBe('card-char-001')
    expect(char.name).toBe('孙小美')
    expect(char.persona).toContain('聪明伶俐')
    expect(char.color).toBeDefined()
    expect(char.avatarAssetRef).toBeUndefined()
  })

  it('含 styleNote 时并入 persona', () => {
    const card: EntityCard = { ...baseCard, styleNote: '活泼可爱，说话带~' }
    const char = mapEntityCardToCharacter(card)
    expect(char.persona).toContain('语言风格：活泼可爱')
  })

  it('含 coverImageId 时映射 avatarAssetRef', () => {
    const card: EntityCard = { ...baseCard, coverImageId: 'img_001' }
    const char = mapEntityCardToCharacter(card)
    expect(char.avatarAssetRef?.spriteId).toBe('img_001')
  })

  it('同名字生成相同颜色', () => {
    const c1 = mapEntityCardToCharacter(baseCard)
    const c2 = mapEntityCardToCharacter({ ...baseCard, id: 'card-char-002' })
    expect(c1.color).toBe(c2.color)
  })

  it('不同名字生成不同颜色', () => {
    const c1 = mapEntityCardToCharacter(baseCard)
    const c2 = mapEntityCardToCharacter({ ...baseCard, name: '阿土伯', id: 'card-char-003' })
    expect(c1.color).not.toBe(c2.color)
  })
})
