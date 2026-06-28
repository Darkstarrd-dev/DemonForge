import type { EconomyState, GameState, Action, BankAccount, CompanyState } from '../types'
import companiesData from '../data/companies/richman4-companies.json'
import type { CompanyDefinition } from '../types'

const LOAN_TERM_DAYS = 90
const DEPOSIT_INTEREST_RATE = 0.10
const STOCK_PRICE_VOLATILITY = 0.10
const DIVIDEND_RATE = 0.05
const CHAIRMAN_BONUS_RATE = 0.05

export function createInitialEconomy(playerCount: number, initialCash: number): EconomyState {
  const companyDefs = companiesData as CompanyDefinition[]
  const companies: Record<string, CompanyState> = {}
  for (const def of companyDefs) {
    companies[def.id] = {
      companyId: def.id,
      stockPrice: def.initialStockPrice,
      stockLimitUpDays: 0,
      stockLimitDownDays: 0,
      shareholders: {},
    }
  }
  return {
    priceIndex: 1.0,
    initialCash,
    initialPlayerCount: playerCount,
    bankruptCount: 0,
    priceIndexMode: 'asset_based',
    bankAccounts: {},
    companies,
    dividendDay: 15,
    depositInterestRate: DEPOSIT_INTEREST_RATE,
    loanTermDays: LOAN_TERM_DAYS,
  }
}

export function getBankAccount(playerId: string, economy: EconomyState): BankAccount {
  return economy.bankAccounts[playerId] ?? { playerId, deposit: 0, loan: 0, loanDueDay: 0 }
}

function saveBankAccount(economy: EconomyState, acct: BankAccount): EconomyState {
  return {
    ...economy,
    bankAccounts: { ...economy.bankAccounts, [acct.playerId]: acct },
  }
}

// ─── Bank Operations ───

export function handleDeposit(state: GameState, amount: number): GameState {
  if (amount <= 0) return state
  const players = state.players.map((p) => ({ ...p }))
  const player = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!player || player.cash < amount) return state
  const economy = { ...state.economy }
  const acct = { ...getBankAccount(player.id, economy) }
  player.cash -= amount
  acct.deposit += amount
  const log = [...state.log, { seq: state.log.length, kind: 'bank', text: `${player.name} 存入 ¥${amount}` }]
  return { ...state, players, economy: saveBankAccount(economy, acct), log }
}

export function handleWithdraw(state: GameState, amount: number): GameState {
  if (amount <= 0) return state
  const players = state.players.map((p) => ({ ...p }))
  const player = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!player) return state
  const economy = { ...state.economy }
  const acct = { ...getBankAccount(player.id, economy) }
  if (acct.deposit < amount) return state
  acct.deposit -= amount
  player.cash += amount
  const log = [...state.log, { seq: state.log.length, kind: 'bank', text: `${player.name} 提取 ¥${amount}` }]
  return { ...state, players, economy: saveBankAccount(economy, acct), log }
}

export function handleLoan(state: GameState, amount: number): GameState {
  if (amount <= 0 || amount > 30000) return state
  const players = state.players.map((p) => ({ ...p }))
  const player = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!player) return state
  const economy = { ...state.economy }
  const acct = { ...getBankAccount(player.id, economy) }
  if (acct.loan > 0) return state
  const day = state.day
  acct.loan = amount
  acct.loanDueDay = day + economy.loanTermDays
  player.cash += amount
  const log = [...state.log, { seq: state.log.length, kind: 'bank', text: `${player.name} 贷款 ¥${amount}（${economy.loanTermDays} 天到期）` }]
  return { ...state, players, economy: saveBankAccount(economy, acct), log }
}

export function handleRepay(state: GameState, amount: number): GameState {
  if (amount <= 0) return state
  const players = state.players.map((p) => ({ ...p }))
  const player = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!player) return state
  const economy = { ...state.economy }
  const acct = { ...getBankAccount(player.id, economy) }
  const repayAmount = Math.min(amount, acct.loan, player.cash)
  if (repayAmount <= 0) return state
  acct.loan -= repayAmount
  player.cash -= repayAmount
  const log = [...state.log, { seq: state.log.length, kind: 'bank', text: `${player.name} 还款 ¥${repayAmount}（剩余贷款 ¥${acct.loan}）` }]
  return { ...state, players, economy: saveBankAccount(economy, acct), log }
}

export function handleBankAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'BANK_DEPOSIT': return handleDeposit(state, action.amount)
    case 'BANK_WITHDRAW': return handleWithdraw(state, action.amount)
    case 'BANK_LOAN': return handleLoan(state, action.amount)
    case 'BANK_REPAY': return handleRepay(state, action.amount)
    default: return state
  }
}

// ─── Stock Operations ───

function findCompanyDef(companyId: string): CompanyDefinition | undefined {
  return (companiesData as CompanyDefinition[]).find((c) => c.id === companyId)
}

export function handleBuyStock(state: GameState, companyId: string, quantity: number): GameState {
  if (quantity <= 0) return state
  const players = state.players.map((p) => ({ ...p }))
  const player = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!player) return state
  const economy = { ...state.economy, companies: { ...state.economy.companies } }
  const company = economy.companies[companyId]
  if (!company) return state
  const cost = company.stockPrice * quantity
  if (player.cash < cost) return state
  player.cash -= cost
  player.stocks = { ...(player.stocks ?? {}), [companyId]: (player.stocks?.[companyId] ?? 0) + quantity }
  economy.companies[companyId] = {
    ...company,
    shareholders: { ...company.shareholders, [player.id]: (company.shareholders[player.id] ?? 0) + quantity },
  }
  const def = findCompanyDef(companyId)
  const name = def?.name ?? companyId
  const log = [...state.log, { seq: state.log.length, kind: 'stock', text: `${player.name} 买入 ${quantity} 股「${name}」，花费 ¥${cost}` }]
  return { ...state, players, economy, log }
}

export function handleSellStock(state: GameState, companyId: string, quantity: number): GameState {
  if (quantity <= 0) return state
  const players = state.players.map((p) => ({ ...p }))
  const player = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!player) return state
  const economy = { ...state.economy, companies: { ...state.economy.companies } }
  const company = economy.companies[companyId]
  if (!company) return state
  const held = player.stocks?.[companyId] ?? 0
  if (held < quantity) return state
  player.stocks = { ...(player.stocks ?? {}), [companyId]: held - quantity }
  const revenue = company.stockPrice * quantity
  player.cash += revenue
  economy.companies[companyId] = {
    ...company,
    shareholders: { ...company.shareholders, [player.id]: (company.shareholders[player.id] ?? 0) - quantity },
  }
  const def = findCompanyDef(companyId)
  const name = def?.name ?? companyId
  const log = [...state.log, { seq: state.log.length, kind: 'stock', text: `${player.name} 卖出 ${quantity} 股「${name}」，获得 ¥${revenue}` }]
  return { ...state, players, economy, log }
}

export function handleStockAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'BUY_STOCK': return handleBuyStock(state, action.companyId, action.quantity)
    case 'SELL_STOCK': return handleSellStock(state, action.companyId, action.quantity)
    default: return state
  }
}

// ─── Dividend ───

export function handleDividend(state: GameState): GameState {
  const economy = state.economy
  if (!economy) return state
  const day = state.day
  if (day % economy.dividendDay !== 0) return state
  const players = state.players.map((p) => ({ ...p }))
  const log = [...state.log]
  let updatedEconomy = { ...economy, companies: { ...economy.companies } }
  for (const [companyId, company] of Object.entries(updatedEconomy.companies)) {
    const def = findCompanyDef(companyId)
    const companyName = def?.name ?? companyId
    for (const [pid, shares] of Object.entries(company.shareholders)) {
      if (shares <= 0) continue
      const player = players.find((p) => p.id === pid)
      if (!player || player.bankrupt) continue
      const dividend = Math.floor(company.stockPrice * shares * DIVIDEND_RATE)
      player.cash += dividend
      log.push({ seq: log.length, kind: 'dividend', text: `${player.name} 获得「${companyName}」股息 ¥${dividend}` })
    }
    const totalShares = Object.values(company.shareholders).reduce((s, v) => s + v, 0)
    for (const [pid, shares] of Object.entries(company.shareholders)) {
      if (shares > totalShares / 2) {
        updatedEconomy.companies[companyId] = { ...company, chairmanId: pid }
        const chairman = players.find((p) => p.id === pid)
        if (chairman && !chairman.bankrupt) {
          const bonus = Math.floor(company.stockPrice * CHAIRMAN_BONUS_RATE)
          chairman.cash += bonus
          log.push({ seq: log.length, kind: 'dividend', text: `${chairman.name} 作为「${companyName}」董事长获得额外分红 ¥${bonus}` })
        }
      }
    }
  }
  return { ...state, players, economy: updatedEconomy, log }
}

// ─── Stock Price Fluctuation ───

export function fluctuateStockPrices(economy: EconomyState): EconomyState {
  const updated: Record<string, CompanyState> = {}
  for (const [id, company] of Object.entries(economy.companies)) {
    const change = 1 + (Math.random() - 0.5) * 2 * STOCK_PRICE_VOLATILITY
    const newPrice = Math.max(10, Math.round(company.stockPrice * change))
    updated[id] = { ...company, stockPrice: newPrice }
  }
  return { ...economy, companies: updated }
}

// ─── Price Index ───

export function calcPriceIndex(state: GameState): number {
  const economy = state.economy
  if (!economy) return 1.0
  if (economy.priceIndexMode === 'auto_increment') {
    const interval = economy.autoIncrementIntervalDays ?? 7
    if (state.day - (economy.lastAutoIncrementDay ?? 0) >= interval) {
      return economy.priceIndex + 1
    }
    return economy.priceIndex
  }
  const alive = state.players.filter((p) => !p.bankrupt).length || 1
  const totalAssets = state.players.reduce((s, p) => {
    if (p.bankrupt) return s
    let assets = p.cash + (p.bankDeposit ?? 0)
    for (const tid of p.ownedTileIds) {
      const tile = state.board.tiles.find(t => t.id === tid)
      const price = tile?.price ?? 0
      const prop = state.board.properties[tid]
      assets += prop?.mortgaged ? 0 : price
      assets += (prop?.level ?? 0) * price * 0.3
    }
    for (const shares of Object.values(p.stocks ?? {})) {
      assets += shares * 100
    }
    return s + assets
  }, 0)
  return Math.max(1, totalAssets / economy.initialCash / alive)
}

export function updatePriceIndex(state: GameState): GameState {
  const economy = state.economy
  if (!economy) return state
  const idx = calcPriceIndex(state)
  return { ...state, economy: { ...economy, priceIndex: idx } }
}

// ─── Calc Rent (price-index-aware) ───

export function calcRent(baseRent: number, priceIndex: number): number {
  return Math.floor(baseRent * priceIndex)
}
