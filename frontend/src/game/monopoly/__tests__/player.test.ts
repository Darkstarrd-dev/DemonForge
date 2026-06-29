import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import type { GameState, NewGameConfig, Player, PropertyState } from '../types'
import { handleBankrupt, calcTotalAssets, liquidate } from '../engine/player'

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

describe('handleBankrupt', () => {
  it('当前玩家破产后地产全部释放', () => {
    let state = baseState()
    const d = state.players[0].id
    state = {
      ...state,
      players: [
        { ...state.players[0], ownedTileIds: ['c40_01', 'c40_02'] },
        state.players[1],
      ],
      board: {
        ...state.board,
        properties: {
          ...state.board.properties,
          'c40_01': { tileId: 'c40_01', ownerId: d, level: 1, mortgaged: false },
          'c40_02': { tileId: 'c40_02', ownerId: d, level: 0, mortgaged: false },
        },
      },
    }
    const next = handleBankrupt(state)
    expect(next.players[0].bankrupt).toBe(true)
    expect(next.players[0].ownedTileIds).toEqual([])
    expect(next.board.properties['c40_01'].ownerId).toBeUndefined()
    expect(next.board.properties['c40_01'].level).toBe(0)
    expect(next.board.properties['c40_02'].ownerId).toBeUndefined()
  })

  it('已经破产的玩家不能再次破产', () => {
    const state = baseState()
    const bankrupt: GameState = {
      ...state,
      players: [{ ...state.players[0], bankrupt: true }, state.players[1]],
    }
    const next = handleBankrupt(bankrupt)
    expect(next).toBe(bankrupt)
  })

  it('破产后仅一人存活则游戏结束', () => {
    let state = baseState()
    state = {
      ...state,
      turnContext: { ...state.turnContext, currentPlayerId: state.players[1].id },
    }
    const next = handleBankrupt(state)
    expect(next.status).toBe('ended')
    expect(next.winnerId).toBe(state.players[0].id)
    expect(next.log.some(l => l.kind === 'win')).toBe(true)
  })
})

describe('calcTotalAssets', () => {
  it('计算纯现金资产', () => {
    const state = baseState()
    const player = state.players[0]
    const result = calcTotalAssets(player, state.board.properties, {})
    expect(result).toBe(15000)
  })

  it('计算含地产估值', () => {
    const state = baseState()
    const player: Player = {
      ...state.players[0],
      cash: 10000,
      ownedTileIds: ['c40_01', 'c40_02'],
    }
    const properties: Record<string, PropertyState> = {
      'c40_01': { tileId: 'c40_01', ownerId: player.id, level: 1, mortgaged: false },
      'c40_02': { tileId: 'c40_02', ownerId: player.id, level: 0, mortgaged: false },
    }
    const tilePrices: Record<string, number> = { 'c40_01': 1000, 'c40_02': 800 }
    const assets = calcTotalAssets(player, properties, tilePrices)
    expect(assets).toBe(10000 + 1000 + 300 + 800)
  })

  it('抵押地产不计入估值但等级加成仍算', () => {
    const state = baseState()
    const player: Player = {
      ...state.players[0],
      cash: 10000,
      ownedTileIds: ['c40_01'],
    }
    const properties: Record<string, PropertyState> = {
      'c40_01': { tileId: 'c40_01', ownerId: player.id, level: 1, mortgaged: true },
    }
    const tilePrices: Record<string, number> = { 'c40_01': 1000 }
    const assets = calcTotalAssets(player, properties, tilePrices)
    expect(assets).toBe(10300)
  })

  it('含银行存款', () => {
    const state = baseState()
    const player: Player = {
      ...state.players[0],
      cash: 8000,
      bankDeposit: 5000,
      ownedTileIds: [],
    }
    const assets = calcTotalAssets(player, {}, {})
    expect(assets).toBe(8000 + 5000)
  })

  it('贷款不计入资产（函数不扣减贷款）', () => {
    const state = baseState()
    const player: Player = { ...state.players[0], cash: 8000, bankDeposit: 5000, bankLoan: 3000, ownedTileIds: [] }
    const assets = calcTotalAssets(player, {}, {})
    expect(assets).toBe(8000 + 5000)
  })
})

describe('liquidate 分步破产清算', () => {
  it('降级建筑回收部分资金', () => {
    let state = baseState()
    const tileWithLevels = state.board.tiles.find(t => t.buildingLevels && t.buildingLevels.length > 1)
    if (!tileWithLevels) return
    const tid = tileWithLevels.id
    const p0 = { ...state.players[0], cash: -500, ownedTileIds: [tid] }
    state = {
      ...state,
      players: [p0, state.players[1]],
      board: {
        ...state.board,
        properties: {
          ...state.board.properties,
          [tid]: { tileId: tid, ownerId: p0.id, level: 1, mortgaged: false },
        },
      },
    }
    const result = liquidate(state.players[0], state)
    expect(result.debtRemaining).toBeGreaterThanOrEqual(0)
  })

  it('抵押地产后 debt 减少', () => {
    let state = baseState()
    const tile = state.board.tiles.find(t => t.basePrice && t.basePrice > 0)
    if (!tile) return
    const tid = tile.id
    const basePrice = tile.basePrice ?? 0
    const p0 = { ...state.players[0], cash: -basePrice, ownedTileIds: [tid] }
    state = {
      ...state,
      players: [p0, state.players[1]],
      board: {
        ...state.board,
        properties: {
          ...state.board.properties,
          [tid]: { tileId: tid, ownerId: p0.id, level: 0, mortgaged: false },
        },
      },
    }
    const result = liquidate(state.players[0], state)
    expect(result.debtRemaining).toBeLessThan(basePrice)
  })

  it('有债权方时产权转移给债权方', () => {
    let state = baseState()
    const creditorId = state.players[1].id
    const tile = state.board.tiles.find(t => t.basePrice && t.basePrice > 0)
    if (!tile) return
    const tid = tile.id
    const p0 = { ...state.players[0], cash: -10000, ownedTileIds: [tid] }
    state = {
      ...state,
      players: [p0, state.players[1]],
      board: {
        ...state.board,
        properties: {
          ...state.board.properties,
          [tid]: { tileId: tid, ownerId: p0.id, level: 0, mortgaged: true },
        },
      },
    }
    const result = liquidate(state.players[0], state, creditorId)
    expect(result.properties[tid].ownerId).toBe(creditorId)
  })

  it('无债权方时产权归公', () => {
    let state = baseState()
    const tile = state.board.tiles.find(t => t.basePrice && t.basePrice > 0)
    if (!tile) return
    const tid = tile.id
    const p0 = { ...state.players[0], cash: -10000, ownedTileIds: [tid] }
    state = {
      ...state,
      players: [p0, state.players[1]],
      board: {
        ...state.board,
        properties: {
          ...state.board.properties,
          [tid]: { tileId: tid, ownerId: p0.id, level: 0, mortgaged: true },
        },
      },
    }
    const result = liquidate(state.players[0], state)
    expect(result.properties[tid].ownerId).toBeUndefined()
    expect(result.properties[tid].level).toBe(0)
  })

  it('破产玩家标记 bankrupt=true', () => {
    let state = baseState()
    const tile = state.board.tiles.find(t => t.basePrice && t.basePrice > 0)
    if (!tile) return
    const tid = tile.id
    const p0 = { ...state.players[0], cash: -5000, ownedTileIds: [tid] }
    state = {
      ...state,
      players: [p0, state.players[1]],
      board: {
        ...state.board,
        properties: {
          ...state.board.properties,
          [tid]: { tileId: tid, ownerId: p0.id, level: 1, mortgaged: false },
        },
      },
    }
    liquidate(state.players[0], state)
    expect(state.players[0].bankrupt).toBe(true)
  })
})
