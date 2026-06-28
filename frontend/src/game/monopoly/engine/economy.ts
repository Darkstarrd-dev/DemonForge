// Economy 子系统：物价指数 / 银行 / 股票（M2+ 实现，M0 骨架）
import type { EconomyState, FullGameState } from '../types'

export function createInitialEconomy(): EconomyState {
  return {
    priceIndex: 1.0,
    initialCash: 15000,
    initialPlayerCount: 0,
    bankruptCount: 0,
    priceIndexMode: 'asset_based',
    bankAccounts: {},
    companies: {},
    dividendDay: 15,
    depositInterestRate: 0.10,
    loanTermDays: 90,
  }
}

export function calcPriceIndex(state: FullGameState): number {
  if (state.config.priceIndexMode === 'auto_increment') {
    const interval = state.economy.autoIncrementIntervalDays ?? 7
    if (state.day - (state.economy.lastAutoIncrementDay ?? 0) >= interval) {
      return state.economy.priceIndex + 1
    }
    return state.economy.priceIndex
  }
  const totalAssets = state.players.reduce((s, p) => s + (p.totalAssets ?? p.cash), 0)
  const alive = state.players.filter((p) => p.status !== 'BANKRUPT' && p.status !== undefined).length || 1
  return totalAssets / state.economy.initialCash / alive
}

export function calcRent(space: { baseRent: number; level: number; groupId?: string; isChainStore?: boolean }, priceIndex: number): number {
  return Math.floor(space.baseRent * priceIndex)
}
