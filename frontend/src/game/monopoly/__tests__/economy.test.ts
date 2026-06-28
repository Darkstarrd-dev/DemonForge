import { describe, it, expect } from 'vitest'
import { createInitialState, reducer } from '../engine'
import { createDefaultBoard } from '../board.preset'
import type { GameState, NewGameConfig } from '../types'
import { handleDeposit, handleWithdraw, handleLoan, handleRepay, handleBuyStock, handleSellStock, handleDividend, calcPriceIndex, createInitialEconomy } from '../engine/economy'
import { handleCompanyLand } from '../engine/company'

function makeConfig(overrides?: Partial<NewGameConfig>): NewGameConfig {
  return {
    board: createDefaultBoard(),
    players: [
      { name: '玩家A', color: '#E74C3C', controller: 'human' },
      { name: '玩家B', color: '#3498DB', controller: 'human' },
    ],
    startingCash: 15000,
    mapId: 'classic-40',
    ...overrides,
  }
}

function baseState(): GameState {
  return createInitialState(makeConfig())
}

function setTurn(state: GameState, playerId: string): GameState {
  return { ...state, turn: { ...state.turn, currentPlayerId: playerId } }
}

describe('createInitialEconomy', () => {
  it('创建经济状态含正确初始值', () => {
    const eco = createInitialEconomy(2, 15000)
    expect(eco.priceIndex).toBe(1.0)
    expect(eco.initialCash).toBe(15000)
    expect(eco.initialPlayerCount).toBe(2)
    expect(eco.bankAccounts).toEqual({})
    expect(Object.keys(eco.companies).length).toBe(7)
    expect(eco.dividendDay).toBe(15)
    expect(eco.depositInterestRate).toBe(0.10)
  })

  it('创建 7 家公司含正确初始股价', () => {
    const eco = createInitialEconomy(2, 15000)
    expect(eco.companies['company-00'].stockPrice).toBe(200)
    expect(eco.companies['company-05'].stockPrice).toBe(300)
    expect(eco.companies['company-06'].stockPrice).toBe(160)
  })
})

describe('bank: deposit', () => {
  it('存入现金增加存款', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleDeposit(state, 5000)
    expect(next.players[0].cash).toBe(15000 - 5000)
    expect(next.economy!.bankAccounts['p1'].deposit).toBe(5000)
  })

  it('金额必须大于 0', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleDeposit(state, -100)
    expect(next).toBe(state)
  })

  it('不能存入超过现金', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleDeposit(state, 99999)
    expect(next).toBe(state)
  })

  it('通过 reducer 路由生效', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = reducer(state, { type: 'BANK_DEPOSIT', amount: 3000 })
    expect(next.players[0].cash).toBe(12000)
    expect(next.economy!.bankAccounts['p1'].deposit).toBe(3000)
  })
})

describe('bank: withdraw', () => {
  it('提取存款增加现金', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const deposited = handleDeposit(state, 5000)
    const next = handleWithdraw(deposited, 2000)
    expect(next.players[0].cash).toBe(15000 - 5000 + 2000)
    expect(next.economy!.bankAccounts['p1'].deposit).toBe(3000)
  })

  it('不能超额提取', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const deposited = handleDeposit(state, 5000)
    const next = handleWithdraw(deposited, 99999)
    expect(next).toBe(deposited)
  })

  it('金额必须大于 0', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleWithdraw(state, 0)
    expect(next).toBe(state)
  })

  it('通过 reducer 路由生效', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const deposited = reducer(state, { type: 'BANK_DEPOSIT', amount: 5000 })
    const next = reducer(deposited, { type: 'BANK_WITHDRAW', amount: 2000 })
    expect(next.players[0].cash).toBe(12000)
    expect(next.economy!.bankAccounts['p1'].deposit).toBe(3000)
  })
})

describe('bank: loan', () => {
  it('贷款获得现金并记录到期日', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleLoan(state, 10000)
    expect(next.players[0].cash).toBe(15000 + 10000)
    expect(next.economy!.bankAccounts['p1'].loan).toBe(10000)
    expect(next.economy!.bankAccounts['p1'].loanDueDay).toBe(1 + 90)
  })

  it('已有贷款不能再次贷款', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const withLoan = handleLoan(state, 10000)
    const next = handleLoan(withLoan, 5000)
    expect(next).toBe(withLoan)
  })

  it('金额不能超过 30000', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleLoan(state, 99999)
    expect(next).toBe(state)
  })

  it('通过 reducer 路由生效', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = reducer(state, { type: 'BANK_LOAN', amount: 8000 })
    expect(next.players[0].cash).toBe(23000)
    expect(next.economy!.bankAccounts['p1'].loan).toBe(8000)
  })
})

describe('bank: repay', () => {
  it('还款减少贷款', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const withLoan = handleLoan(state, 10000)
    const next = handleRepay(withLoan, 4000)
    expect(next.players[0].cash).toBe(15000 + 10000 - 4000)
    expect(next.economy!.bankAccounts['p1'].loan).toBe(6000)
  })

  it('不能超额还款', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const withLoan = handleLoan(state, 5000)
    const next = handleRepay(withLoan, 99999)
    expect(next.economy!.bankAccounts['p1'].loan).toBe(0)
    expect(next.players[0].cash).toBe(15000 + 5000 - 5000)
  })

  it('通过 reducer 路由生效', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const withLoan = reducer(state, { type: 'BANK_LOAN', amount: 10000 })
    const next = reducer(withLoan, { type: 'BANK_REPAY', amount: 3000 })
    expect(next.players[0].cash).toBe(25000 - 3000)
    expect(next.economy!.bankAccounts['p1'].loan).toBe(7000)
  })
})

describe('stock: buy', () => {
  it('买入股票扣钱增加持股', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleBuyStock(state, 'company-05', 10)
    expect(next.players[0].cash).toBe(15000 - 300 * 10)
    expect(next.players[0].stocks!['company-05']).toBe(10)
    expect(next.economy!.companies['company-05'].shareholders['p1']).toBe(10)
  })

  it('现金不足不能买入', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleBuyStock(state, 'company-05', 999)
    expect(next).toBe(state)
  })

  it('公司不存在返回原状态', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleBuyStock(state, 'nonexistent', 10)
    expect(next).toBe(state)
  })

  it('通过 reducer 路由生效', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = reducer(state, { type: 'BUY_STOCK', companyId: 'company-00', quantity: 5 })
    expect(next.players[0].stocks!['company-00']).toBe(5)
    expect(next.players[0].cash).toBe(15000 - 200 * 5)
  })
})

describe('stock: sell', () => {
  it('卖出股票增加现金减少持股', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const bought = handleBuyStock(state, 'company-05', 10)
    const next = handleSellStock(bought, 'company-05', 4)
    expect(next.players[0].stocks!['company-05']).toBe(6)
    expect(next.players[0].cash).toBe(15000 - 3000 + 300 * 4)
  })

  it('卖出超过持有量无效', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = handleBuyStock(state, 'company-05', 5)
    const next = handleSellStock(state, 'company-05', 10)
    expect(next).toBe(state)
  })

  it('通过 reducer 路由生效', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = reducer(state, { type: 'BUY_STOCK', companyId: 'company-00', quantity: 5 })
    const next = reducer(state, { type: 'SELL_STOCK', companyId: 'company-00', quantity: 2 })
    expect(next.players[0].stocks!['company-00']).toBe(3)
    expect(next.players[0].cash).toBe(15000 - 1000 + 400)
  })
})

describe('dividend', () => {
  it('第 15 天发放股息（含董事长额外分红）', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = { ...state, day: 15 }
    state = handleBuyStock(state, 'company-05', 10)
    const next = handleDividend(state)
    const dividend = Math.floor(300 * 10 * 0.05)
    const chairmanBonus = Math.floor(300 * 0.05)
    expect(next.players[0].cash).toBe(15000 - 3000 + dividend + chairmanBonus)
    expect(next.economy!.companies['company-05'].chairmanId).toBe('p1')
  })

  it('非分红日不做操作', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = { ...state, day: 14 }
    const next = handleDividend(state)
    expect(next).toBe(state)
  })

  it('多方持股时董事长为持股 >50% 的玩家', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = { ...state, day: 15 }
    // company-06 初始股价 160, 80 股 = 12800 < 15000
    state = handleBuyStock(state, 'company-06', 80)
    state = setTurn(state, state.players[1].id)
    state = handleBuyStock(state, 'company-06', 40)
    const next = handleDividend(state)
    expect(next.economy!.companies['company-06'].chairmanId).toBe('p1')
  })
})

describe('priceIndex', () => {
  it('初始物价指数为 1.0', () => {
    const state = baseState()
    expect(calcPriceIndex(state)).toBe(1.0)
  })

  it('资产增加后物价指数上升', () => {
    let state = baseState()
    state = { ...state, players: state.players.map((p) => ({ ...p, cash: 50000 })) }
    expect(calcPriceIndex(state)).toBeGreaterThan(1.0)
  })
})

describe('company land', () => {
  it('到达公司格，持股玩家获得红利', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = handleBuyStock(state, 'company-01', 10)
    const next = handleCompanyLand(state, 'company-01')
    const expected = Math.floor(150 * 10 * 0.10)
    expect(next.players[0].cash).toBe(15000 - 1500 + expected)
  })

  it('不持股玩家到达公司格无红利', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const next = handleCompanyLand(state, 'company-01')
    expect(next.players[0].cash).toBe(15000)
  })
})

describe('reducer: economy actions return state with economy', () => {
  it('初始状态包含 economy', () => {
    const state = baseState()
    expect(state.economy).toBeDefined()
    expect(state.day).toBe(1)
  })

  it('JSON 序列化包含 economy', () => {
    const state = baseState()
    const json = JSON.parse(JSON.stringify(state))
    expect(json.economy).toBeDefined()
    expect(json.economy.priceIndex).toBe(1.0)
    expect(json.day).toBe(1)
  })
})
