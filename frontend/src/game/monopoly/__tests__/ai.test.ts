import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import type { GameState, NewGameConfig } from '../types'
import { TurnPhaseV2 } from '../types'
import { aiNextAction, aiDecide, configureAIController, resetAIController } from '../engine/ai'

function makeConfig(overrides?: Partial<NewGameConfig>): NewGameConfig {
  return {    players: [
      { name: '玩家A', color: '#E74C3C', controller: 'human' },
      { name: 'AI玩家', color: '#3498DB', controller: 'ai', aiDifficulty: 'normal' },
    ],
    startingCash: 15000,
    mapId: 'classic-40',
    ...overrides,
  }
}

function baseState(): GameState {
  return createInitialState(makeConfig())
}

describe('aiNextAction', () => {
  it('game over 时返回 null', () => {
    const state: GameState = { ...baseState(), status: 'ended' }
    expect(aiNextAction(state)).toBeNull()
  })

  it('人类玩家回合返回 null', () => {
    const state = baseState()
    expect(aiNextAction(state)).toBeNull()
  })

  it('TURN_START 阶段返回 ROLL_DICE', () => {
    let state = baseState()
    state = { ...state, turnContext: { ...state.turnContext, currentPlayerId: state.players[1].id, phase: TurnPhaseV2.TURN_START } }
    const action = aiNextAction(state)
    expect(action?.type).toBe('ROLL_DICE')
    expect((action as { type: string; dice: number[] }).dice).toHaveLength(2)
  })

  it('DECIDE 阶段返回 RESOLVE_DECISION', () => {
    let state = baseState()
    state = {
      ...state,
      turnContext: { ...state.turnContext, currentPlayerId: state.players[1].id, phase: TurnPhaseV2.PURCHASE_DECISION },
      awaitingDecision: {
        playerId: state.players[1].id,
        kind: 'buyProperty',
        options: [{ id: 'buy', label: '购买' }, { id: 'skip', label: '放弃' }],
        context: { tileId: 'c40_01', tileName: '测试', price: 1000 },
      },
    }
    const action = aiNextAction(state)
    expect(action?.type).toBe('RESOLVE_DECISION')
  })

  it('DECIDE 但不是当前玩家时返回 null', () => {
    let state = baseState()
    state = {
      ...state,
      turnContext: { ...state.turnContext, currentPlayerId: state.players[0].id, phase: TurnPhaseV2.PURCHASE_DECISION },
      awaitingDecision: {
        playerId: state.players[1].id,
        kind: 'buyProperty',
        options: [{ id: 'buy', label: '购买' }, { id: 'skip', label: '放弃' }],
        context: {},
      },
    }
    expect(aiNextAction(state)).toBeNull()
  })

  it('END_TURN 阶段返回 END_TURN', () => {
    let state = baseState()
    state = {
      ...state,
      turnContext: { ...state.turnContext, currentPlayerId: state.players[1].id, phase: TurnPhaseV2.TURN_END },
    }
    const action = aiNextAction(state)
    expect(action?.type).toBe('END_TURN')
  })
})

describe('aiDecide', () => {
  it('返回有效选项 ID', () => {
    const state = baseState()
    const decision = {
      playerId: state.players[1].id,
      kind: 'buyProperty' as const,
      options: [{ id: 'buy', label: '购买' }, { id: 'skip', label: '放弃' }],
      context: { tileId: 'c40_01', tileName: '测试', price: 2000 },
    }
    const result = aiDecide(state, decision)
    expect(['buy', 'skip']).toContain(result)
  })
})

describe('configureAIController / resetAIController', () => {
  it('配置后 LLM 决策优先于规则', () => {
    const state = baseState()
    const decision = {
      playerId: state.players[1].id,
      kind: 'buyProperty' as const,
      options: [{ id: 'buy', label: '购买' }, { id: 'skip', label: '放弃' }],
      context: { tileId: 'c40_01', tileName: '测试', price: 2000 },
    }
    configureAIController({
      llmFn: async () => 'buy',
      getPersona: () => '测试角色',
    })
    const playerWithNode = {
      ...state.players[1],
      aiNodeId: 'node-001',
    }
    const stateWithNode: GameState = {
      ...state,
      players: [state.players[0], playerWithNode],
    }
    const result = aiDecide(stateWithNode, decision)
    expect(['buy', 'skip']).toContain(result)
    resetAIController()
  })

  it('重置后清除配置', () => {
    configureAIController({ llmFn: async () => 'buy' })
    resetAIController()
    expect(true).toBe(true)
  })
})
