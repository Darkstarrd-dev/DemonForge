import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import { createDefaultBoard } from '../board.preset'
import type { GameState, NewGameConfig } from '../types'
import { handleMortgage, handleRedeem, handleBoardAction } from '../engine/board'

function makeConfig(overrides?: Partial<NewGameConfig>): NewGameConfig {
  return {
    board: createDefaultBoard(),
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

describe('handleMortgage', () => {
  it('抵押无主地产返回原状态', () => {
    const state = baseState()
    const next = handleMortgage(state, 1)
    expect(next).toBe(state)
  })

  it('抵押已抵押地产返回原状态', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: true } },
    }
    const next = handleMortgage(owned, 1)
    expect(next).toBe(owned)
  })

  it('抵押后现金增加并标记已抵押', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: false } },
    }
    const next = handleMortgage(owned, 1)
    expect(next.players[0].cash).toBeGreaterThan(15000)
    expect(next.properties[1].mortgaged).toBe(true)
    expect(next.log.some(l => l.kind === 'mortgage')).toBe(true)
  })

  it('不存在的 tileId 返回原状态', () => {
    const state = baseState()
    const next = handleMortgage(state, 999)
    expect(next).toBe(state)
  })
})

describe('handleRedeem', () => {
  it('赎回无主地产返回原状态', () => {
    const state = baseState()
    const next = handleRedeem(state, 1)
    expect(next).toBe(state)
  })

  it('赎回未抵押地产返回原状态', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: false } },
    }
    const next = handleRedeem(owned, 1)
    expect(next).toBe(owned)
  })

  it('资金不足时不能赎回', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], cash: 10, ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: true } },
    }
    const next = handleRedeem(owned, 1)
    expect(next.properties[1].mortgaged).toBe(true)
    expect(next.players[0].cash).toBe(10)
  })

  it('赎回成功扣钱并取消抵押', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: true } },
    }
    const next = handleRedeem(owned, 1)
    expect(next.properties[1].mortgaged).toBe(false)
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
      players: [{ ...state.players[0], ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: false } },
    }
    const next = handleBoardAction(owned, { type: 'MORTGAGE_PROPERTY', tileId: 1 })
    expect(next.properties[1].mortgaged).toBe(true)
  })

  it('REDEEM_PROPERTY 路由到 handleRedeem', () => {
    const state = baseState()
    const d = state.players[0].id
    const owned: GameState = {
      ...state,
      players: [{ ...state.players[0], ownedTileIds: [1] }],
      properties: { ...state.properties, 1: { tileId: 1, ownerId: d, level: 0, mortgaged: true } },
    }
    const next = handleBoardAction(owned, { type: 'REDEEM_PROPERTY', tileId: 1 })
    expect(next.properties[1].mortgaged).toBe(false)
  })

  it('未知 action 返回原状态', () => {
    const state = baseState()
    const next = handleBoardAction(state, { type: 'END_TURN' })
    expect(next).toBe(state)
  })
})
