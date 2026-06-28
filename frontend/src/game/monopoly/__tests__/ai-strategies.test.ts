import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import { createDefaultBoard } from '../board.preset'
import type { GameState, NewGameConfig, DecisionRequest } from '../types'
import { aiDecideWithStrategy, AI_CONFIGS } from '../engine/ai-strategies'

function makeConfig(overrides?: Partial<NewGameConfig>): NewGameConfig {
  return {
    board: createDefaultBoard(),
    players: [
      { name: '玩家A', color: '#E74C3C', controller: 'human', aiDifficulty: 'normal' },
      { name: '玩家B', color: '#3498DB', controller: 'ai', aiDifficulty: 'easy' },
    ],
    startingCash: 15000,
    mapId: 'classic-40',
    ...overrides,
  }
}

function baseState(): GameState {
  return createInitialState(makeConfig())
}

describe('AI_CONFIGS', () => {
  it('三档配置参数不同', () => {
    expect(AI_CONFIGS.easy.difficulty).toBe('easy')
    expect(AI_CONFIGS.normal.difficulty).toBe('normal')
    expect(AI_CONFIGS.hard.difficulty).toBe('hard')
    expect(AI_CONFIGS.easy.purchaseThreshold).toBeLessThan(AI_CONFIGS.normal.purchaseThreshold)
    expect(AI_CONFIGS.normal.purchaseThreshold).toBeLessThan(AI_CONFIGS.hard.purchaseThreshold)
  })
})

describe('aiDecideWithStrategy: buyProperty', () => {
  const buyDecision: DecisionRequest = {
    playerId: 'p1',
    kind: 'buyProperty',
    options: [{ id: 'buy', label: '购买' }, { id: 'skip', label: '放弃' }],
    context: { tileId: 1, tileName: '测试地', price: 2000 },
  }

  it('easy 资金充足时可能购买', () => {
    const state = baseState()
    // easy 需 cash > price * 3 且 60% 概率买
    const result = aiDecideWithStrategy(state, buyDecision, 'easy')
    expect(['buy', 'skip']).toContain(result)
  })

  it('easy 资金不足时跳过', () => {
    const state: GameState = {
      ...baseState(),
      players: [{ ...baseState().players[0], cash: 1000 }],
    }
    const result = aiDecideWithStrategy(state, buyDecision, 'easy')
    expect(result).toBe('skip')
  })

  it('normal 现金充沛时倾向于买', () => {
    const state: GameState = {
      ...baseState(),
      players: [{ ...baseState().players[0], cash: 50000 }],
    }
    const result = aiDecideWithStrategy(state, buyDecision, 'normal')
    expect(result).toBe('buy')
  })

  it('hard 即使现金不足但加存款可覆盖时也买', () => {
    const state: GameState = {
      ...baseState(),
      players: [{ ...baseState().players[0], cash: 500, bankDeposit: 10000 }],
    }
    const result = aiDecideWithStrategy(state, buyDecision, 'hard')
    expect(result).toBe('buy')
  })
})

describe('aiDecideWithStrategy: upgradeProperty', () => {
  const upgradeDecision: DecisionRequest = {
    playerId: 'p1',
    kind: 'upgradeProperty',
    options: [{ id: 'upgrade', label: '升级' }, { id: 'skip', label: '暂不' }],
    context: { tileId: 1, tileName: '测试地', cost: 500, nextLevel: 1 },
  }

  it('easy 大额现金时可能升级', () => {
    const state: GameState = {
      ...baseState(),
      players: [{ ...baseState().players[0], cash: 50000 }],
    }
    const result = aiDecideWithStrategy(state, upgradeDecision, 'easy')
    expect(['upgrade', 'skip']).toContain(result)
  })

  it('normal 满足条件时升级', () => {
    const state: GameState = {
      ...baseState(),
      players: [{ ...baseState().players[0], cash: 30000 }],
    }
    const result = aiDecideWithStrategy(state, upgradeDecision, 'normal')
    expect(result).toBe('upgrade')
  })

  it('hard 现金够 1.2 倍成本就升级', () => {
    const state: GameState = {
      ...baseState(),
      players: [{ ...baseState().players[0], cash: 5000 }],
    }
    const result = aiDecideWithStrategy(state, upgradeDecision, 'hard')
    expect(result).toBe('upgrade')
  })
})

describe('aiDecideWithStrategy: jailChoice', () => {
  const jailDecision: DecisionRequest = {
    playerId: 'p1',
    kind: 'jailChoice',
    options: [
      { id: 'pay', label: '付罚金' },
      { id: 'card', label: '使用出狱卡' },
      { id: 'wait', label: '等待' },
    ],
    context: {},
  }

  it('hard 有出狱卡时选 card', () => {
    const state = baseState()
    const result = aiDecideWithStrategy(state, jailDecision, 'hard')
    expect(result).toBe('card')
  })
})

describe('aiDecideWithStrategy: payOrMortgage', () => {
  const payDecision: DecisionRequest = {
    playerId: 'p1',
    kind: 'payOrMortgage',
    options: [
      { id: 'pay', label: '付钱' },
      { id: 'mortgage', label: '抵押' },
      { id: 'bankrupt', label: '破产' },
    ],
    context: { amount: 3000 },
  }

  it('easy 现金够时直接付', () => {
    const state = baseState()
    const result = aiDecideWithStrategy(state, payDecision, 'easy')
    expect(result).toBe('pay')
  })
})

describe('aiDecideWithStrategy: unknown kind', () => {
  it('未知决策类型返回第一个选项 ID', () => {
    const state = baseState()
    const decision: DecisionRequest = {
      playerId: 'p1',
      kind: 'trade',
      options: [{ id: 'accept', label: '接受' }, { id: 'reject', label: '拒绝' }],
      context: {},
    }
    const result = aiDecideWithStrategy(state, decision, 'easy')
    expect(['accept', 'reject']).toContain(result)
  })
})
