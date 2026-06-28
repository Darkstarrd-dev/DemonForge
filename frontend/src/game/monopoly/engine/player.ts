// Player 子系统：破产清算 / 资产计算
import type { GameState, Player, PropertyState } from '../types'

/** 分步破产清算（§4.5）：
 *  1. 强制出售建筑回收 50% buildCost
 *  2. 抵押地产回收 50% basePrice
 *  3. 仍不足则转移产权归债权方，否则归公 */
export function liquidate(
  player: Player,
  state: GameState,
  creditorId?: string,
): { debtRemaining: number; properties: Record<string, PropertyState> } {
  const properties = { ...state.board.properties }
  let debt = Math.max(0, -player.cash)

  // Step 1: 降级建筑回收 50% buildCost
  for (const tid of [...player.ownedTileIds]) {
    if (debt <= 0) break
    const prop = properties[tid]
    if (!prop || prop.level <= 0 || prop.mortgaged) continue
    const tile = state.board.tiles.find((t) => t.id === tid)
    const buildingLevels = tile?.buildingLevels ?? []
    // 逐级降级
    while (prop.level > 0 && debt > 0) {
      const bl = buildingLevels[prop.level]
      const refund = Math.floor((bl?.buildCost ?? 0) * 0.5)
      debt -= refund
      player.cash += refund
      prop.level -= 1
      properties[tid] = { ...prop }
    }
  }

  // Step 2: 抵押地产回收 50% basePrice
  for (const tid of [...player.ownedTileIds]) {
    if (debt <= 0) break
    const prop = properties[tid]
    if (!prop || prop.mortgaged) continue
    const tile = state.board.tiles.find((t) => t.id === tid)
    const basePrice = tile?.basePrice ?? 0
    const mortgageValue = Math.floor(basePrice * 0.5)
    debt -= mortgageValue
    player.cash += mortgageValue
    properties[tid] = { ...prop, mortgaged: true }
  }

  // Step 3: 转移产权
  if (creditorId) {
    // 归债权方
    for (const tid of player.ownedTileIds) {
      const prop = properties[tid]
      properties[tid] = { ...prop, ownerId: creditorId }
    }
    const creditor = state.players.find((p) => p.id === creditorId)
    if (creditor) {
      creditor.ownedTileIds = [...creditor.ownedTileIds, ...player.ownedTileIds]
    }
  } else {
    // 归公（清空产权）
    for (const tid of player.ownedTileIds) {
      properties[tid] = { ...properties[tid], ownerId: undefined, level: 0, mortgaged: false }
    }
  }

  player.ownedTileIds = []
  player.bankrupt = true
  player.cash = 0

  return { debtRemaining: Math.max(0, debt), properties }
}

export function handleBankrupt(state: GameState): GameState {
  const players = state.players.map((p) => ({ ...p }))
  const log = [...state.log]
  const current = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!current || current.bankrupt) return state

  const { properties } = liquidate(current, { ...state, players }, undefined)
  log.push({ seq: log.length, kind: 'bankrupt', text: `${current.name} 宣告破产` })

  const alive = players.filter((p) => !p.bankrupt)
  if (alive.length <= 1) {
    const winnerId = alive[0]?.id
    const winner = players.find((p) => p.id === winnerId)
    if (winner) log.push({ seq: log.length, kind: 'win', text: `${winner.name} 获胜！` })
    return { ...state, players, board: { ...state.board, properties }, log, status: 'ended', winnerId }
  }
  return { ...state, players, board: { ...state.board, properties }, log }
}

export function calcTotalAssets(player: Player, properties: Record<string, PropertyState>, tilesPrice: Record<string, number>): number {
  let assets = player.cash
  for (const tid of player.ownedTileIds) {
    const prop = properties[tid]
    const price = tilesPrice[tid] ?? 0
    assets += prop.mortgaged ? 0 : price
    assets += prop.level * price * 0.3
  }
  assets += player.bankDeposit ?? 0
  return assets
}