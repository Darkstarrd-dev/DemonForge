// 大富翁规则引擎 —— 组合根 reducer + 初始状态构造（薄路由层）
// 引擎层零渲染依赖。随机源（rollDice）独立于 reducer，dice 经 action 传入，
// 以保持 reducer 纯、StrictMode 下重复调用安全。
//
// 子系统分拆到 engine/ 目录，本文件仅做路由派发。

import type { Action, GameState, NewGameConfig, Player, PropertyState } from './types'
import { handleRoll, handleResolveDecision, handleEndTurn } from './engine/turn'
import { handleBoardAction } from './engine/board'
import { handleBankrupt } from './engine/player'
import { handleCardAction } from './engine/card'
import { handleItemAction } from './engine/item'
import { handleEventAction } from './engine/event'

export function createInitialState(config: NewGameConfig): GameState {
  const players: Player[] = config.players.map((spec, i) => ({
    id: `p${i + 1}`,
    name: spec.name,
    color: spec.color,
    cash: config.startingCash,
    position: 0,
    inJailTurns: 0,
    ownedTileIds: [],
    bankrupt: false,
    characterCardId: spec.characterCardId,
    controller: spec.controller,
    aiNodeId: spec.aiNodeId,
  }))

  const properties: Record<number, PropertyState> = {}
  for (const tile of config.board.tiles) {
    if (tile.type === 'property') {
      properties[tile.index] = { tileId: tile.index, level: 0, mortgaged: false }
    }
  }

  return {
    board: config.board,
    players,
    properties,
    turn: { currentPlayerId: players[0].id, phase: 'ROLL', doublesCount: 0 },
    log: [{ seq: 0, kind: 'gameStart', text: '游戏开始' }],
    status: 'playing',
  }
}

export function rollDice(): [number, number] {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'NEW_GAME':
      return createInitialState(action.config)
    case 'ROLL_DICE':
      return handleRoll(state, action.dice)
    case 'RESOLVE_DECISION':
      return handleResolveDecision(state, action.optionId)
    case 'MORTGAGE_PROPERTY':
    case 'REDEEM_PROPERTY':
      return handleBoardAction(state, action)
    case 'DECLARE_BANKRUPT':
      return handleBankrupt(state)
    case 'USE_CARD':
    case 'BUY_CARD':
      return handleCardAction(state, action)
    case 'USE_ITEM':
    case 'BUY_ITEM':
      return handleItemAction(state, action)
    case 'TRIGGER_EVENT':
    case 'MINI_GAME_RESULT':
      return handleEventAction(state, action)
    case 'END_TURN':
      return handleEndTurn(state)
    default:
      return state
  }
}

export { handleMortgage, handleRedeem } from './engine/board'
export { aiDecide, aiNextAction } from './engine/ai'
export { liquidate, calcTotalAssets } from './engine/player'
export { calcPriceIndex, calcRent } from './engine/economy'
export { validateMapData, validateMapConnectivity } from './engine/validator'
export { loadMapData, loadAllMaps, getMapIds } from './engine/loader'
