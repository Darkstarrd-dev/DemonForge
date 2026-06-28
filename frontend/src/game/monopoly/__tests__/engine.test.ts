import { describe, it, expect } from 'vitest'
import { createInitialState, reducer } from '../engine'
import type { GameState, NewGameConfig } from '../types'
import { TurnPhaseV2 } from '../types'

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

function makeRoll(state: GameState): GameState {
  return reducer(state, { type: 'ROLL_DICE', dice: [3, 4] })
}

describe('createInitialState', () => {
  it('创建游戏状态含正确玩家', () => {
    const state = createInitialState(makeConfig())
    expect(state.players).toHaveLength(2)
    expect(state.players[0].name).toBe('玩家A')
    expect(state.players[0].cash).toBe(15000)
    expect(state.players[0].position).toBe('c40_00')
    expect(state.players[0].bankrupt).toBe(false)
  })

  it('地产格有运行态记录', () => {
    const state = createInitialState(makeConfig())
    const propTiles = state.board.tiles.filter((t) => t.type === 'PROPERTY')
    expect(Object.keys(state.board.properties).length).toBeGreaterThan(0)
    for (const tile of propTiles) {
      expect(state.board.properties[tile.id].tileId).toBe(tile.id)
      expect(state.board.properties[tile.id].level).toBe(0)
      expect(state.board.properties[tile.id].mortgaged).toBe(false)
    }
  })

  it('第一个玩家为当前回合', () => {
    const state = createInitialState(makeConfig())
    expect(state.turnContext.currentPlayerId).toBe(state.players[0].id)
    expect(state.turnContext.phase).toBe(TurnPhaseV2.TURN_START)
  })

  it('游戏状态含 mapId 和 mapName', () => {
    const state = createInitialState(makeConfig())
    expect(state.mapId).toBe('classic-40')
    expect(state.mapName).toBe('经典 40 格')
  })

  it('JSON 序列化不丢失数据', () => {
    const state = createInitialState(makeConfig())
    const json = JSON.parse(JSON.stringify(state))
    expect(json.players).toHaveLength(2)
    expect(json.board.tiles).toHaveLength(40)
    expect(json.status).toBe('playing')
  })
})

describe('reducer: ROLL_DICE', () => {
  it('掷骰后玩家移动到正确位置', () => {
    const state = createInitialState(makeConfig())
    const next = makeRoll(state)
    expect(next.players[0].position).toBe('c40_07')
    expect(next.turnContext.diceResults).toEqual([3, 4])
  })

  it('经过起点领取薪水', () => {
    const state = createInitialState(makeConfig({    }))
    const moved = reducer({ ...state, players: [{ ...state.players[0], position: 'c40_38' }] }, { type: 'ROLL_DICE', dice: [2, 3] })
    expect(moved.players[0].position).toBe('c40_03')
    expect(moved.players[0].cash).toBeGreaterThan(15000)
  })

  it('住院跳过回合', () => {
    const state = createInitialState(makeConfig())
    const sick = { ...state, players: [{ ...state.players[0], jailTurns: 1 }] }
    const next = makeRoll(sick)
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(next.players[0].jailTurns).toBe(0)
  })

  it('停在无主地产触发购买决策', () => {
    const state = createInitialState(makeConfig())
    const atProp = { ...state, players: [{ ...state.players[0], position: 'c40_00' }] }
    const next = reducer(atProp, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].position).toBe('c40_01')
    expect(next.awaitingDecision).toBeDefined()
    expect(next.awaitingDecision!.kind).toBe('buyProperty')
    expect(next.turnContext.phase).toBe(TurnPhaseV2.PURCHASE_DECISION)
  })
})

describe('reducer: RESOLVE_DECISION', () => {
  it('购买地产扣钱并标记拥有', () => {
    const state = createInitialState(makeConfig())
    const d = state.players[0].id
    const withDecision: GameState = {
      ...state,
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.PURCHASE_DECISION },
      awaitingDecision: {
        playerId: d,
        kind: 'buyProperty',
        options: [{ id: 'buy', label: '购买' }, { id: 'skip', label: '放弃' }],
        context: { tileId: 'c40_01', tileName: '棕榈道1', price: 1060 },
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'buy' })
    expect(next.players[0].cash).toBe(15000 - 1060)
    expect(next.players[0].ownedTileIds).toContain('c40_01')
    expect(next.board.properties['c40_01'].ownerId).toBe(d)
  })

  it('放弃购买不扣钱', () => {
    const state = createInitialState(makeConfig())
    const withDecision: GameState = {
      ...state,
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.PURCHASE_DECISION },
      awaitingDecision: {
        playerId: state.players[0].id,
        kind: 'buyProperty',
        options: [{ id: 'buy', label: '购买' }, { id: 'skip', label: '放弃' }],
        context: { tileId: 'c40_01', tileName: '棕榈道1', price: 1060 },
      },
    }
    const next = reducer(withDecision, { type: 'RESOLVE_DECISION', optionId: 'skip' })
    expect(next.players[0].cash).toBe(15000)
    expect(next.players[0].ownedTileIds).not.toContain('c40_01')
  })

  it('升级地产扣钱并提升等级', () => {
    const state = createInitialState(makeConfig())
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: false } },
      },
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.PURCHASE_DECISION },
      awaitingDecision: {
        playerId: d,
        kind: 'upgradeProperty',
        options: [{ id: 'upgrade', label: '升级' }, { id: 'skip', label: '暂不' }],
        context: { tileId: 'c40_01', tileName: '棕榈道1', cost: 530, nextLevel: 1 },
      },
    }
    const next = reducer(owned, { type: 'RESOLVE_DECISION', optionId: 'upgrade' })
    expect(next.board.properties['c40_01'].level).toBe(1)
    expect(next.players[0].cash).toBe(15000 - 530)
  })
})

describe('reducer: MORTGAGE / REDEEM', () => {
  it('抵押地产获得现金', () => {
    const state = createInitialState(makeConfig())
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: false } },
      },
    }
    const next = reducer(owned, { type: 'MORTGAGE_PROPERTY', tileId: 'c40_01' })
    expect(next.players[0].cash).toBeGreaterThan(15000)
    expect(next.board.properties['c40_01'].mortgaged).toBe(true)
  })

  it('赎回抵押地产花钱', () => {
    const state = createInitialState(makeConfig())
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: true } },
      },
    }
    const next = reducer(owned, { type: 'REDEEM_PROPERTY', tileId: 'c40_01' })
    expect(next.players[0].cash).toBeLessThan(15000)
    expect(next.board.properties['c40_01'].mortgaged).toBe(false)
  })
})

describe('reducer: END_TURN', () => {
  it('切换到下一个未破产玩家', () => {
    const state = createInitialState(makeConfig())
    const next = reducer(state, { type: 'END_TURN' })
    expect(next.turnContext.currentPlayerId).toBe(state.players[1].id)
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_START)
  })

  it('跳过已破产玩家', () => {
    const state = createInitialState(makeConfig())
    const withBankrupt: GameState = {
      ...state,
      players: [
        state.players[0],
        { ...state.players[1], bankrupt: true },
      ],
    }
    const next = reducer(withBankrupt, { type: 'END_TURN' })
    expect(next.turnContext.currentPlayerId).toBe(state.players[0].id)
  })
})

describe('NEW_GAME', () => {
  it('重置全部游戏状态', () => {
    const state = createInitialState(makeConfig())
    const played = reducer(state, { type: 'ROLL_DICE', dice: [1, 2] })
    const restarted = reducer(played, { type: 'NEW_GAME', config: makeConfig() })
    expect(restarted.players[0].position).toBe('c40_00')
    expect(restarted.players[0].cash).toBe(15000)
    expect(restarted.log).toHaveLength(1)
    expect(restarted.status).toBe('playing')
  })
})

describe('reducer: 破产', () => {
  it('现金不足支付过路费时破产', () => {
    const state = createInitialState(makeConfig())
    const d2 = state.players[1].id
    const next = reducer({
      ...state,
      players: [
        { ...state.players[0], cash: 50, position: 'c40_00' },
        state.players[1],
      ],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d2, level: 0, mortgaged: false } },
      },
    }, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.players[0].bankrupt).toBe(true)
    expect(next.players[0].ownedTileIds).toEqual([])
    expect(next.players[0].cash).toBe(0)
  })

  it('仅剩一名玩家时游戏结束', () => {
    const state = createInitialState(makeConfig())
    const d2 = state.players[1].id
    const next = reducer({
      ...state,
      players: [
        { ...state.players[0], cash: 50, position: 'c40_00' },
        { ...state.players[1] },
      ],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d2, level: 0, mortgaged: false } },
      },
    }, { type: 'ROLL_DICE', dice: [0, 1] })
    expect(next.status).toBe('ended')
    expect(next.winnerId).toBe(d2)
  })
})

describe('M7 多版本变体', () => {
  it('createInitialState 含 config 字段', () => {
    const state = createInitialState(makeConfig())
    expect(state.config).toBeDefined()
    expect(state.config.version).toBe('richman4')
  })
  it('configPresetId 加载正确版本配置', () => {
    const state = createInitialState(makeConfig({ configPresetId: 'richman10-online' }))
    expect(state.config).toBeDefined()
    expect(state.config.version).toBe('richman10')
    expect(state.config.startingCash).toBe(10000)
  })
  it('热斗模式替换地产为攻击格', () => {
    const state = createInitialState(makeConfig({ configPresetId: 'richman11-hotfight' }))
    const attackTiles = state.board.tiles.filter((t) => t.type === 'ATTACK_SPACE' as const)
    expect(attackTiles.length).toBeGreaterThan(0)
    expect(state.board.tiles.filter((t) => t.type === 'PROPERTY' as const)).toHaveLength(0)
    expect(state.board.tiles.filter((t) => t.type === 'HOSPITAL' as const)).toHaveLength(0)
  })
  it('热斗模式踩攻击格扣钱', () => {
    const state = createInitialState(makeConfig({ configPresetId: 'richman11-hotfight' }))
    const attackIdx = state.board.tiles.findIndex((t) => t.type === 'ATTACK_SPACE' as const)
    const cash = state.players[0].cash
    const next = reducer(state, { type: 'ROLL_DICE', dice: [0, attackIdx] })
    expect(next.players[0].cash).toBeLessThan(cash)
  })
})
