// 大富翁规则引擎 —— 组合根 reducer + 初始状态构造（薄路由层）
// 引擎层零渲染依赖。随机源（rollDice）独立于 reducer，dice 经 action 传入，
// 以保持 reducer 纯、StrictMode 下重复调用安全。
//
// 子系统分拆到 engine/ 目录，本文件仅做路由派发。

import type { Action, GameState, NewGameConfig, Player, PropertyState } from './types'
import { handleRoll, handleResolveDecision, handleEndTurn } from './engine/turn'
import { handleBoardAction } from './engine/board'
import { handleBankrupt } from './engine/player'
import { handleCardAction, createCardDeck, resolveCardReaction, resolveCardChoice } from './engine/card'
import { handleItemAction, createItemDeck, resolveItemChoice, refreshItemShop, tickTimedBombs } from './engine/item'
import { handleEventAction } from './engine/event'
import { handleBankAction, handleStockAction, createInitialEconomy } from './engine/economy'
import { applyAllGodDailyEffects, tickGodDurations } from './engine/god'
import { getMapName, loadConfig } from './engine/loader'

export function createInitialState(config: NewGameConfig): GameState {
  const mapId = config.mapId ?? 'classic-40'
  const presetId = config.configPresetId ?? 'richman4-default'
  const preset = loadConfig(presetId)
  const variant = config.variant ?? preset?.variant ?? 'classic'

  // 热斗模式：将传入的 board 就地转换（PROPERTY→ATTACK_SPACE, HOSPITAL→PARK）
  let finalBoard = config.board
  if (variant === 'hot_fight') {
    finalBoard = {
      ...config.board,
      tiles: config.board.tiles.map((t) => {
        if (t.type === 'property') return { ...t, type: 'attack' as const, name: `攻击·${t.name}`, damage: 500 }
        if (t.type === 'hospital') return { ...t, type: 'parking' as const, name: '公园' }
        return t
      }),
    }
  }

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
    aiDifficulty: spec.aiDifficulty,
    hand: [],
    points: 0,
    items: [],
  }))

  const properties: Record<number, PropertyState> = {}
  for (const tile of finalBoard.tiles) {
    if (tile.type === 'property') {
      properties[tile.index] = { tileId: tile.index, level: 0, mortgaged: false }
    }
  }

  return {
    board: finalBoard,
    mapId,
    mapName: getMapName(mapId),
    players,
    properties,
    turn: { currentPlayerId: players[0].id, phase: 'ROLL', doublesCount: 0 },
    log: [{ seq: 0, kind: 'gameStart', text: '游戏开始' }],
    status: 'playing',
    day: 1,
    economy: createInitialEconomy(players.length, config.startingCash),
    cardDeck: createCardDeck(),
    itemDeck: createItemDeck(),
    config: preset,
  }
}

export function getDiceCount(vehicle?: string): number {
  if (vehicle === 'CAR') return 3
  if (vehicle === 'MOTORCYCLE') return 2
  return 2
}

export function rollDice(vehicle?: string): number[] {
  const count = getDiceCount(vehicle)
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6))
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'NEW_GAME':
      return createInitialState(action.config)
    case 'ROLL_DICE': {
      const withGodEffects = applyAllGodDailyEffects(state)
      return handleRoll(withGodEffects, action.dice)
    }
    case 'RESOLVE_DECISION': {
      const ak = state.awaitingDecision?.kind
      if (ak === 'cardReaction') return resolveCardReaction(state, action.optionId)
      if (ak === 'useCardChoice') {
        const ctx = state.awaitingDecision?.context
        if (ctx?.itemDefId) return resolveItemChoice(state, action.optionId)
        return resolveCardChoice(state, action.optionId)
      }
      return handleResolveDecision(state, action.optionId)
    }
    case 'MORTGAGE_PROPERTY':
    case 'REDEEM_PROPERTY':
      return handleBoardAction(state, action)
    case 'DECLARE_BANKRUPT':
      return handleBankrupt(state)
    case 'USE_CARD':
      return handleCardAction(state, action)
    case 'BUY_CARD':
      return handleCardAction(state, action)
    case 'USE_ITEM':
    case 'BUY_ITEM':
      return handleItemAction(state, action)
    case 'BANK_DEPOSIT':
    case 'BANK_WITHDRAW':
    case 'BANK_LOAN':
    case 'BANK_REPAY':
      return handleBankAction(state, action)
    case 'BUY_STOCK':
    case 'SELL_STOCK':
      return handleStockAction(state, action)
    case 'TRIGGER_EVENT':
    case 'MINI_GAME_RESULT':
      return handleEventAction(state, action)
    case 'END_TURN': {
      let s = handleEndTurn(state)
      s = tickGodDurations(s)
      s = tickTimedBombs(s)
      if (s.itemDeck) s = { ...s, itemDeck: refreshItemShop(s.itemDeck, s.day ?? 1) }
      return s
    }
    default:
      return state
  }
}

export { handleMortgage, handleRedeem } from './engine/board'
export { createCardDeck, findCardDef, giveCardToPlayer, refreshShop, resolveCardReaction, resolveCardChoice } from './engine/card'
export { createItemDeck, findItemDef, handleBuyItem, handleUseItem, resolveItemChoice, buildItemChoiceDecision, resolveTraps, tickTimedBombs, refreshItemShop, ITEM_HAND_LIMIT } from './engine/item'
export { aiDecide, aiNextAction, aiDecideAsync, configureAIController, resetAIController } from './engine/ai'
export { aiDecideWithStrategy, AI_CONFIGS } from './engine/ai-strategies'
export { buildLLMMessages } from './engine/ai-llm'
export type { LLMDecisionFn } from './engine/ai-llm'
export { liquidate, calcTotalAssets } from './engine/player'
export { calcPriceIndex, calcRent, updatePriceIndex, handleDividend, handleDeposit, handleWithdraw, handleLoan, handleRepay, handleBuyStock, handleSellStock, createInitialEconomy, fluctuateStockPrices } from './engine/economy'
export { handleCompanyLand, getCompanyState } from './engine/company'
export { applyAllGodDailyEffects, tickGodDurations, applyPlayerGodDailyEffect, findGodDef, loadGodDefinitions, summonNearestGod, getGodMoveBoost, handleGodPossession, handleGodDismiss, calcGodModifiedRent } from './engine/god'
export { validateMapData, validateMapConnectivity } from './engine/validator'
export { loadMapData, loadAllMaps, getMapIds, getMapName, getMapList, boardDataToBoardConfig } from './engine/loader'
