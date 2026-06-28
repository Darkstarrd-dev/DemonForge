// 骰子核心类 —— DiceRoller
// 纯 TS，零渲染依赖（不 import React/Phaser/Three）。
// 与 monopoly/engine.ts 的 rollDice 设计一致：
//   随机源独立于渲染/规则，结果通过参数传入，保持调用方纯函数性。
// 随机数来源：浏览器原生 Web Crypto API（crypto.getRandomValues）。

import type { DiceRollConfig, DiceRollResult, DiceSideValue, RollHistoryEntry } from './types'

// ════════════════════════════════════════════
// 合法面数集合
// ════════════════════════════════════════════

const VALID_SIDES = new Set([6, 8, 10, 12, 20])

// ════════════════════════════════════════════
// DiceRoller
// ════════════════════════════════════════════

export class DiceRoller {
  private history: RollHistoryEntry[] = []

  // ══════════════════════════════════════════
  // 校验
  // ══════════════════════════════════════════

  private validate(config: DiceRollConfig): void {
    if (config.count < 1 || !Number.isInteger(config.count)) {
      throw new Error(`骰子数量无效: ${config.count}（须 ≥1 的整数）`)
    }
    if (!VALID_SIDES.has(config.sides)) {
      throw new Error(`不支持的骰子面数: ${config.sides}（支持 6/8/10/12/20）`)
    }
    if (config.presetValues !== undefined) {
      if (config.presetValues.length !== config.count) {
        throw new Error(
          `预设值数量 ${config.presetValues.length} 与骰子数量 ${config.count} 不匹配`
        )
      }
      for (const v of config.presetValues) {
        if (v < 1 || v > config.sides || !Number.isInteger(v)) {
          throw new Error(
            `预设值 ${v} 超出范围 [1, ${config.sides}] 或非整数`
          )
        }
      }
    }
  }

  // ══════════════════════════════════════════
  // 随机数生成（Web Crypto API，32 位范围远大于面数，模偏倚可忽略）
  // ══════════════════════════════════════════

  private randomInt(min: number, max: number): number {
    const buf = new Uint32Array(1)
    window.crypto.getRandomValues(buf)
    return min + (buf[0] % (max - min + 1))
  }

  // ══════════════════════════════════════════
  // 投掷
  // ══════════════════════════════════════════

  roll(config: DiceRollConfig): DiceRollResult {
    this.validate(config)

    const values = config.presetValues
      ? config.presetValues.slice()
      : Array.from({ length: config.count }, () => this.randomInt(1, config.sides))

    const total = values.reduce((a, b) => a + b, 0)
    const notation = `${config.count}d${config.sides}`
    const timestamp = Date.now()
    const preset = !!config.presetValues

    const result: DiceRollResult = {
      notation,
      sides: config.sides,
      values,
      total,
      timestamp,
      preset,
    }

    this.history.push(result)
    return result
  }

  rollMany(count: number, sides: DiceSideValue, presetValues?: number[]): DiceRollResult {
    return this.roll({ count, sides, presetValues })
  }

  // ══════════════════════════════════════════
  // 记法解析
  // ══════════════════════════════════════════

  parseNotation(notation: string): { count: number; sides: number } {
    const m = /^(\d+)d(\d+)$/.exec(notation)
    if (!m) {
      throw new Error(`记法解析失败: "${notation}"（正确格式: NdM，如 2d6）`)
    }
    const count = parseInt(m[1], 10)
    const sides = parseInt(m[2], 10)
    if (!VALID_SIDES.has(sides)) {
      throw new Error(`记法解析失败: "${notation}"（面数 ${sides} 不支持，支持 6/8/10/12/20）`)
    }
    return { count, sides }
  }

  // ══════════════════════════════════════════
  // 历史记录
  // ══════════════════════════════════════════

  getHistory(): RollHistoryEntry[] {
    return this.history.slice()
  }

  clearHistory(): void {
    this.history = []
  }

  // ══════════════════════════════════════════
  // 格式化
  // ══════════════════════════════════════════

  formatNotation(count: number, sides: number, values?: number[]): string {
    if (values?.length) {
      return `${count}d${sides}@${values.join(',')}`
    }
    return `${count}d${sides}`
  }
}