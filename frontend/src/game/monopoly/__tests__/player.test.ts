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
        { ...state.players[0], ownedTileIds: [1, 2] },
        state.players[1],
      ],
      properties: {
        ...state.properties,
        1: { tileId: 1, ownerId: d, level: 1, mortgaged: false },
        2: { tileId: 2, ownerId: d, level: 0, mortgaged: false },
      },
    }
    const next = handleBankrupt(state)
    expect(next.players[0].bankrupt).toBe(true)
    expect(next.players[0].ownedTileIds).toEqual([])
    expect(next.properties[1].ownerId).toBeUndefined()
    expect(next.properties[1].level).toBe(0)
    expect(next.properties[2].ownerId).toBeUndefined()
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
    // 当前玩家（p2）破产，玩家A（p1）仍存活
    state = {
      ...state,
      turn: { ...state.turn, currentPlayerId: state.players[1].id },
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
    const result = calcTotalAssets(player, state.properties, {})
    expect(result).toBe(15000)
  })

  it('计算含地产估值', () => {
    const state = baseState()
    const player: Player = {
      ...state.players[0],
      cash: 10000,
      ownedTileIds: [1, 2],
    }
    const properties: Record<number, PropertyState> = {
      1: { tileId: 1, ownerId: player.id, level: 1, mortgaged: false },
      2: { tileId: 2, ownerId: player.id, level: 0, mortgaged: false },
    }
    const tilePrices: Record<number, number> = { 1: 1000, 2: 800 }
    const assets = calcTotalAssets(player, properties, tilePrices)
    // 10000 + 1000 + 1*1000*0.3 + 800
    expect(assets).toBe(10000 + 1000 + 300 + 800)
  })

  it('抵押地产不计入估值但等级加成仍算', () => {
    const state = baseState()
    const player: Player = {
      ...state.players[0],
      cash: 10000,
      ownedTileIds: [1],
    }
    const properties: Record<number, PropertyState> = {
      1: { tileId: 1, ownerId: player.id, level: 1, mortgaged: true },
    }
    const tilePrices: Record<number, number> = { 1: 1000 }
    const assets = calcTotalAssets(player, properties, tilePrices)
    // 10000 + 0 (mortgaged base) + 1*1000*0.3 (level bonus)
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
