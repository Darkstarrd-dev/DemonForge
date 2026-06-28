// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { DiceRoller } from '../DiceRoller'

// jsdom 可能无 window.crypto，mock 兜底
if (!globalThis.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- crypto mock 测试环境必须
  ;(globalThis as any).crypto = {
    getRandomValues(arr: Uint32Array) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256)
      }
      return arr
    },
  }
}

describe('DiceRoller.validate', () => {
  let roller: DiceRoller
  beforeEach(() => { roller = new DiceRoller() })

  it('count < 1 抛错', () => {
    expect(() => roller.roll({ count: 0, sides: 6 })).toThrow(/数量无效/)
  })

  it('sides 不在合法集合中抛错', () => {
    expect(() => roller.roll({ count: 1, sides: 7 as never })).toThrow(/不支持/)
  })

  it('presetValues 长度不等于 count 抛错', () => {
    expect(() => roller.roll({ count: 2, sides: 6, presetValues: [1] })).toThrow(/不匹配/)
  })

  it('presetValues 值超出范围抛错', () => {
    expect(() => roller.roll({ count: 1, sides: 6, presetValues: [7] })).toThrow(/超出范围/)
  })

  it('合法配置不抛错', () => {
    expect(() => roller.roll({ count: 2, sides: 6 })).not.toThrow()
  })
})

describe('DiceRoller.roll', () => {
  let roller: DiceRoller
  beforeEach(() => { roller = new DiceRoller() })

  it('roll({count:2,sides:6}) 返回正确 values 和 total', () => {
    const result = roller.roll({ count: 2, sides: 6 })
    expect(result.values).toHaveLength(2)
    expect(result.values[0]).toBeGreaterThanOrEqual(1)
    expect(result.values[0]).toBeLessThanOrEqual(6)
    expect(result.values[1]).toBeGreaterThanOrEqual(1)
    expect(result.values[1]).toBeLessThanOrEqual(6)
    expect(result.total).toBe(result.values[0] + result.values[1])
    expect(result.preset).toBe(false)
    expect(result.notation).toBe('2d6')
    expect(result.sides).toBe(6)
  })

  it('roll({count:1,sides:20,presetValues:[17]}) 返回预设值', () => {
    const result = roller.roll({ count: 1, sides: 20, presetValues: [17] })
    expect(result.values).toEqual([17])
    expect(result.total).toBe(17)
    expect(result.preset).toBe(true)
  })

  it('roll({count:3,sides:10}) 返回 3 个值且均在 1-10', () => {
    const result = roller.roll({ count: 3, sides: 10 })
    expect(result.values).toHaveLength(3)
    for (const v of result.values) {
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(10)
    }
  })

  it('rollMany 与 roll 行为一致', () => {
    roller.clearHistory()
    const r2 = roller.rollMany(3, 8)
    // 两结果类型结构一致（随机值可能不同）
    expect(r2.values).toHaveLength(3)
    expect(r2.notation).toBe('3d8')
    expect(r2.sides).toBe(8)
  })
})

describe('DiceRoller.parseNotation', () => {
  let roller: DiceRoller
  beforeEach(() => { roller = new DiceRoller() })

  it("'2d6' → {count:2, sides:6}", () => {
    const { count, sides } = roller.parseNotation('2d6')
    expect(count).toBe(2)
    expect(sides).toBe(6)
  })

  it("'1d20' → {count:1, sides:20}", () => {
    const { count, sides } = roller.parseNotation('1d20')
    expect(count).toBe(1)
    expect(sides).toBe(20)
  })

  it("'abc' 抛错", () => {
    expect(() => roller.parseNotation('abc')).toThrow(/解析失败/)
  })

  it("'2d7' 抛错（7 不支持）", () => {
    expect(() => roller.parseNotation('2d7')).toThrow(/不支持/)
  })
})

describe('DiceRoller.history', () => {
  let roller: DiceRoller
  beforeEach(() => { roller = new DiceRoller() })

  it('getHistory 返回副本（修改不影响内部）', () => {
    roller.roll({ count: 1, sides: 6 })
    const history = roller.getHistory()
    history.pop()
    expect(roller.getHistory()).toHaveLength(1)
  })

  it('clearHistory 后为空', () => {
    roller.roll({ count: 1, sides: 6 })
    roller.roll({ count: 2, sides: 20 })
    expect(roller.getHistory()).toHaveLength(2)
    roller.clearHistory()
    expect(roller.getHistory()).toHaveLength(0)
  })

  it('history 记录每次投掷', () => {
    roller.roll({ count: 1, sides: 6 })
    roller.rollMany(2, 12)
    const h = roller.getHistory()
    expect(h).toHaveLength(2)
    expect(h[0].notation).toBe('1d6')
    expect(h[1].notation).toBe('2d12')
  })
})

describe('DiceRoller.formatNotation', () => {
  let roller: DiceRoller
  beforeEach(() => { roller = new DiceRoller() })

  it('无 values 返回 NdM', () => {
    expect(roller.formatNotation(2, 6)).toBe('2d6')
  })

  it('有 values 返回 NdM@v1,v2,...', () => {
    expect(roller.formatNotation(2, 6, [3, 5])).toBe('2d6@3,5')
  })
})