// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { DICE_FACE_DEFS, createDiceGeometry } from '../geometry'

describe('DICE_FACE_DEFS', () => {
  it('面数正确', () => {
    expect(DICE_FACE_DEFS[6]).toHaveLength(6)
    expect(DICE_FACE_DEFS[8]).toHaveLength(8)
    expect(DICE_FACE_DEFS[10]).toHaveLength(10)
    expect(DICE_FACE_DEFS[12]).toHaveLength(12)
    expect(DICE_FACE_DEFS[20]).toHaveLength(20)
  })

  it('d6 对面之和=7', () => {
    const defs = DICE_FACE_DEFS[6]
    const checked = new Set<number>()
    for (const def of defs) {
      if (checked.has(def.faceValue)) continue
      const opposite = def.normal.clone().negate()
      let bestValue = 0
      let bestDot = -Infinity
      for (const other of defs) {
        if (other.faceValue === def.faceValue) continue
        const dot = opposite.dot(other.normal)
        if (dot > bestDot) {
          bestDot = dot
          bestValue = other.faceValue
        }
      }
      expect(def.faceValue + bestValue).toBe(7)
      checked.add(def.faceValue)
      checked.add(bestValue)
    }
  })

  it('d20 对面之和=21', () => {
    const defs = DICE_FACE_DEFS[20]
    // 已知对面配对（按法向量精确相反）
    const oppositePairs = new Map<number, number>([
      [1, 20], [20, 1],
      [2, 19], [19, 2],
      [3, 18], [18, 3],
      [4, 17], [17, 4],
      [5, 16], [16, 5],
      [6, 15], [15, 6],
      [7, 14], [14, 7],
      [8, 13], [13, 8],
      [9, 12], [12, 9],
      [10, 11], [11, 10],
    ])
    for (const def of defs) {
      const opposite = oppositePairs.get(def.faceValue)!
      const oppDef = defs.find((d) => d.faceValue === opposite)!
      const dot = def.normal.clone().negate().dot(oppDef.normal)
      expect(dot).toBeGreaterThan(0.999) // 法向量精确相反
      expect(def.faceValue + oppDef.faceValue).toBe(21)
    }
  })

  it('d12 对面之和=13', () => {
    const defs = DICE_FACE_DEFS[12]
    const checked = new Set<number>()
    for (const def of defs) {
      if (checked.has(def.faceValue)) continue
      const opposite = def.normal.clone().negate()
      let bestValue = 0
      let bestDot = -Infinity
      for (const other of defs) {
        if (other.faceValue === def.faceValue) continue
        const dot = opposite.dot(other.normal)
        if (dot > bestDot) {
          bestDot = dot
          bestValue = other.faceValue
        }
      }
      expect(def.faceValue + bestValue).toBe(13)
      checked.add(def.faceValue)
      checked.add(bestValue)
    }
  })
})

describe('createDiceGeometry', () => {
  it('d6 → BoxGeometry 6 个 group', () => {
    const geo = createDiceGeometry(6, 1)
    expect(geo.groups).toHaveLength(6)
  })

  it('d10 → 10 个 group', () => {
    const geo = createDiceGeometry(10, 1)
    expect(geo.groups).toHaveLength(10)
  })

  it('d20 → 20 个 group', () => {
    const geo = createDiceGeometry(20, 1)
    expect(geo.groups).toHaveLength(20)
  })

  it('不支持的面数抛错', () => {
    expect(() => createDiceGeometry(4, 1)).toThrow(/不支持/)
  })
})