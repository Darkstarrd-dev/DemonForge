// AI 三档难度策略实现（M8 全量）
import type { AIConfig, GameState, DecisionRequest } from '../types'
import { calcTotalAssets } from './player'

export const AI_CONFIGS: Record<string, AIConfig> = {
  easy:   { difficulty: 'easy',   purchaseThreshold: 0.5, buildThreshold: 0.5, attackCardPropensity: 0.1, targetLeader: false, considerPriceIndex: false },
  normal: { difficulty: 'normal', purchaseThreshold: 1.5, buildThreshold: 2.0, attackCardPropensity: 0.5, targetLeader: false, considerPriceIndex: false },
  hard:   { difficulty: 'hard',   purchaseThreshold: 2.0, buildThreshold: 3.0, attackCardPropensity: 0.9, targetLeader: true,  considerPriceIndex: true  },
}

function getPlayer(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId)
}

function countBuilt(state: GameState, playerId: string): number {
  return Object.values(state.board.properties).filter((p) => p.ownerId === playerId && p.level > 0).length
}

function tilesPrice(state: GameState): Record<string, number> {
  const result: Record<string, number> = {}
  for (const tile of state.board.tiles) {
    if (tile.basePrice) result[tile.id] = tile.basePrice
  }
  return result
}

function leaderId(state: GameState): string | undefined {
  const alive = state.players.filter((p) => !p.bankrupt)
  if (alive.length === 0) return undefined
  const tp = tilesPrice(state)
  return alive.reduce((best, p) => (calcTotalAssets(p, state.board.properties, tp) > calcTotalAssets(best, state.board.properties, tp) ? p : best)).id
}

function buyProperty(state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'skip'
  const price = (request.context.price as number) ?? 0
  const ratio = price > 0 ? player.cash / price : 999
  if (cfg.difficulty === 'easy') {
    if (player.cash < price * 3) return 'skip'
    if (Math.random() < 0.4) return 'skip'
    return 'buy'
  }
  if (cfg.difficulty === 'normal') {
    if (player.cash < price * 2) return 'skip'
    return price <= player.cash * 0.6 ? 'buy' : 'skip'
  }
  if (player.cash < price && player.cash + (player.bankDeposit ?? 0) >= price) return 'buy'
  if (ratio >= cfg.purchaseThreshold * 1.5) return 'buy'
  return 'skip'
}

function upgradeProperty(state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'skip'
  const cost = (request.context.cost as number) ?? 0
  if (cfg.difficulty === 'easy') {
    if (player.cash > cost * 5 && Math.random() < 0.3) return 'upgrade'
    return 'skip'
  }
  if (cfg.difficulty === 'normal') {
    if (player.cash > cost * 2 && countBuilt(state, playerId) < 5) return 'upgrade'
    return 'skip'
  }
  if (player.cash > cost * 1.2) return 'upgrade'
  return 'skip'
}

function jailChoice(state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'wait'
  const hasCard = request.options.some((o) => o.id === 'card')
  if (cfg.difficulty === 'hard') {
    if (hasCard) return 'card'
    return player.cash > 3000 ? 'pay' : 'wait'
  }
  if (cfg.difficulty === 'normal') {
    if (player.cash > 5000) return 'pay'
    if (hasCard) return 'card'
    return 'wait'
  }
  if (hasCard && Math.random() < 0.5) return 'card'
  if (player.cash > 10000 && Math.random() < 0.5) return 'pay'
  return 'wait'
}

function payOrMortgage(state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'pay'
  const amount = (request.context.amount as number) ?? 0
  if (player.cash >= amount * 2) return 'pay'
  if (cfg.difficulty === 'easy') return player.cash >= amount ? 'pay' : 'mortgage'
  if (cfg.difficulty === 'normal') {
    if (player.cash >= amount) return 'pay'
    const mortgagable = Object.entries(state.board.properties).filter(
      ([, p]) => p.ownerId === playerId && !p.mortgaged,
    ).length
    return mortgagable > 0 ? 'mortgage' : 'bankrupt'
  }
  if (player.cash >= amount * 0.5) return 'pay'
  return 'mortgage'
}

function useCard(state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return request.options[0]?.id ?? 'skip'
  const attackCards = ['card-17', 'card-18', 'card-19', 'card-06', 'card-07', 'card-08', 'card-09']
  const defenseCards = ['card-20', 'card-21', 'card-22', 'card-23', 'card-24']
  const neutralCards = ['card-00', 'card-01', 'card-02', 'card-03', 'card-04', 'card-05', 'card-10', 'card-11', 'card-12', 'card-13', 'card-14', 'card-15', 'card-16', 'card-25', 'card-26', 'card-27', 'card-28', 'card-29']
  const opts = request.options
  const attackOpts = opts.filter((o) => attackCards.includes(o.id))
  const defenseOpts = opts.filter((o) => defenseCards.includes(o.id))
  const neutralOpts = opts.filter((o) => neutralCards.includes(o.id) && !attackCards.includes(o.id) && !defenseCards.includes(o.id))
  if (cfg.difficulty === 'easy') {
    if (defenseOpts.length > 0 && Math.random() < 0.5) return defenseOpts[0].id
    if (neutralOpts.length > 0 && Math.random() < 0.7) return neutralOpts[Math.floor(Math.random() * neutralOpts.length)].id
    return 'skip'
  }
  if (cfg.difficulty === 'normal') {
    if (defenseOpts.length > 0) return defenseOpts[0].id
    if (attackOpts.length > 0 && player.cash > 5000) return attackOpts[Math.floor(Math.random() * attackOpts.length)].id
    if (neutralOpts.length > 0) return neutralOpts[Math.floor(Math.random() * neutralOpts.length)].id
    return 'skip'
  }
  if (cfg.targetLeader) {
    const lid = leaderId(state)
    if (lid && lid !== playerId && attackOpts.length > 0) return attackOpts[0].id
  }
  if (attackOpts.length > 0) return attackOpts[Math.floor(Math.random() * attackOpts.length)].id
  if (defenseOpts.length > 0) return defenseOpts[0].id
  if (neutralOpts.length > 0) return neutralOpts[Math.floor(Math.random() * neutralOpts.length)].id
  return 'skip'
}

function useItem(state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'skip'
  const deck = state.itemDeck
  const isWeapon = (optId: string) => {
    const inst = player.items?.find(i => i.instanceId === optId)
    if (!inst || !deck) return false
    const def = deck.definitions.find(d => d.id === inst.definitionId)
    return def?.category === 'WEAPON'
  }
  const isTrap = (optId: string) => {
    const inst = player.items?.find(i => i.instanceId === optId)
    if (!inst || !deck) return false
    const def = deck.definitions.find(d => d.id === inst.definitionId)
    return def?.category === 'TRAP'
  }
  const opts = request.options.filter(o => o.id !== 'skip')
  const weapons = opts.filter(o => isWeapon(o.id))
  const traps = opts.filter(o => isTrap(o.id))
  if (cfg.difficulty === 'easy') {
    if (traps.length > 0 && Math.random() < 0.3) return traps[0].id
    return 'skip'
  }
  if (cfg.difficulty === 'normal') {
    if (cfg.targetLeader && weapons.length > 0) return weapons[0].id
    if (traps.length > 0) return traps[0].id
    if (weapons.length > 0) return weapons[0].id
    return 'skip'
  }
  if (cfg.targetLeader && weapons.length > 0) return weapons[0].id
  if (weapons.length > 0) return weapons[0].id
  if (traps.length > 0 && cfg.attackCardPropensity > 0.5) return traps[0].id
  return opts[0]?.id ?? 'skip'
}

function bankOperation(state: GameState, playerId: string, _request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'skip'
  const excess = player.cash - 10000
  if (cfg.difficulty === 'easy') {
    if (excess > 20000 && Math.random() < 0.3) return 'deposit'
    return 'skip'
  }
  if (cfg.difficulty === 'normal') {
    if (excess > 10000) return 'deposit'
    if (player.cash < 3000 && (player.bankDeposit ?? 0) > 0) return 'withdraw'
    return 'skip'
  }
  if (excess > 5000) return 'deposit'
  if (player.cash < 5000 && (player.bankDeposit ?? 0) > 0) return 'withdraw'
  if (player.cash < 2000) return 'loan'
  return 'skip'
}

function stockTrade(state: GameState, playerId: string, _request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'skip'
  const stocks = player.stocks ?? {}
  if (cfg.difficulty === 'easy') {
    if (Object.keys(stocks).length > 0 && Math.random() < 0.2) return 'sell'
    return 'skip'
  }
  if (cfg.difficulty === 'normal') {
    if (player.cash > 15000) return 'buy'
    if (Object.keys(stocks).length > 0 && player.cash < 3000) return 'sell'
    return 'skip'
  }
  if (player.cash > 10000) return 'buy'
  if (Object.keys(stocks).length > 0 && player.cash < 5000) return 'sell'
  return 'skip'
}

function cardReaction(state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'ignore'
  const canCounter = request.options.some((o) => o.id !== 'ignore')
  if (!canCounter) return 'ignore'
  if (cfg.difficulty === 'easy') return Math.random() < 0.2 ? request.options[0].id : 'ignore'
  if (cfg.difficulty === 'normal') return Math.random() < 0.5 ? request.options.find((o) => o.id !== 'ignore')?.id ?? 'ignore' : 'ignore'
  return request.options.find((o) => o.id !== 'ignore')?.id ?? 'ignore'
}

function lotteryBet(state: GameState, playerId: string, _request: DecisionRequest, cfg: AIConfig): string {
  const player = getPlayer(state, playerId)
  if (!player) return 'skip'
  if (cfg.difficulty === 'easy') return 'skip'
  if (cfg.difficulty === 'normal') return player.cash > 10000 ? 'bet' : 'skip'
  return player.cash > 5000 ? 'bet' : 'skip'
}

function teleportTarget(state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const leader = leaderId(state)
  if (cfg.difficulty === 'easy') return request.options[Math.floor(Math.random() * request.options.length)]?.id ?? request.options[0]?.id ?? 'skip'
  if (cfg.difficulty === 'normal') {
    const propOpts = request.options.filter((o) => o.id.startsWith('p') || !o.id.startsWith('j'))
    if (propOpts.length > 0) return propOpts[Math.floor(Math.random() * propOpts.length)].id
    return request.options[0]?.id ?? 'skip'
  }
  if (leader && leader !== playerId) {
    const leaderProp = request.options.find((o) => o.id === leader)
    if (leaderProp) return leaderProp.id
  }
  return request.options[0]?.id ?? 'skip'
}

function magicHouseEffect(_state: GameState, _playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  const positiveOpts = request.options.filter((o) => o.preview?.cashDelta && o.preview.cashDelta > 0)
  if (cfg.difficulty === 'easy') return request.options[Math.floor(Math.random() * request.options.length)]?.id ?? request.options[0]?.id ?? 'skip'
  if (cfg.difficulty === 'normal') {
    if (positiveOpts.length > 0) return positiveOpts[0].id
    return request.options[0]?.id ?? 'skip'
  }
  if (positiveOpts.length > 0) return positiveOpts.reduce((best, o) => ((o.preview?.cashDelta ?? 0) > (best.preview?.cashDelta ?? 0) ? o : best)).id
  return request.options[0]?.id ?? 'skip'
}

function handleTrade(_state: GameState, _playerId: string, request: DecisionRequest, cfg: AIConfig): string {
  if (cfg.difficulty === 'easy') return Math.random() < 0.3 ? 'accept' : 'reject'
  if (cfg.difficulty === 'normal') return Math.random() < 0.5 ? 'accept' : 'reject'
  const toGive = request.context.giveTileIds as string[] | undefined
  const toGet = request.context.receiveTileIds as string[] | undefined
  if (toGive && toGet && toGive.length <= toGet.length && toGive.length > 0) return 'accept'
  return 'reject'
}

function choosePath(_state: GameState, _playerId: string, request: DecisionRequest, _cfg: AIConfig): string {
  void _cfg
  return request.options[Math.floor(Math.random() * request.options.length)]?.id ?? request.options[0]?.id ?? 'skip'
}

const ROUTER: Record<string, (state: GameState, playerId: string, request: DecisionRequest, cfg: AIConfig) => string> = {
  buyProperty,
  upgradeProperty,
  jailChoice,
  payOrMortgage,
  useCard,
  useItem,
  bankOperation,
  stockTrade,
  cardReaction,
  lotteryBet,
  teleportTarget,
  magicHouseEffect,
  trade: handleTrade,
  choosePath,
}

export function aiDecideWithStrategy(state: GameState, request: DecisionRequest, difficulty: 'easy' | 'normal' | 'hard'): string {
  const cfg = AI_CONFIGS[difficulty]
  const player = getPlayer(state, request.playerId)
  if (!player) return 'skip'
  const handler = ROUTER[request.kind]
  if (handler) return handler(state, request.playerId, request, cfg)
  return request.options[0]?.id ?? 'skip'
}
