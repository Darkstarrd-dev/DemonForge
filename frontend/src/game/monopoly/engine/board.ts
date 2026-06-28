// Board 子系统：地产抵押/赎回/购买/建设
import type { Action, GameState } from '../types'

const MORTGAGE_RATE = 0.5
const REDEEM_INTEREST = 1.1

export function handleMortgage(state: GameState, tileId: number): GameState {
  const prop = state.properties[tileId]
  if (!prop || !prop.ownerId || prop.mortgaged) return state
  const tile = state.board.tiles[tileId]
  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.properties }
  const log = [...state.log]
  const owner = players.find((p) => p.id === prop.ownerId)
  if (!owner) return state
  const value = Math.round(((tile.price ?? 0) * MORTGAGE_RATE) / 10) * 10
  owner.cash += value
  properties[tileId] = { ...prop, mortgaged: true }
  log.push({ seq: log.length, kind: 'mortgage', text: `${owner.name} 抵押「${tile.name}」，获得 ¥${value}` })
  return { ...state, players, properties, log }
}

export function handleRedeem(state: GameState, tileId: number): GameState {
  const prop = state.properties[tileId]
  if (!prop || !prop.ownerId || !prop.mortgaged) return state
  const tile = state.board.tiles[tileId]
  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.properties }
  const log = [...state.log]
  const owner = players.find((p) => p.id === prop.ownerId)
  if (!owner) return state
  const cost = Math.round(((tile.price ?? 0) * MORTGAGE_RATE * REDEEM_INTEREST) / 10) * 10
  if (owner.cash < cost) return state
  owner.cash -= cost
  properties[tileId] = { ...prop, mortgaged: false }
  log.push({ seq: log.length, kind: 'redeem', text: `${owner.name} 赎回「${tile.name}」，花费 ¥${cost}` })
  return { ...state, players, properties, log }
}

export function handleBoardAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'MORTGAGE_PROPERTY': return handleMortgage(state, action.tileId)
    case 'REDEEM_PROPERTY': return handleRedeem(state, action.tileId)
    default: return state
  }
}
