// 大富翁规则引擎 —— 组合根 reducer + 初始状态构造（薄路由层）
// 引擎层零渲染依赖。随机源（rollDice）独立于 reducer，dice 经 action 传入，
// 以保持 reducer 纯、StrictMode 下重复调用安全。
//
// Phase 0 统一后：基于 BoardState + TurnContext + string ID

import type { Action, GameState, NewGameConfig, Player } from './types'
import { GamePhase, TurnPhaseV2 } from './types'
import { handleRoll, handleResolveDecision, handleEndTurn } from './engine/turn'
import { handleBoardAction } from './engine/board'
import { handleBankrupt } from './engine/player'
import { handleCardAction, createCardDeck, resolveCardReaction, resolveCardChoice } from './engine/card'
import { handleItemAction, createItemDeck, resolveItemChoice, refreshItemShop, tickTimedBombs } from './engine/item'
import { handleEventAction } from './engine/event'
import { handleBankAction, handleStockAction, createInitialEconomy, updatePriceIndex, handleDividend } from './engine/economy'
import { applyAllGodDailyEffects, tickGodDurations } from './engine/god'
import { getMapName, loadConfig, createBoardState, loadMapData } from './engine/loader'

export function createInitialState(config: NewGameConfig): GameState {
  const mapId = config.mapId
  const presetId = config.configPresetId ?? 'richman4-default'
  const preset = loadConfig(presetId)
  const variant = config.variant ?? preset?.variant ?? 'classic'

  const { boardData } = loadMapData(mapId)

  // 热斗模式转换
  const finalBoardData = variant === 'hot_fight'
    ? {
        ...boardData,
        tiles: boardData.tiles.map((t) => {
          if (t.type === 'PROPERTY') return { ...t, type: 'ATTACK_SPACE' as const, name: `攻击·${t.name}`, damage: 500 }
          if (t.type === 'HOSPITAL') return { ...t, type: 'PARK' as const, name: '公园' }
          return t
        }),
      }
    : boardData

  const board = createBoardState(finalBoardData)

  const players: Player[] = config.players.map((spec, i) => ({
    id: `p${i + 1}`,
    name: spec.name,
    color: spec.color,
    cash: config.startingCash,
    position: board.tiles[0]?.id ?? '',
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

  return {
    version: '1.0',
    mapId,
    mapName: getMapName(mapId),
    day: 1,
    phase: GamePhase.PLAYING,
    board,
    players,
    turnContext: {
      currentPlayerId: players[0].id,
      phase: TurnPhaseV2.TURN_START,
      diceResults: [],
      diceCount: 2,
      moveSteps: 0,
      movePath: [],
      consecutiveDoubles: 0,
    },
    economy: createInitialEconomy(players.length, config.startingCash),
    cardDeck: createCardDeck(),
    itemDeck: createItemDeck(),
    config: preset ?? (() => { throw new Error(`未知配置预设: ${presetId}`) })(),
    log: [{ seq: 0, kind: 'gameStart', text: '游戏开始' }],
    status: 'playing',
  }
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'NEW_GAME':
      return createInitialState(action.config)
    case 'LOAD_GAME': {
      const loaded = action.save.gameState
      return { ...JSON.parse(JSON.stringify(loaded)) } as GameState
    }
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
      s = updatePriceIndex(s)
      s = handleDividend(s)
      s = tickGodDurations(s)
      s = tickTimedBombs(s)
      s = { ...s, itemDeck: refreshItemShop(s.itemDeck, s.day) }
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
export { serializeGame, deserializeGame, extractSaveMeta, generateSaveId, validateSaveIntegrity } from './engine/serializer'
export { createSaveStorage } from './engine/saveStorage'
export type { SaveStorage } from './engine/saveStorage'
export { buildLLMMessages } from './engine/ai-llm'
export type { LLMDecisionFn } from './engine/ai-llm'
export { liquidate, calcTotalAssets } from './engine/player'
export { calcPriceIndex, calcRent, updatePriceIndex, handleDividend, handleDeposit, handleWithdraw, handleLoan, handleRepay, handleBuyStock, handleSellStock, createInitialEconomy, fluctuateStockPrices } from './engine/economy'
export { handleCompanyLand, getCompanyState } from './engine/company'
export { applyAllGodDailyEffects, tickGodDurations, applyPlayerGodDailyEffect, findGodDef, loadGodDefinitions, summonNearestGod, getGodMoveBoost, handleGodPossession, handleGodDismiss, calcGodModifiedRent } from './engine/god'
export { validateMapData, validateMapConnectivity } from './engine/validator'
export { loadMapData, loadAllMaps, getMapIds, getMapName, getMapList, boardDataToBoardConfig, createBoardState } from './engine/loader'
export { rollDice, getDiceCount } from './engine/dice'
