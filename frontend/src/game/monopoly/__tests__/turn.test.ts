import { describe, it, expect } from 'vitest'
import { createInitialState, reducer } from '../engine'
import type { GameState, NewGameConfig } from '../types'
import { TurnPhaseV2, SpaceType } from '../types'

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
  it('jailTurns > 0 时跳过并减计数', () => {
    const state = baseState()
    const sick = { ...state, players: [{ ...state.players[0], jailTurns: 2 }] }
    const next = reducer(sick, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(next.players[0].jailTurns).toBe(1)
    expect(next.log.some(l => l.kind === 'jailSkip')).toBe(true)
  })

  it('skipTurns > 0 时跳过并减计数', () => {
    const state = baseState()
    const skipped = { ...state, players: [{ ...state.players[0], skipTurns: 2 }] }
    const next = reducer(skipped, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
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
          i === idx ? { ...t, type: 'ATTACK_SPACE' as const, damage: 800, name: '攻击格' } : t,
        ),
      },
    }
  }

  it('踩攻击格扣血并记录日志', () => {
    let state = withAttackTile(baseState(), 3)
    state = { ...state, players: [{ ...state.players[0], position: 'c40_02' }] }
    const next = reducer(state, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].position).toBe('c40_03')
    expect(next.players[0].cash).toBe(15000 - 800)
    expect(next.log.some(l => l.kind === 'attack')).toBe(true)
  })

  it('攻击格导致破产', () => {
    let state = withAttackTile(baseState(), 3)
    state = { ...state, players: [{ ...state.players[0], position: 'c40_02', cash: 500 }] }
    const next = reducer(state, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].bankrupt).toBe(true)
  })
})

describe('handleRoll: 税务格', () => {
  it('踩税务格扣税（basePrice × taxRate）', () => {
    const state = baseState()
    const atTax = {
      ...state,
      board: {
        ...state.board,
        tiles: state.board.tiles.map((t, i) =>
          i === 3 ? { ...t, type: 'TAX' as const, basePrice: 5000, taxRate: 0.1, name: '税金' } : t,
        ),
      },
      players: [{ ...state.players[0], position: 'c40_02' }],
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
      players: [{ ...state.players[0], position: 'c40_00', ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: false } },
      },
    }
    const next = reducer(owned, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.awaitingDecision?.kind).toBe('upgradeProperty')
    expect(next.turnContext.phase).toBe(TurnPhaseV2.PURCHASE_DECISION)
  })

  it('满级地产不触发升级', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], position: 'c40_00', ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 4, mortgaged: false } },
      },
    }
    const next = reducer(owned, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.awaitingDecision).toBeUndefined()
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
  })

  it('资金不足不触发升级', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], position: 'c40_00', cash: 100, ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: false } },
      },
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
        { ...state.players[0], position: 'c40_00' },
        { ...state.players[1], ownedTileIds: ['c40_01'] },
      ],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d2, level: 1, mortgaged: false } },
      },
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
        { ...state.players[0], position: 'c40_00' },
        { ...state.players[1], ownedTileIds: ['c40_01'] },
      ],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d2, level: 1, mortgaged: true } },
      },
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
        { ...state.players[0], position: 'c40_00', rentAbsorbing: true },
        { ...state.players[1], ownedTileIds: ['c40_01'] },
      ],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d2, level: 1, mortgaged: false } },
      },
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
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.TURN_END },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'lotteryBet',
        options: [{ id: 'bet', label: '下注' }, { id: 'skip', label: '离开' }],
        context: { betCost: 500 },
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'bet' })
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(next.awaitingDecision).toBeUndefined()
  })

  it('传送目的地决策', () => {
    const state = baseState()
    const withDecision: GameState = {
      ...state,
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.TURN_END },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'teleportTarget',
        options: [{ id: 'c40_00', label: '起点' }, { id: 'c40_05', label: '第5格' }],
        context: {},
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'c40_05' })
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
  })

  it('魔法屋小游戏决策', () => {
    const state = baseState()
    const withDecision: GameState = {
      ...state,
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.TURN_END },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'magicHouseEffect',
        options: [{ id: 'play', label: '挑战' }, { id: 'skip', label: '离开' }],
        context: {},
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'play' })
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
  })

  it('银行操作决策', () => {
    const state = baseState()
    const withDecision: GameState = {
      ...state,
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.TURN_END },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'bankOperation',
        options: [{ id: 'deposit', label: '存款' }, { id: 'skip', label: '离开' }],
        context: {},
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'deposit' })
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(next.log.some(l => l.kind === 'bank')).toBe(true)
  })
})

describe('handleEndTurn: 状态递减', () => {
  it('sealedGroups 逐日递减', () => {
    const state = baseState()
    const withSealed: GameState = {
      ...state,
      board: { ...state.board, sealedGroups: { zone_A: 3, zone_B: 1 } },
    }
    const next = reducer(withSealed, { type: 'END_TURN' })
    expect(next.board.sealedGroups).toEqual({ zone_A: 2 })
  })

  it('priceUpGroups 逐日递减', () => {
    const state = baseState()
    const withPriceUp: GameState = {
      ...state,
      board: { ...state.board, priceUpGroups: { zone_C: 2, zone_D: 1 } },
    }
    const next = reducer(withPriceUp, { type: 'END_TURN' })
    expect(next.board.priceUpGroups).toEqual({ zone_C: 1 })
  })

  it('全部过期后变为空对象', () => {
    const state = baseState()
    const withOneDay: GameState = {
      ...state,
      board: { ...state.board, priceUpGroups: { zone_E: 1 } },
    }
    const next = reducer(withOneDay, { type: 'END_TURN' })
    expect(next.board.priceUpGroups).toEqual({})
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
    const next = reducer(oneAlive, { type: 'END_TURN' })
    expect(next.turnContext.currentPlayerId).toBe(state.players[0].id)
  })

  it('掷骰后仅剩1人自动结束游戏', () => {
    const state = baseState()
    const d2 = state.players[1].id
    const lastStanding: GameState = {
      ...state,
      players: [
        { ...state.players[0], cash: 50, position: 'c40_00' },
        { ...state.players[1] },
      ],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d2, level: 0, mortgaged: false } },
      },
    }
    const next = reducer(lastStanding, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.status).toBe('ended')
    expect(next.winnerId).toBe(d2)
  })
})

describe('补充场景', () => {
  it('neighborIds 分支：advanceOnRing 沿 neighborIds 前进', () => {
    const state = baseState()
    const custom = {
      ...state,
      board: {
        ...state.board,
        tiles: state.board.tiles.map((t, i) => {
          if (i === 2) {
            return { ...t, neighborIds: ['c40_01', 'c40_05'] }
          }
          return t
        }),
      },
      players: [{ ...state.players[0], position: 'c40_02' }],
    }
    const next = reducer(custom, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next.turnContext.movePath).toContain('c40_05')
    expect(next.players[0].position).toBe('c40_07')
  })

  it('neighborIds 缺失时回退到 index 取模前进', () => {
    const state = baseState()
    const custom = {
      ...state,
      board: {
        ...state.board,
        tiles: state.board.tiles.map((t, i) => {
          if (i === 2) {
            return { ...t, neighborIds: [] }
          }
          return t
        }),
      },
      players: [{ ...state.players[0], position: 'c40_02' }],
    }
    const next = reducer(custom, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].position).toBe('c40_03')
  })

  it('hospitalTurns > 0 时跳过并递减（住院休养）', () => {
    const state = baseState()
    const hospitalized = { ...state, players: [{ ...state.players[0], hospitalTurns: 2 }] }
    const next = reducer(hospitalized, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(next.players[0].hospitalTurns).toBe(1)
    expect(next.log.some(l => l.kind === 'jailSkip')).toBe(true)
  })

  it('踩医院格设置 hospitalTurns 和 jailTurns', () => {
    const state = baseState()
    const nearHospital = {
      ...state,
      players: [{ ...state.players[0], position: 'c40_29' }],
    }
    const next = reducer(nearHospital, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].position).toBe('c40_30')
    expect(next.players[0].hospitalTurns).toBe(2)
    expect(next.players[0].jailTurns).toBe(2)
    expect(next.log.some(l => l.kind === 'hospital')).toBe(true)
  })

  it('isConfined 统一逻辑：jailTurns 与 hospitalTurns 均触发跳过', () => {
    const state = baseState()
    const confinedByJail = { ...state, players: [{ ...state.players[0], jailTurns: 1, hospitalTurns: 1 }] }
    const next1 = reducer(confinedByJail, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next1.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(next1.players[0].jailTurns).toBe(0)
    expect(next1.players[0].hospitalTurns).toBe(0)

    const confinedByHospital = { ...state, players: [{ ...state.players[0], hospitalTurns: 1 }] }
    const next2 = reducer(confinedByHospital, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next2.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(next2.players[0].hospitalTurns).toBe(0)
  })

  it('税务格：basePrice 和 taxRate 均有值时按 basePrice × taxRate 扣税', () => {
    const state = baseState()
    const atTax = {
      ...state,
      board: {
        ...state.board,
        tiles: state.board.tiles.map((t, i) =>
          i === 4 ? { ...t, type: 'TAX' as const, basePrice: 8000, taxRate: 0.15, name: '高额税金' } : t,
        ),
      },
      players: [{ ...state.players[0], position: 'c40_03' }],
    }
    const next = reducer(atTax, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].position).toBe('c40_04')
    expect(next.players[0].cash).toBe(15000 - Math.floor(8000 * 0.15))
    expect(next.log.some(l => l.kind === 'tax')).toBe(true)
  })

  it('税务格：basePrice 或 taxRate 为 0 时扣默认 1000', () => {
    const state = baseState()
    const atTax = {
      ...state,
      board: {
        ...state.board,
        tiles: state.board.tiles.map((t, i) =>
          i === 4 ? { ...t, type: 'TAX' as const, basePrice: 0, taxRate: 0, name: '默认税' } : t,
        ),
      },
      players: [{ ...state.players[0], position: 'c40_03' }],
    }
    const next = reducer(atTax, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].cash).toBe(15000 - 1000)
  })

  it('ATTACK_SPACE 热斗模式落地扣 damage', () => {
    const state = createInitialState(makeConfig({ variant: 'hot_fight' }))
    const customDamage = {
      ...state,
      board: {
        ...state.board,
        tiles: state.board.tiles.map((t, i) =>
          i === 3 ? { ...t, type: SpaceType.ATTACK_SPACE, damage: 1200, name: '攻击·棕榈道2' } : t,
        ),
      },
      players: [{ ...state.players[0], position: 'c40_02' }],
    }
    const next = reducer(customDamage, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].cash).toBe(15000 - 1200)
    expect(next.log.some(l => l.kind === 'attack')).toBe(true)
  })

  it('经过多种类型格子的多步移动', () => {
    const state = baseState()
    const fromStart = { ...state, players: [{ ...state.players[0], position: 'c40_00' }] }
    const next = reducer(fromStart, { type: 'ROLL_DICE', dice: [3, 4] })
    expect(next.turnContext.moveSteps).toBe(7)
    expect(next.turnContext.movePath.length).toBe(7)
    expect(next.players[0].position).toBe('c40_07')
    expect(next.log.some(l => l.kind === 'move')).toBe(true)
  })

  it('hospitalTurns 从 2 逐回合递减至 0 后恢复移动', () => {
    const state = baseState()
    const sick = { ...state, players: [{ ...state.players[0], hospitalTurns: 2 }] }
    const turn1 = reducer(sick, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(turn1.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(turn1.players[0].hospitalTurns).toBe(1)

    const turn2 = reducer(turn1, { type: 'END_TURN' })
    const sickAgain = { ...turn2, players: [{ ...turn2.players[0], hospitalTurns: 1 }] }
    const turn3 = reducer(sickAgain, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(turn3.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(turn3.players[0].hospitalTurns).toBe(0)

    const healed = { ...turn3, players: [{ ...turn3.players[0], hospitalTurns: 0, jailTurns: 0 }] }
    const turn4 = reducer(healed, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(turn4.turnContext.phase).not.toBe(TurnPhaseV2.TURN_END)
    expect(turn4.log.some(l => l.kind === 'move')).toBe(true)
  })
})
