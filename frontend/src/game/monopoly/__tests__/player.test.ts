import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import type { GameState, NewGameConfig, Player, PropertyState } from '../types'
import { handleBankrupt, calcTotalAssets } from '../engine/player'

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
})
