import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import type { GameState, NewGameConfig } from '../types'
import { handleCompanyLand, getCompanyState } from '../engine/company'

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

describe('getCompanyState', () => {
  it('返回存在的公司', () => {
    const state = baseState()
    const company = getCompanyState('company-00', state.economy!)
    expect(company).toBeDefined()
    expect(company!.stockPrice).toBeGreaterThan(0)
  })

  it('不存在的公司返回 undefined', () => {
    const state = baseState()
    const company = getCompanyState('company-nonexist', state.economy!)
    expect(company).toBeUndefined()
  })
})

describe('handleCompanyLand', () => {
  it('经过公司格但无持股无红利', () => {
    const state = baseState()
    const next = handleCompanyLand(state, 'company-00')
    expect(next.log.some(l => l.kind === 'company')).toBe(true)
  })

  it('持股时到达公司格获得红利', () => {
    let state = baseState()
    state = {
      ...state,
      players: [
        { ...state.players[0], stocks: { 'company-00': 10 } },
        state.players[1],
      ],
    }
    const next = handleCompanyLand(state, 'company-00')
    expect(next.players[0].cash).toBeGreaterThan(15000)
    expect(next.log.some(l => l.text.includes('红利'))).toBe(true)
  })

  it('不存在的公司返回原状态', () => {
    const state = baseState()
    const next = handleCompanyLand(state, 'company-nonexist')
    expect(next).toBe(state)
  })

  it('董事长收取过路费', () => {
    let state = baseState()
    state = {
      ...state,
      turn: { ...state.turn, currentPlayerId: state.players[1].id },
      economy: state.economy ? {
        ...state.economy,
        companies: {
          ...state.economy.companies,
          'company-00': {
            ...state.economy.companies['company-00'],
            shareholders: { [state.players[0].id]: 60, [state.players[1].id]: 40 },
          },
        },
      } : undefined,
    }
    const next = handleCompanyLand(state, 'company-00')
    // 玩家A（董事长）应收到过路费
    expect(next.log.some(l => l.text.includes('董事长'))).toBe(true)
  })
})
