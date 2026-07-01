// 骰子模块 —— 类型定义
// 纯 TS，零渲染依赖（不得 import React/antd/Phaser/Three）。
// 与 monopoly/types.ts 设计一致：随机源独立于渲染/规则，结果通过参数传入。

// ════════════════════════════════════════════
// 骰子面数
// ════════════════════════════════════════════

export const DiceSides = {
  D6: 6,
  D8: 8,
  D10: 10,
  D12: 12,
  D20: 20,
} as const
export type DiceSides = (typeof DiceSides)[keyof typeof DiceSides]
export type DiceSideValue = 6 | 8 | 10 | 12 | 20

// ════════════════════════════════════════════
// 投掷配置与结果
// ════════════════════════════════════════════

export interface DiceRollConfig {
  count: number
  sides: DiceSideValue
  presetValues?: number[]
}

export interface DiceRollResult {
  notation: string
  sides: number
  values: number[]
  total: number
  timestamp: number
  preset: boolean
}

// ════════════════════════════════════════════
// 骰子外观主题
// ════════════════════════════════════════════

export interface DiceThemeColors {
  face: string
  pip: string
  edge: string
}

// ════════════════════════════════════════════
// 物理与动画参数
// ════════════════════════════════════════════

export interface DicePhysicsParams {
  friction: number
  restitution: number
  gravity: number
  throwForce: number
  spinForce: number
  dropHeight: number
}

export const DEFAULT_PHYSICS: DicePhysicsParams = {
  friction: 0.5,
  restitution: 0.6,
  gravity: 9.81,
  throwForce: 15,
  spinForce: 8,
  dropHeight: 8,
}

export interface DiceAnimParams {
  duration: number
}

// ════════════════════════════════════════════
// 2D 骰子模式
// ════════════════════════════════════════════

export type Dice2DMode = 'sprite' | 'matter'
export type Dice2DLayout = 'horizontal' | 'grid' | 'scatter'

export type DiceSpriteSource = 'yahtzee' | 'custom'

export interface DiceSpriteConfig {
  source: DiceSpriteSource
  atlasKey: string
  atlasPath: string
  framePrefix: string
  frameCount: number
}

// ════════════════════════════════════════════
// 历史记录
// ════════════════════════════════════════════

export type RollHistoryEntry = DiceRollResult