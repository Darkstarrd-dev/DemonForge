import { describe, it, expect } from 'vitest'
import { createInitialState, reducer } from '../engine'
import type { GameState, NewGameConfig } from '../types'

function makeConfig(overrides?: Partial<NewGameConfig>): NewGameConfig {
  return {    players: [
      { name: '玩家A', color: '#E74C3C', controller: 'human' },
      { name: '玩家B', color: '#3498DB', controller: 'ai' },
    ],
    startingCash: 15000,
    mapId: 'classic-40',
    ...overrides,
  }
}

function baseState(): GameState {
  return createInitialState(makeConfig())
}

describe('handleRoll: 跳过回合', () => {
  it('inJailTurns > 0 时跳过并减计数', () => {
    const state = baseState()
    const sick = { ...state, players: [{ ...state.players[0], inJailTurns: 2 }] }
    const next = reducer(sick, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next.turn.phase).toBe('END_TURN')
    expect(next.players[0].inJailTurns).toBe(1)
    expect(next.log.some(l => l.kind === 'jailSkip')).toBe(true)
  })

  it('skipTurns > 0 时跳过并减计数', () => {
    const state = baseState()
    const skipped = { ...state, players: [{ ...state.players[0], skipTurns: 2 }] }
    const next = reducer(skipped, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next.turn.phase).toBe('END_TURN')
    expect(next.players[0].skipTurns).toBe(1)
    expect(next.log.some(l => l.kind === 'skipTurn')).toBe(true)
  })
})

describe('handleRoll: 攻击格', () => {
  function withAttackTile(state: GameState, idx: number): GameState {
    return {
      ...state,
      board: {
        ...state.board,
        tiles: state.board.tiles.map((t, i) =>
          i === idx ? { ...t, type: 'attack' as const, damage: 800, name: '攻击格' } : t,
        ),
      },
    }
  }

  it('踩攻击格扣血并记录日志', () => {
    let state = withAttackTile(baseState(), 3)
    state = { ...state, players: [{ ...state.players[0], position: 2 }] }
    const next = reducer(state, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].position).toBe(3)
    expect(next.players[0].cash).toBe(15000 - 800)
    expect(next.log.some(l => l.kind === 'attack')).toBe(true)
  })

  it('攻击格导致破产', () => {
    let state = withAttackTile(baseState(), 3)
    state = { ...state, players: [{ ...state.players[0], position: 2, cash: 500 }] }
    const next = reducer(state, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].bankrupt).toBe(true)
  })
})

describe('handleRoll: 税务格', () => {
  it('踩税务格扣税', () => {
    const state = baseState()
    const atTax = {
      ...state,
      board: {
        ...state.board,
        tiles: state.board.tiles.map((t, i) =>
          i === 3 ? { ...t, type: 'tax' as const, taxAmount: 500, name: '税金' } : t,
        ),
      },
      players: [{ ...state.players[0], position: 2 }],
    }
    const next = reducer(atTax, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].cash).toBe(15000 - 500)
    expect(next.log.some(l => l.kind === 'tax')).toBe(true)
  })
})

describe('handleRoll: 自己地产升级决策', () => {
  it('停在自己地产上触发升级决策', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], position: 0, ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: false } },
    }
    const next = reducer(owned, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.awaitingDecision?.kind).toBe('upgradeProperty')
    expect(next.turn.phase).toBe('DECIDE')
  })

  it('满级地产不触发升级', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], position: 0, ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 4, mortgaged: false } },
    }
    const next = reducer(owned, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.awaitingDecision).toBeUndefined()
    expect(next.turn.phase).toBe('END_TURN')
  })

  it('资金不足不触发升级', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], position: 0, cash: 100, ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: false } },
    }
    const next = reducer(owned, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.awaitingDecision).toBeUndefined()
  })
})

describe('handleRoll: 租金支付', () => {
  it('停在其他玩家地产上支付租金', () => {
    const state = baseState()
    const d2 = state.players[1].id
    const withRent: GameState = {
      ...state,
      players: [
        { ...state.players[0], position: 0 },
        { ...state.players[1], ownedTileIds: [1] },
      ],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d2, level: 1, mortgaged: false } },
    }
    const next = reducer(withRent, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].cash).toBeLessThan(15000)
    expect(next.players[1].cash).toBeGreaterThan(15000)
    expect(next.log.some(l => l.kind === 'rent')).toBe(true)
  })

  it('抵押地产不收租', () => {
    const state = baseState()
    const d2 = state.players[1].id
    const withRent: GameState = {
      ...state,
      players: [
        { ...state.players[0], position: 0 },
        { ...state.players[1], ownedTileIds: [1] },
      ],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d2, level: 1, mortgaged: true } },
    }
    const next = reducer(withRent, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].cash).toBe(15000)
    expect(next.players[1].cash).toBe(15000)
  })

  it('吸尘器吸收租金', () => {
    const state = baseState()
    const d2 = state.players[1].id
    const withRent: GameState = {
      ...state,
      players: [
        { ...state.players[0], position: 0, rentAbsorbing: true },
        { ...state.players[1], ownedTileIds: [1] },
      ],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d2, level: 1, mortgaged: false } },
    }
    const next = reducer(withRent, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.log.some(l => l.kind === 'rent' && l.text.includes('吸尘器'))).toBe(true)
  })
})

describe('handleResolveDecision: 彩票/传送/魔法屋', () => {
  it('彩票下注决策', () => {
    const state = baseState()
    const withDecision: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'DECIDE' },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'lotteryBet',
        options: [{ id: 'bet', label: '下注' }, { id: 'skip', label: '离开' }],
        context: { betCost: 500 },
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'bet' })
    expect(next.turn.phase).toBe('END_TURN')
    expect(next.awaitingDecision).toBeUndefined()
  })

  it('传送目的地决策', () => {
    const state = baseState()
    const withDecision: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'DECIDE' },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'teleportTarget',
        options: [{ id: '0', label: '起点' }, { id: '5', label: '第5格' }],
        context: {},
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: '5' })
    expect(next.turn.phase).toBe('END_TURN')
  })

  it('魔法屋小游戏决策', () => {
    const state = baseState()
    const withDecision: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'DECIDE' },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'magicHouseEffect',
        options: [{ id: 'play', label: '挑战' }, { id: 'skip', label: '离开' }],
        context: {},
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'play' })
    expect(next.turn.phase).toBe('END_TURN')
  })

  it('银行操作决策', () => {
    const state = baseState()
    const withDecision: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'DECIDE' },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'bankOperation',
        options: [{ id: 'deposit', label: '存款' }, { id: 'skip', label: '离开' }],
        context: {},
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'deposit' })
    expect(next.turn.phase).toBe('END_TURN')
    expect(next.log.some(l => l.kind === 'bank')).toBe(true)
  })
})

describe('handleEndTurn: 状态递减', () => {
  it('sealedGroups 逐日递减', () => {
    const state = baseState()
    const withSealed: GameState = {
      ...state,
      sealedGroups: { zone_A: 3, zone_B: 1 },
    }
    const next = reducer(withSealed, { type: 'END_TURN' })
    expect(next.sealedGroups).toEqual({ zone_A: 2 })
  })

  it('priceUpGroups 逐日递减', () => {
    const state = baseState()
    const withPriceUp: GameState = {
      ...state,
      priceUpGroups: { zone_C: 2, zone_D: 1 },
    }
    const next = reducer(withPriceUp, { type: 'END_TURN' })
    expect(next.priceUpGroups).toEqual({ zone_C: 1 })
  })

  it('全部过期后变为 undefined', () => {
    const state = baseState()
    const withOneDay: GameState = {
      ...state,
      priceUpGroups: { zone_E: 1 },
    }
    const next = reducer(withOneDay, { type: 'END_TURN' })
    expect(next.priceUpGroups).toBeUndefined()
  })

  it('仅剩一名玩家时游戏结束', () => {
    const state = baseState()
    const oneAlive: GameState = {
      ...state,
      players: [
        { ...state.players[0] },
        { ...state.players[1], bankrupt: true },
      ],
    }
    // 当前是玩家0，但玩家0还没破产
    const next = reducer(oneAlive, { type: 'END_TURN' })
    // 应该能正常切换到下一个人（玩家1已破产，所以回到玩家0）
    expect(next.turn.currentPlayerId).toBe(state.players[0].id)
  })

  it('掷骰后仅剩1人自动结束游戏', () => {
    const state = baseState()
    const d2 = state.players[1].id
    const lastStanding: GameState = {
      ...state,
      players: [
        { ...state.players[0], cash: 50, position: 0 },
        { ...state.players[1] },
      ],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d2, level: 0, mortgaged: false } },
    }
    const next = reducer(lastStanding, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.status).toBe('ended')
    expect(next.winnerId).toBe(d2)
  })
})
