// Board 子系统：地产抵押/赎回/购买/建设/租金计算
import type { Action, GameState } from '../types'

const MORTGAGE_RATE = 0.5
const REDEEM_INTEREST = 1.1

/** 完整租金计算（§4.7）：联合租金、连锁店、摩天楼、查封、涨价、住院 */
export function calculateRent(state: GameState, tileId: string): { amount: number; creditorId?: string } {
  const prop = state.board.properties[tileId]
  if (!prop || !prop.ownerId) return { amount: 0 }
  if (prop.mortgaged) return { amount: 0 }

  const owner = state.players.find((p) => p.id === prop.ownerId)
  if (!owner || owner.bankrupt) return { amount: 0 }

  // 房东住院不收租
  if (owner.isCollectingRent === false) return { amount: 0 }

  const tile = state.board.tiles.find((t) => t.id === tileId)
  if (!tile) return { amount: 0 }

  // 查封归零
  const groupId = tile.groupId
  if (groupId && state.board.sealedGroups[groupId] > 0) return { amount: 0 }

  const priceIndex = state.economy?.priceIndex ?? 1.0
  const buildingLevels = tile.buildingLevels ?? []

  // 摩天楼单独计算（level 5 = buildingLevels[5]）
  if (prop.level >= 5 && buildingLevels[5]) {
    return { amount: Math.floor(buildingLevels[5].baseRent * priceIndex), creditorId: prop.ownerId }
  }

  // 连锁店：全图同 owner 连锁店租金加总
  if (prop.isChainStore) {
    let chainRent = 0
    for (const [tid, p] of Object.entries(state.board.properties)) {
      if (p.ownerId === prop.ownerId && p.isChainStore && !p.mortgaged) {
        const ct = state.board.tiles.find((t) => t.id === tid)
        const bl = ct?.buildingLevels ?? []
        chainRent += (bl[p.level]?.baseRent ?? 0)
      }
    }
    return { amount: Math.floor(chainRent * priceIndex), creditorId: prop.ownerId }
  }

  // 小型建筑（level < 5）：同路段同方向加总
  let rent = 0
  if (groupId) {
    const group = state.board.data.groups?.find((g) => g.groupId === groupId)
    if (group) {
      for (const sid of group.spaceIds) {
        const gp = state.board.properties[sid]
        const gt = state.board.tiles.find((t) => t.id === sid)
        if (gp && gp.ownerId === prop.ownerId && !gp.isChainStore && gp.level < 5 && !gp.mortgaged) {
          const bl = gt?.buildingLevels ?? []
          rent += (bl[gp.level]?.baseRent ?? 0)
        }
      }
    }
  } else {
    // 无路段分组：只算当前地产
    rent = buildingLevels[prop.level]?.baseRent ?? 0
  }

  // 涨价翻倍
  if (groupId && state.board.priceUpGroups[groupId] > 0) {
    rent *= 2
  }

  return { amount: Math.floor(rent * priceIndex), creditorId: prop.ownerId }
}

export function handleMortgage(state: GameState, tileId: string): GameState {
  const prop = state.board.properties[tileId]
  if (!prop || !prop.ownerId || prop.mortgaged) return state
  const tile = state.board.tiles.find(t => t.id === tileId)
  if (!tile) return state
  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.board.properties }
  const log = [...state.log]
  const owner = players.find((p) => p.id === prop.ownerId)
  if (!owner) return state
  const value = Math.round(((tile.price ?? 0) * MORTGAGE_RATE) / 10) * 10
  owner.cash += value
  properties[tileId] = { ...prop, mortgaged: true }
  log.push({ seq: log.length, kind: 'mortgage', text: `${owner.name} 抵押「${tile.name}」，获得 ¥${value}` })
  return { ...state, players, board: { ...state.board, properties }, log }
}

export function handleRedeem(state: GameState, tileId: string): GameState {
  const prop = state.board.properties[tileId]
  if (!prop || !prop.ownerId || !prop.mortgaged) return state
  const tile = state.board.tiles.find(t => t.id === tileId)
  if (!tile) return state
  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.board.properties }
  const log = [...state.log]
  const owner = players.find((p) => p.id === prop.ownerId)
  if (!owner) return state
  const cost = Math.round(((tile.price ?? 0) * MORTGAGE_RATE * REDEEM_INTEREST) / 10) * 10
  if (owner.cash < cost) return state
  owner.cash -= cost
  properties[tileId] = { ...prop, mortgaged: false }
  log.push({ seq: log.length, kind: 'redeem', text: `${owner.name} 赎回「${tile.name}」，花费 ¥${cost}` })
  return { ...state, players, board: { ...state.board, properties }, log }
}

export function handleBoardAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'MORTGAGE_PROPERTY': return handleMortgage(state, action.tileId)
    case 'REDEEM_PROPERTY': return handleRedeem(state, action.tileId)
    default: return state
  }
}
