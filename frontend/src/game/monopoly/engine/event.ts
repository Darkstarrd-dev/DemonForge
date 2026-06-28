import type { GameState, DecisionRequest, NewsEvent, MagicHouseEffect, FateEvent, MiniGameDef } from '../types'
import { SpaceType } from '../types'
import newsData from '../data/events/news-events.json'
import magicHouseData from '../data/events/magic-house-events.json'
import fateData from '../data/events/fate-events.json'
import miniGameData from '../data/minigames/minigame-definitions.json'

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomAlivePlayer(state: GameState, excludeId?: string): string | undefined {
  const alive = state.players.filter(p => !p.bankrupt && p.id !== excludeId)
  if (alive.length === 0) return undefined
  return pickRandom(alive).id
}

function richestPlayer(state: GameState): string | undefined {
  const alive = state.players.filter(p => !p.bankrupt)
  if (alive.length === 0) return undefined
  return alive.reduce((a, b) => (a.cash > b.cash ? a : b)).id
}

function poorestPlayer(state: GameState): string | undefined {
  const alive = state.players.filter(p => !p.bankrupt)
  if (alive.length === 0) return undefined
  return alive.reduce((a, b) => (a.cash < b.cash ? a : b)).id
}

function resolveTarget(target: string, _effectPlayerId: string, state: GameState): string[] {
  if (target === 'ALL') return state.players.filter(p => !p.bankrupt).map(p => p.id)
  if (target === 'RANDOM') {
    const pid = randomAlivePlayer(state)
    return pid ? [pid] : []
  }
  if (target === 'RICHEST') {
    const pid = richestPlayer(state)
    return pid ? [pid] : []
  }
  if (target === 'POOREST') {
    const pid = poorestPlayer(state)
    return pid ? [pid] : []
  }
  return []
}

// ─── News Events ───

function loadNewsEvents(): NewsEvent[] {
  return newsData as NewsEvent[]
}

function loadMagicHouseEffects(): MagicHouseEffect[] {
  return magicHouseData as MagicHouseEffect[]
}

function loadFateEvents(): FateEvent[] {
  return fateData as FateEvent[]
}

function loadMiniGameDefs(): MiniGameDef[] {
  return miniGameData as MiniGameDef[]
}

function applyEventEffectToPlayers(
  players: GameState['players'],
  targetIds: string[],
  effectType: string,
  value: number,
): GameState['players'] {
  return players.map(p => {
    if (!targetIds.includes(p.id)) return p
    let cash = p.cash
    switch (effectType) {
      case 'ALL_GAIN_CASH': cash += value; break
      case 'ALL_LOSE_CASH': cash = Math.max(0, cash - value); break
      case 'ALL_GAIN_PERCENT': cash = Math.floor(cash * (1 + value)); break
      case 'ALL_LOSE_PERCENT': cash = Math.floor(cash * (1 - value)); break
    }
    return { ...p, cash }
  })
}

// ─── Public event handlers ───

/**
 * 触发新闻事件：从新闻池随机选一条并应用效果。
 * 返回修改后的 state，或原 state（无人存活时）。
 */
export function handleNewsEvent(state: GameState): GameState {
  const events = loadNewsEvents()
  if (events.length === 0) return state
  const event = pickRandom(events)
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  log.push({ seq: log.length, kind: 'news', text: `📰 ${event.title}：${event.description}` })

  if (event.effect.type === 'STOCK_SURGE' || event.effect.type === 'STOCK_CRASH') {
    if (state.economy) {
      const companies = { ...state.economy.companies }
      for (const id of Object.keys(companies)) {
        const days = event.effect.type === 'STOCK_SURGE' ? 3 : 3
        companies[id] = {
          ...companies[id],
          stockLimitUpDays: event.effect.type === 'STOCK_SURGE' ? days : 0,
          stockLimitDownDays: event.effect.type === 'STOCK_CRASH' ? days : 0,
        }
      }
      return { ...state, players, log, economy: { ...state.economy, companies } }
    }
    return { ...state, players, log }
  }

  if (event.effect.type === 'PROPERTY_PRICE_UP' || event.effect.type === 'PROPERTY_PRICE_DOWN') {
    if (event.effect.type === 'PROPERTY_PRICE_UP') {
      const priceUpGroups: Record<string, number> = {}
      for (const t of state.board.tiles) {
        if (t.zoneId) priceUpGroups[t.zoneId] = 3
      }
      return { ...state, players, log, priceUpGroups }
    }
    return { ...state, players, log, priceUpGroups: undefined }
  }

  const targetIds = resolveTarget(event.effect.target, '', state)
  const updated = applyEventEffectToPlayers(players, targetIds, event.effect.type, event.effect.value)
  return { ...state, players: updated, log }
}

/**
 * 触发命运事件：从命运池随机选一条并应用效果。
 */
export function handleFateEvent(state: GameState, playerId: string): GameState {
  const events = loadFateEvents()
  if (events.length === 0) return state
  const event = pickRandom(events)
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  log.push({ seq: log.length, kind: 'fate', text: `🔮 ${event.title}：${event.description}` })

  if (event.effect === 'TELEPORT') {
    return { ...state, players, log, awaitingDecision: buildTeleportDecision(playerId, state) }
  }
  if (event.effect === 'GIVE_CARD') {
    const deck = state.cardDeck
    if (deck) {
      const player = players.find(p => p.id === playerId)
      if (player) {
        const drawPile = deck.drawPile.length > 0 ? deck.drawPile : deck.definitions.map(d => d.id)
        if (drawPile.length > 0) {
          const cardId = drawPile[Math.floor(Math.random() * drawPile.length)]
          const hand = player.hand ?? []
          if (hand.length < 15) {
            player.hand = [...hand, { definitionId: cardId, instanceId: `fate_card_${Date.now()}` }]
          }
        }
      }
    }
    return { ...state, players, log, awaitingDecision: undefined }
  }
  if (event.effect === 'SEND_TO_JAIL') {
    const days = (event.params?.days as number) ?? 3
    const player = players.find(p => p.id === playerId)
    if (player) player.inJailTurns = days
    return { ...state, players, log, awaitingDecision: undefined }
  }
  if (event.effect === 'GOD_POSSESSION') {
    log.push({ seq: log.length, kind: 'fate', text: `${players.find(p => p.id === playerId)?.name} 被随机神明附身` })
    return { ...state, players, log, awaitingDecision: undefined }
  }

  // EventEffect union
  if (typeof event.effect === 'object' && 'type' in event.effect) {
    const targetIds = resolveTarget(event.effect.target, playerId, state)
    const updated = applyEventEffectToPlayers(players, targetIds, event.effect.type, event.effect.value)
    return { ...state, players: updated, log, awaitingDecision: undefined }
  }

  return { ...state, players, log, awaitingDecision: undefined }
}

/**
 * 触发魔法屋事件：从效果池随机选一条并应用。
 */
export function handleMagicHouseEvent(state: GameState, playerId: string): GameState {
  const effects = loadMagicHouseEffects()
  if (effects.length === 0) return state
  const effect = pickRandom(effects)
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const player = players.find(p => p.id === playerId)
  if (!player) return state
  log.push({ seq: log.length, kind: 'magicHouse', text: `🏠 魔法屋：${effect.description}` })

  switch (effect.type) {
    case 'TELEPORT': {
      return { ...state, players, log, awaitingDecision: buildTeleportDecision(playerId, state) }
    }
    case 'GIVE_CARD': {
      const deck = state.cardDeck
      if (deck) {
        const drawPile = deck.drawPile.length > 0 ? deck.drawPile : deck.definitions.map(d => d.id)
        if (drawPile.length > 0) {
          const cardId = drawPile[Math.floor(Math.random() * drawPile.length)]
          const hand = player.hand ?? []
          if (hand.length < 15) {
            player.hand = [...hand, { definitionId: cardId, instanceId: `mh_card_${Date.now()}` }]
          }
        }
      }
      return { ...state, players, log, awaitingDecision: undefined }
    }
    case 'STEAL_ALL_ITEMS': {
      player.items = []
      log.push({ seq: log.length, kind: 'magicHouse', text: `${player.name} 失去所有道具` })
      return { ...state, players, log, awaitingDecision: undefined }
    }
    case 'CHANGE_VEHICLE': {
      const mode = (effect.params?.mode as string) ?? 'upgrade'
      if (mode === 'upgrade') {
        if (player.vehicle === 'PEDESTRIAN' || !player.vehicle) player.vehicle = 'MOTORCYCLE'
        else if (player.vehicle === 'MOTORCYCLE') player.vehicle = 'CAR'
      }
      return { ...state, players, log, awaitingDecision: undefined }
    }
    case 'ALL_GAIN_CASH': {
      const value = (effect.params?.value as number) ?? 500
      player.cash += value
      return { ...state, players, log, awaitingDecision: undefined }
    }
    case 'ALL_LOSE_CASH': {
      const val = (effect.params?.value as number) ?? 200
      player.cash = Math.max(0, player.cash - val)
      return { ...state, players, log, awaitingDecision: undefined }
    }
    case 'ALL_LOSE_PERCENT': {
      const pct = (effect.params?.value as number) ?? 0.5
      player.cash = Math.floor(player.cash * (1 - pct))
      return { ...state, players, log, awaitingDecision: undefined }
    }
    case 'PROPERTY_PRICE_DOWN': {
      const props = { ...state.properties }
      for (const tid of Object.keys(props)) {
        const t = Number(tid)
        const prop = props[t]
        if (prop && prop.level > 0) {
          props[t] = { ...prop, level: prop.level - 1 }
        }
      }
      log.push({ seq: log.length, kind: 'magicHouse', text: `所有地产降一级` })
      return { ...state, players, log, properties: props, awaitingDecision: undefined }
    }
    default: {
      if (effect.type.startsWith('ALL_GAIN') || effect.type.startsWith('ALL_LOSE')) {
        const value = (effect.params?.value as number) ?? 300
        if (effect.type.includes('GAIN')) player.cash += value
        else player.cash = Math.max(0, player.cash - value)
      }
      return { ...state, players, log, awaitingDecision: undefined }
    }
  }
}

/**
 * 触发宝箱事件：随机给奖励。
 */
export function handleTreasureBoxEvent(state: GameState, playerId: string): GameState {
  const rewards: Array<{ type: string; value?: number; cardId?: string; itemId?: string }> = [
    { type: 'cash', value: 500 }, { type: 'cash', value: 1000 },
    { type: 'cash', value: 200 }, { type: 'points', value: 30 },
    { type: 'points', value: 50 }, { type: 'card', cardId: 'card-20' },
    { type: 'card', cardId: 'card-00' }, { type: 'points', value: 80 },
  ]
  const reward = pickRandom(rewards)
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const player = players.find(p => p.id === playerId)
  if (!player) return state

  switch (reward.type) {
    case 'cash': {
      player.cash += reward.value ?? 500
      log.push({ seq: log.length, kind: 'treasure', text: `${player.name} 打开宝箱获得 ¥${reward.value ?? 500}` })
      break
    }
    case 'points': {
      player.points = (player.points ?? 0) + (reward.value ?? 30)
      log.push({ seq: log.length, kind: 'treasure', text: `${player.name} 打开宝箱获得 ${reward.value ?? 30} 点` })
      break
    }
    case 'card': {
      if (reward.cardId) {
        const hand = player.hand ?? []
        if (hand.length < 15) {
          player.hand = [...hand, { definitionId: reward.cardId, instanceId: `treasure_${Date.now()}` }]
          const def = state.cardDeck?.definitions.find(d => d.id === reward.cardId)
          log.push({ seq: log.length, kind: 'treasure', text: `${player.name} 打开宝箱获得卡片「${def?.name ?? reward.cardId}」` })
        } else {
          log.push({ seq: log.length, kind: 'treasure', text: `${player.name} 打开宝箱但手牌已满` })
        }
      }
      break
    }
  }

  return { ...state, players, log, awaitingDecision: undefined }
}

/**
 * 触发乐透事件：弹出投注决定。
 */
export function handleLotteryEvent(state: GameState, playerId: string): { state: GameState; decision?: DecisionRequest } {
  const log = [...state.log]
  log.push({ seq: log.length, kind: 'lottery', text: `🎰 乐透！投注 ¥200 有机会赢得大奖` })
  const decision: DecisionRequest = {
    playerId,
    kind: 'lotteryBet',
    options: [
      { id: 'bet', label: '投注 ¥200', preview: { cashDelta: -200 } },
      { id: 'skip', label: '跳过' },
    ],
    context: {},
  }
  return { state: { ...state, log }, decision }
}

/**
 * 消解乐透投注。
 */
export function resolveLottery(state: GameState, playerId: string, bet: boolean): GameState {
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const player = players.find(p => p.id === playerId)
  if (!player || !bet) {
    log.push({ seq: log.length, kind: 'lottery', text: `${player?.name ?? '玩家'} 跳过乐透` })
    return { ...state, players, log, awaitingDecision: undefined }
  }
  if (player.cash < 200) {
    log.push({ seq: log.length, kind: 'lottery', text: `${player.name} 资金不足无法投注` })
    return { ...state, players, log, awaitingDecision: undefined }
  }
  player.cash -= 200
  const win = Math.random() < 0.3
  if (win) {
    const prize = 1000 + Math.floor(Math.random() * 2000)
    player.cash += prize
    log.push({ seq: log.length, kind: 'lottery', text: `${player.name} 乐透中奖！获得 ¥${prize}` })
  } else {
    log.push({ seq: log.length, kind: 'lottery', text: `${player.name} 乐透未中奖` })
  }
  return { ...state, players, log, awaitingDecision: undefined }
}

/**
 * 触发传送事件：弹出传送目标选择决定。
 */
export function handleTeleportEvent(state: GameState, playerId: string): { state: GameState; decision: DecisionRequest } {
  const log = [...state.log]
  const player = state.players.find(p => p.id === playerId)
  log.push({ seq: log.length, kind: 'teleport', text: `🌀 ${player?.name ?? '玩家'} 进入传送格，选择传送目标` })
  const decision = buildTeleportDecision(playerId, state)
  return { state: { ...state, log }, decision }
}

function buildTeleportDecision(playerId: string, state: GameState): DecisionRequest {
  const player = state.players.find(p => p.id === playerId)
  const currentPos = player?.position ?? 0
  return {
    playerId,
    kind: 'teleportTarget',
    options: state.board.tiles
      .filter((_, i) => i !== currentPos)
      .slice(0, 20)
      .map(t => ({ id: String(t.index), label: t.name })),
    context: {},
  }
}

/**
 * 执行传送：将玩家移到目标格。
 */
export function resolveTeleport(state: GameState, playerId: string, targetTileId: number): GameState {
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const player = players.find(p => p.id === playerId)
  if (!player) return state
  const from = player.position
  player.position = targetTileId
  const tileName = state.board.tiles[targetTileId]?.name ?? `格 ${targetTileId}`
  if (targetTileId < from) {
    player.cash += 2000
    log.push({ seq: log.length, kind: 'salary', text: `${player.name} 经过起点，领取 ¥2000` })
  }
  log.push({ seq: log.length, kind: 'teleport', text: `${player.name} 传送到「${tileName}」` })
  return { ...state, players, log, awaitingDecision: undefined }
}

/**
 * 触发小游戏事件：弹出是否参与的决定。
 */
export function handleMiniGameEvent(state: GameState, playerId: string): { state: GameState; decision: DecisionRequest } {
  const games = loadMiniGameDefs()
  if (games.length === 0) {
    const log = [...state.log]
    log.push({ seq: log.length, kind: 'miniGame', text: `🎮 小游戏格，但暂无可玩的游戏` })
    return { state: { ...state, log }, decision: undefined as unknown as DecisionRequest }
  }
  const game = pickRandom(games)
  const log = [...state.log]
  log.push({ seq: log.length, kind: 'miniGame', text: `🎮 ${game.name}！参与有机会赢得奖励` })
  const decision: DecisionRequest = {
    playerId,
    kind: 'magicHouseEffect',
    options: [
      { id: 'play', label: `参加 ${game.name}`, preview: { description: '有机会赢取奖金' } },
      { id: 'skip', label: '跳过' },
    ],
    context: { gameId: game.id, gameName: game.name, rewardFormula: game.rewardFormula, penaltyFormula: game.penaltyFormula },
  }
  return { state: { ...state, log }, decision }
}

/**
 * 消解小游戏结果。
 */
export function resolveMiniGame(state: GameState, playerId: string, play: boolean): GameState {
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const player = players.find(p => p.id === playerId)
  if (!player || !play) {
    log.push({ seq: log.length, kind: 'miniGame', text: `${player?.name ?? '玩家'} 跳过小游戏` })
    return { ...state, players, log, awaitingDecision: undefined }
  }
  const score = Math.floor(Math.random() * 100) + 1
  const economy = state.economy
  const pi = economy?.priceIndex ?? 1
  const reward = Math.floor(score * pi * 80)
  const win = score > 50
  if (win) {
    player.cash += reward
    log.push({ seq: log.length, kind: 'miniGame', text: `${player.name} 在游戏中获得 ${score} 分，赢得 ¥${reward}` })
  } else {
    const penalty = Math.floor(score * pi * 40)
    player.cash = Math.max(0, player.cash - penalty)
    log.push({ seq: log.length, kind: 'miniGame', text: `${player.name} 在游戏中获得 ${score} 分，被罚 ¥${penalty}` })
  }
  return { ...state, players, log, awaitingDecision: undefined }
}

// ─── 事件格分类路由（供 turn.ts 调用）───

export type EventSpaceResult = {
  state: GameState
  needsDecision: boolean
  decision?: DecisionRequest
}

/**
 * 根据落点的 tile 类型分发到对应事件处理器。
 * turn.ts 在 handleRoll 中调用此函数。
 */
export function handleEventSpace(state: GameState, playerId: string, tileIndex: number): EventSpaceResult {
  const tile = state.board.tiles[tileIndex]
  if (!tile) return { state, needsDecision: false }

  // 优先按保留的原始 SpaceType 识别
  const st = tile.spaceType
  if (st) {
    switch (st) {
      case SpaceType.NEWS: {
        const s = handleNewsEvent(state)
        return { state: s, needsDecision: false }
      }
      case SpaceType.FATE: {
        const s = handleFateEvent(state, playerId)
        return { state: s, needsDecision: false }
      }
      case SpaceType.MAGIC_HOUSE: {
        const s = handleMagicHouseEvent(state, playerId)
        return { state: s, needsDecision: false }
      }
      case SpaceType.TREASURE_BOX: {
        const s = handleTreasureBoxEvent(state, playerId)
        return { state: s, needsDecision: false }
      }
      case SpaceType.LOTTERY: {
        const { state: s, decision } = handleLotteryEvent(state, playerId)
        return { state: s, needsDecision: true, decision }
      }
      case SpaceType.TELEPORT: {
        const { state: s, decision } = handleTeleportEvent(state, playerId)
        return { state: s, needsDecision: true, decision }
      }
      case SpaceType.MINI_GAME: {
        const { state: s, decision } = handleMiniGameEvent(state, playerId)
        return { state: s, needsDecision: !!decision, decision }
      }
      case SpaceType.BANK: {
        const log = [...state.log]
        log.push({ seq: log.length, kind: 'bank', text: `${state.players.find(p => p.id === playerId)?.name} 到达银行（存取贷）` })
        const decision: DecisionRequest = {
          playerId, kind: 'bankOperation', options: [
            { id: 'deposit', label: '存款' }, { id: 'withdraw', label: '取款' },
            { id: 'loan', label: '贷款' }, { id: 'repay', label: '还款' }, { id: 'skip', label: '离开' },
          ], context: {},
        }
        return { state: { ...state, log }, needsDecision: true, decision }
      }
      case SpaceType.SHOP: {
        const log = [...state.log]
        log.push({ seq: log.length, kind: 'shop', text: `${state.players.find(p => p.id === playerId)?.name} 到达商店` })
        const decision: DecisionRequest = {
          playerId, kind: 'useCardChoice', options: [
            { id: 'buy_card', label: '购买卡片' },
            { id: 'buy_item', label: '购买道具' },
            { id: 'skip', label: '离开' },
          ], context: { eventShop: true },
        }
        return { state: { ...state, log }, needsDecision: true, decision }
      }
    }
  }

  // 退化：按旧 TileType + chance 细分（部分地图像经典 40 格无 spaceType）
  if (!st && tile.type === 'news') return { state: handleNewsEvent(state), needsDecision: false }
  if (!st && tile.type === 'fate') return { state: handleFateEvent(state, playerId), needsDecision: false }

  return { state, needsDecision: false }
}

// ─── Route (engine.ts entry points) ───

export function handleTriggerEvent(state: GameState, action: { type: 'TRIGGER_EVENT'; eventId: string }): GameState {
  const playerId = state.turn.currentPlayerId
  if (action.eventId.startsWith('news-')) return handleNewsEvent(state)
  if (action.eventId.startsWith('fate-')) return handleFateEvent(state, playerId)
  if (action.eventId.startsWith('mh-')) return handleMagicHouseEvent(state, playerId)
  return state
}

export function handleMiniGameResult(state: GameState): GameState {
  return state
}

export function handleEventAction(state: GameState, action: { type: 'TRIGGER_EVENT' | 'MINI_GAME_RESULT'; eventId?: string }): GameState {
  if (action.type === 'TRIGGER_EVENT' && action.eventId) {
    return handleTriggerEvent(state, action as { type: 'TRIGGER_EVENT'; eventId: string })
  }
  return state
}
