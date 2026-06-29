import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import type { GameState, NewGameConfig, PropertyState, Player, Tile } from '../types'
import { handleMortgage, handleRedeem, handleBoardAction, calculateRent } from '../engine/board'

function makeConfig(overrides?: Partial<NewGameConfig>): NewGameConfig {
  return {
    players: [
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

function ownTile(
  state: GameState,
  tileId: string,
  ownerId: string,
  level: number = 0,
  extra?: Partial<PropertyState>,
): GameState {
  const prev = state.board.properties[tileId]
  const properties = {
    ...state.board.properties,
    [tileId]: { ...prev, tileId, ownerId, level, mortgaged: false, ...extra },
  }
  return { ...state, board: { ...state.board, properties } }
}

function ownGroup(
  state: GameState,
  groupId: string,
  ownerId: string,
  level: number = 0,
): GameState {
  const group = state.board.data.groups.find((g) => g.groupId === groupId)
  if (!group) return state
  const properties = { ...state.board.properties }
  for (const sid of group.spaceIds) {
    const prev = properties[sid]
    properties[sid] = { ...prev, tileId: sid, ownerId, level, mortgaged: false }
  }
  return { ...state, board: { ...state.board, properties } }
}

function patchPlayer(
  state: GameState,
  playerId: string,
  overrides: Partial<Player>,
): GameState {
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, ...overrides } : p,
  )
  return { ...state, players }
}

function patchTile(
  state: GameState,
  tileId: string,
  overrides: Partial<Tile>,
): GameState {
  const tiles = state.board.tiles.map((t) =>
    t.id === tileId ? { ...t, ...overrides } : t,
  )
  return { ...state, board: { ...state.board, tiles } }
}

describe('handleMortgage', () => {
  it('抵押无主地产返回原状态', () => {
    const state = baseState()
    const next = handleMortgage(state, 'c40_01')
    expect(next).toBe(state)
  })

  it('抵押已抵押地产返回原状态', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: true } },
      },
    }
    const next = handleMortgage(owned, 'c40_01')
    expect(next).toBe(owned)
  })

  it('抵押后现金增加并标记已抵押', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: false } },
      },
    }
    const next = handleMortgage(owned, 'c40_01')
    expect(next.players[0].cash).toBeGreaterThan(15000)
    expect(next.board.properties['c40_01'].mortgaged).toBe(true)
    expect(next.log.some(l => l.kind === 'mortgage')).toBe(true)
  })

  it('不存在的 tileId 返回原状态', () => {
    const state = baseState()
    const next = handleMortgage(state, 'c40_999')
    expect(next).toBe(state)
  })
})

describe('handleRedeem', () => {
  it('赎回无主地产返回原状态', () => {
    const state = baseState()
    const next = handleRedeem(state, 'c40_01')
    expect(next).toBe(state)
  })

  it('赎回未抵押地产返回原状态', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: false } },
      },
    }
    const next = handleRedeem(owned, 'c40_01')
    expect(next).toBe(owned)
  })

  it('资金不足时不能赎回', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], cash: 10, ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: true } },
      },
    }
    const next = handleRedeem(owned, 'c40_01')
    expect(next.board.properties['c40_01'].mortgaged).toBe(true)
    expect(next.players[0].cash).toBe(10)
  })

  it('赎回成功扣钱并取消抵押', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: true } },
      },
    }
    const next = handleRedeem(owned, 'c40_01')
    expect(next.board.properties['c40_01'].mortgaged).toBe(false)
    expect(next.players[0].cash).toBeLessThan(15000)
    expect(next.log.some(l => l.kind === 'redeem')).toBe(true)
  })
})

describe('handleBoardAction', () => {
  it('MORTGAGE_PROPERTY 路由到 handleMortgage', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: false } },
      },
    }
    const next = handleBoardAction(owned, { type: 'MORTGAGE_PROPERTY', tileId: 'c40_01' })
    expect(next.board.properties['c40_01'].mortgaged).toBe(true)
  })

  it('REDEEM_PROPERTY 路由到 handleRedeem', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: ['c40_01'] }],
      board: {
        ...state.board,
        properties: { ...state.board.properties, 'c40_01': { tileId: 'c40_01', ownerId: d, level: 0, mortgaged: true } },
      },
    }
    const next = handleBoardAction(owned, { type: 'REDEEM_PROPERTY', tileId: 'c40_01' })
    expect(next.board.properties['c40_01'].mortgaged).toBe(false)
  })

  it('未知 action 返回原状态', () => {
    const state = baseState()
    const next = handleBoardAction(state, { type: 'END_TURN' })
    expect(next).toBe(state)
  })
})

describe('calculateRent', () => {
  it('无主地产租金为零', () => {
    const state = baseState()
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 0 })
  })

  it('联合租金 - 同组全拥有加总', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownGroup(s, 'zone_A', p1)
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 220, creditorId: p1 })
  })

  it('联合租金 - 部分拥有只计己方', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownTile(s, 'c40_01', p1)
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 100, creditorId: p1 })
  })

  it('联合租金 - 不同owner各计己方', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const p2 = s.players[1].id
    let state = ownTile(s, 'c40_01', p1)
    state = ownTile(state, 'c40_03', p2)
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 100, creditorId: p1 })
    expect(calculateRent(state, 'c40_03')).toEqual({ amount: 120, creditorId: p2 })
  })

  it('连锁店 - 单个连锁店', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownTile(s, 'c40_01', p1, 0, { isChainStore: true })
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 100, creditorId: p1 })
  })

  it('连锁店 - 多连锁店跨组加总', () => {
    const s = baseState()
    const p1 = s.players[0].id
    let state = ownTile(s, 'c40_01', p1, 0, { isChainStore: true })
    state = ownTile(state, 'c40_06', p1, 0, { isChainStore: true })
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 240, creditorId: p1 })
  })

  it('摩天楼 - level 5 返回摩天楼租金', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownTile(s, 'c40_01', p1, 5)
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 4000, creditorId: p1 })
  })

  it('查封归零', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownGroup(s, 'zone_A', p1)
    const sealedState: GameState = {
      ...state,
      board: {
        ...state.board,
        sealedGroups: { ...state.board.sealedGroups, zone_A: 1 },
      },
    }
    expect(calculateRent(sealedState, 'c40_01')).toEqual({ amount: 0 })
  })

  it('涨价翻倍', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownGroup(s, 'zone_A', p1)
    const priceUpState: GameState = {
      ...state,
      board: {
        ...state.board,
        priceUpGroups: { ...state.board.priceUpGroups, zone_A: 1 },
      },
    }
    expect(calculateRent(priceUpState, 'c40_01')).toEqual({ amount: 440, creditorId: p1 })
  })

  it('住院不收租', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownTile(s, 'c40_01', p1)
    const hospitalState = patchPlayer(state, p1, { isCollectingRent: false })
    expect(calculateRent(hospitalState, 'c40_01')).toEqual({ amount: 0 })
  })

  it('抵押地产租金零', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownTile(s, 'c40_01', p1, 0, { mortgaged: true })
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 0 })
  })

  it('破产房东租金零', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownTile(s, 'c40_01', p1)
    const bankruptState = patchPlayer(state, p1, { bankrupt: true })
    expect(calculateRent(bankruptState, 'c40_01')).toEqual({ amount: 0 })
  })

  it('多等级递增 - level 1 全组', () => {
    const s = baseState()
    const p1 = s.players[0].id
    const state = ownGroup(s, 'zone_A', p1, 1)
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 670, creditorId: p1 })
  })

  it('无路段分组使用单地产租金', () => {
    const s = baseState()
    const p1 = s.players[0].id
    let state = ownTile(s, 'c40_01', p1)
    state = patchTile(state, 'c40_01', { groupId: undefined })
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 100, creditorId: p1 })
  })

  it('buildingLevels 为空返回零租金', () => {
    const s = baseState()
    const p1 = s.players[0].id
    let state = ownTile(s, 'c40_01', p1)
    state = patchTile(state, 'c40_01', { buildingLevels: undefined })
    expect(calculateRent(state, 'c40_01')).toEqual({ amount: 0, creditorId: p1 })
  })
})
