// Player 子系统：破产清算 / 资产计算
import type { GameState, Player, PropertyState } from '../types'

export function liquidate(player: Player, properties: Record<string, PropertyState>) {
  for (const tid of player.ownedTileIds) {
    properties[tid] = { ...properties[tid], ownerId: undefined, level: 0, mortgaged: false }
  }
  player.ownedTileIds = []
  player.bankrupt = true
}

export function handleBankrupt(state: GameState): GameState {
  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.board.properties }
  const log = [...state.log]
  const current = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!current || current.bankrupt) return state

  liquidate(current, properties)
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
