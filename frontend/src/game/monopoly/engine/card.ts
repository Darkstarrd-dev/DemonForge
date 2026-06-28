import type { GameState, Action, CardDefinition, CardDeckState, CardInstance, Player, DecisionRequest } from '../types'
import { CardEffectType } from '../types'
import cardsData from '../data/cards/richman4-cards.json'
import { summonNearestGod, findGodDef } from './god'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let _instanceCounter = 0
function nextInstanceId(): string {
  return `ci_${++_instanceCounter}`
}

export function createCardDeck(): CardDeckState {
  const definitions = cardsData as CardDefinition[]
  const drawPile = shuffle(definitions.map(d => d.id).concat(definitions.map(d => d.id)))
  const shopCards = shuffle([...definitions]).slice(0, 6)
  return {
    definitions,
    drawPile,
    discardPile: [],
    shopInventory: { availableCards: shopCards.map(d => d.id), refreshOnDay: 3 },
  }
}

export function findCardDef(cardDefId: string, deck: CardDeckState): CardDefinition | undefined {
  return deck.definitions.find(d => d.id === cardDefId)
}

// ─── Buy Card ───

export function handleBuyCard(state: GameState, action: Action & { type: 'BUY_CARD' }): GameState {
  const deck = state.cardDeck
  if (!deck) return state
  const players = state.players.map(p => ({ ...p }))
  const player = players.find(p => p.id === state.turn.currentPlayerId)
  if (!player || player.bankrupt) return state
  const def = findCardDef(action.cardDefId, deck)
  if (!def) return state
  if (!deck.shopInventory.availableCards.includes(def.id)) return state
  const points = player.points ?? 0
  if (points < def.pointCost) return state
  const handLen = (player.hand ?? []).length
  if (handLen >= 15) return state
  const cardInst: CardInstance = { definitionId: def.id, instanceId: nextInstanceId() }
  player.points = points - def.pointCost
  player.hand = [...(player.hand ?? []), cardInst]
  const log = [...state.log, {
    seq: state.log.length, kind: 'buyCard',
    text: `${player.name} 购买卡片「${def.name}」（花费 ${def.pointCost} 点）`,
  }]
  return { ...state, players, log }
}

// ─── Draw Card (from draw pile, e.g. treasure box / fate) ───

function drawCard(deck: CardDeckState): { deck: CardDeckState; cardId?: string } {
  if (deck.drawPile.length === 0) {
    const reshuffled = shuffle(deck.discardPile)
    return { deck: { ...deck, drawPile: reshuffled, discardPile: [] }, cardId: undefined }
  }
  const [top, ...rest] = deck.drawPile
  return { deck: { ...deck, drawPile: rest, discardPile: [...deck.discardPile, top] }, cardId: top }
}

export function giveCardToPlayer(player: Player, defId: string, deck: CardDeckState): { player: Player; deck: CardDeckState } {
  const hand = player.hand ?? []
  if (hand.length >= 15) return { player, deck }
  const d = drawCard(deck)
  const drawnCardId = d.cardId ?? defId
  return {
    player: { ...player, hand: [...hand, { definitionId: drawnCardId, instanceId: nextInstanceId() }] },
    deck: d.deck,
  }
}

// ─── Effect Application (shared between direct use and counter-resolve) ───

interface PendingEffect {
  effectType: CardEffectType
  targetId?: string
  targetTileId?: number
  playerId: string
  cardDefId: string
}

function applyCardEffect(
  state: GameState,
  effect: PendingEffect,
): GameState {
  const players = state.players.map(p => ({ ...p }))
  const properties = { ...state.properties }
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const player = players.find(p => p.id === effect.playerId)
  if (!player) return state
  const deck = state.cardDeck
  const def = deck ? findCardDef(effect.cardDefId, deck) : undefined
  const cardName = def?.name ?? effect.cardDefId
  const targetId = effect.targetId
  const targetTileId = effect.targetTileId
  let finalState: GameState = { ...state, players, properties, log }

  switch (effect.effectType) {
    case CardEffectType.EQUALIZE_CASH_ALL: {
      const alive = players.filter(p => !p.bankrupt)
      const total = alive.reduce((s, p) => s + p.cash, 0)
      const avg = Math.floor(total / alive.length)
      for (const p of alive) p.cash = avg
      pushLog('useCard', `${player.name} 使用「${cardName}」，所有玩家现金均分至 ¥${avg}`)
      break
    }
    case CardEffectType.TAX_TARGET: {
      const amount = (def?.effectParams.amount as number) ?? 500
      for (const p of players) {
        if (!p.bankrupt && p.id !== player.id) {
          const paid = Math.min(p.cash, amount)
          p.cash -= paid
          player.cash += paid
        }
      }
      pushLog('useCard', `${player.name} 使用「${cardName}」，向其他玩家收取 ¥${amount}`)
      break
    }
    case CardEffectType.SEND_TO_JAIL: {
      if (targetId) {
        const target = players.find(p => p.id === targetId)
        if (target && !target.bankrupt) {
          target.inJailTurns = 3
          pushLog('useCard', `${player.name} 使用「${cardName}」，将 ${target.name} 送入监狱`)
        }
      }
      break
    }
    case CardEffectType.FREEZE:
    case CardEffectType.STOP_TURN: {
      if (targetId) {
        const target = players.find(p => p.id === targetId)
        if (target && !target.bankrupt) {
          target.skipTurns = (target.skipTurns ?? 0) + 1
          pushLog('useCard', `${player.name} 使用「${cardName}」，${target.name} 停一回合`)
        }
      }
      break
    }
    case CardEffectType.SLOW_TURTLE: {
      if (targetId) {
        const target = players.find(p => p.id === targetId)
        if (target && !target.bankrupt) {
          target.vehicle = 'PEDESTRIAN'
          pushLog('useCard', `${player.name} 使用「${cardName}」，减慢 ${target.name} 移动速度`)
        }
      }
      break
    }
    case CardEffectType.FREE_PASS: {
      player.isCollectingRent = false
      pushLog('useCard', `${player.name} 使用「${cardName}」，本次免疫`)
      break
    }
    case CardEffectType.STEAL_CARD_ITEM: {
      if (targetId) {
        const target = players.find(p => p.id === targetId)
        if (target) {
          const th = target.hand ?? []
          if (th.length > 0) {
            const stolen = th[0]
            target.hand = th.slice(1)
            player.hand = [...(player.hand ?? []), stolen]
            pushLog('useCard', `${player.name} 使用「${cardName}」，从 ${target.name} 抢走一张卡片`)
          }
        }
      }
      break
    }
    case CardEffectType.DEMOLISH_ONE: {
      if (targetTileId !== undefined) {
        const prop = properties[targetTileId]
        if (prop && prop.level > 0) {
          prop.level -= 1
          pushLog('useCard', `${player.name} 使用「${cardName}」，拆除地产一级`)
        }
      }
      break
    }
    case CardEffectType.UPGRADE_GROUP: {
      const ownProp = Object.entries(properties)
        .filter(([, p]) => p.ownerId === player.id && p.level < 4)
      for (const [tidStr, prop] of ownProp) {
        const tid = Number(tidStr)
        const tile = state.board.tiles[tid]
        const cost = tile?.upgradeCost ?? 0
        if (player.cash >= cost) {
          player.cash -= cost
          prop.level += 1
        }
      }
      pushLog('useCard', `${player.name} 使用「${cardName}」，升级自有地产`)
      break
    }
    case CardEffectType.DOWNGRADE_ONE: {
      if (targetTileId !== undefined) {
        const prop = properties[targetTileId]
        if (prop && prop.level > 0) {
          prop.level -= 1
          pushLog('useCard', `${player.name} 使用「${cardName}」，降级地产`)
        }
      }
      break
    }
    case CardEffectType.CONVERT_CHAIN_STORE: {
      if (targetTileId !== undefined) {
        const prop = properties[targetTileId]
        if (prop && prop.ownerId === player.id) {
          prop.isChainStore = true
          pushLog('useCard', `${player.name} 使用「${cardName}」，改为连锁店`)
        }
      }
      break
    }
    case CardEffectType.FORCE_PURCHASE: {
      if (targetTileId !== undefined) {
        const prop = properties[targetTileId]
        if (prop && !prop.ownerId) {
          const tile = state.board.tiles[targetTileId]
          const price = tile?.price ?? 0
          if (player.cash >= price) {
            player.cash -= price
            prop.ownerId = player.id
            player.ownedTileIds = [...player.ownedTileIds, targetTileId]
            pushLog('useCard', `${player.name} 使用「${cardName}」，强制购买 ¥${price}`)
          }
        }
      }
      break
    }
    case CardEffectType.SWAP_LAND: {
      if (targetId && targetTileId !== undefined) {
        const target = players.find(p => p.id === targetId)
        const prop = properties[targetTileId]
        if (target && prop && prop.ownerId === target.id) {
          prop.ownerId = player.id
          player.ownedTileIds = [...player.ownedTileIds.filter(x => x !== targetTileId), targetTileId]
          target.ownedTileIds = target.ownedTileIds.filter(x => x !== targetTileId)
          pushLog('useCard', `${player.name} 使用「${cardName}」，与 ${target.name} 交换地产`)
        }
      }
      break
    }
    case CardEffectType.SWAP_BUILDING: {
      if (targetId && targetTileId !== undefined) {
        const target = players.find(p => p.id === targetId)
        const prop = properties[targetTileId]
        if (target && prop && prop.ownerId) {
          const otherTid = player.ownedTileIds.find(t => (properties[t]?.level ?? 0) > 0)
          if (otherTid !== undefined) {
            const otherLevel = properties[otherTid].level
            properties[otherTid] = { ...properties[otherTid], level: prop.level }
            prop.level = otherLevel
            pushLog('useCard', `${player.name} 使用「${cardName}」，交换建筑等级`)
          }
        }
      }
      break
    }
    case CardEffectType.FORCE_AUCTION: {
      if (targetId) {
        const target = players.find(p => p.id === targetId)
        if (target) {
          const owned = target.ownedTileIds.filter(t => properties[t]?.ownerId === target.id)
          if (owned.length > 0) {
            const tid = owned[0]
            const prop = properties[tid]
            prop.ownerId = undefined
            prop.level = 0
            target.ownedTileIds = target.ownedTileIds.filter(x => x !== tid)
            pushLog('useCard', `${player.name} 使用「${cardName}」，${target.name} 的地产被拍卖`)
          }
        }
      }
      break
    }
    case CardEffectType.PRICE_UP_GROUP: {
      if (targetTileId !== undefined) {
        const tile = state.board.tiles[targetTileId]
        const gid = tile?.zoneId
        if (gid) {
          finalState = {
            ...finalState,
            priceUpGroups: { ...(finalState.priceUpGroups ?? {}), [gid]: (def?.effectParams.days as number) ?? 3 },
          }
          pushLog('useCard', `${player.name} 使用「${cardName}」，路段 ${gid} 涨价`)
        }
      }
      break
    }
    case CardEffectType.SEAL_GROUP: {
      if (targetTileId !== undefined) {
        const tile = state.board.tiles[targetTileId]
        const gid = tile?.zoneId
        if (gid) {
          finalState = {
            ...finalState,
            sealedGroups: { ...(finalState.sealedGroups ?? {}), [gid]: (def?.effectParams.days as number) ?? 3 },
          }
          pushLog('useCard', `${player.name} 使用「${cardName}」，查封路段 ${gid}`)
        }
      }
      break
    }
    case CardEffectType.STOCK_UP: {
      if (state.economy) {
        const companies = { ...state.economy.companies }
        for (const id of Object.keys(companies)) {
          companies[id] = { ...companies[id], stockLimitUpDays: 3 }
        }
        finalState = { ...finalState, economy: { ...state.economy, companies } }
        pushLog('useCard', `${player.name} 使用「${cardName}」，股市涨停`)
      }
      break
    }
    case CardEffectType.STOCK_DOWN: {
      if (state.economy) {
        const companies = { ...state.economy.companies }
        for (const id of Object.keys(companies)) {
          companies[id] = { ...companies[id], stockLimitDownDays: 3 }
        }
        finalState = { ...finalState, economy: { ...state.economy, companies } }
        pushLog('useCard', `${player.name} 使用「${cardName}」，股市跌停`)
      }
      break
    }
    case CardEffectType.SUMMON_GOD: {
      const godId = summonNearestGod({ ...state, players, properties, log })
      if (godId) {
        const godDef = findGodDef(godId)
        if (godDef) {
          player.godId = godId
          player.godRemainingDays = godDef.durationDays
          pushLog('useCard', `${player.name} 使用「${cardName}」，召唤「${godDef.name}」附身`)
        }
      } else {
        pushLog('useCard', `${player.name} 使用「${cardName}」，但没有神明回应`)
      }
      break
    }
    case CardEffectType.DISMISS_GOD: {
      if (player.godId) {
        const godDef = findGodDef(player.godId)
        if (godDef && !godDef.canDismiss) {
          pushLog('useCard', `${player.name} 使用「${cardName}」，但该神明不可送走`)
        } else {
          pushLog('useCard', `${player.name} 使用「${cardName}」，送走附身神明`)
          player.godId = undefined
          player.godRemainingDays = 0
        }
      }
      break
    }
    case CardEffectType.ALLIANCE: {
      pushLog('useCard', `${player.name} 使用「${cardName}」，寻求同盟（M6 实现）`)
      break
    }
    default:
      pushLog('useCard', `${player.name} 使用「${cardName}」（效果未实现）`)
  }

  return { ...finalState, players, properties, log, awaitingDecision: undefined }
}

// ─── Use Card (two-phase: remove from hand → check counter → apply effect) ───

export function handleUseCard(state: GameState, action: Action & { type: 'USE_CARD' }): GameState {
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const player = players.find(p => p.id === state.turn.currentPlayerId)
  if (!player || player.bankrupt) return state
  const deck = state.cardDeck
  if (!deck) return state
  const hand = player.hand ?? []
  const idx = hand.findIndex(c => c.instanceId === action.cardInstanceId)
  if (idx === -1) return state
  const inst = hand[idx]
  const def = findCardDef(inst.definitionId, deck)
  if (!def) return state

  // Remove card from hand
  player.hand = hand.filter((_, i) => i !== idx)
  pushLog('useCard', `${player.name} 使用「${def.name}」`)

  const pending: PendingEffect = {
    effectType: def.effectType,
    targetId: action.targetId,
    targetTileId: action.targetTileId,
    playerId: player.id,
    cardDefId: def.id,
  }

  // Check if effect needs player choice (only if target not already specified)
  const needsChoice = !action.targetId && !action.targetTileId
  if (needsChoice) {
    const choiceDecision = buildCardChoiceDecision(def, player.id, state)
    if (choiceDecision) {
      return {
        ...state, players, log,
        awaitingDecision: {
          ...choiceDecision,
          context: { ...choiceDecision.context, pendingEffect: pending },
        },
      }
    }
  }

  // Check for counter: if card targets an opponent who has counter cards
  const targetId = action.targetId
  if (targetId && def.counterCards.length > 0) {
    const target = players.find(p => p.id === targetId)
    if (target) {
      const targetHand = target.hand ?? []
      const hasCounter = targetHand.some(c => def.counterCards.includes(c.definitionId))
      if (hasCounter) {
        const options = targetHand
          .filter(c => def.counterCards.includes(c.definitionId))
          .map(c => {
            const cdef = findCardDef(c.definitionId, deck)
            return { id: c.instanceId, label: `使用「${cdef?.name ?? c.definitionId}」反制` }
          })
        return {
          ...state, players, log,
          awaitingDecision: {
            playerId: targetId,
            kind: 'cardReaction',
            options: [
              { id: '__ignore__', label: '承受效果' },
              ...options,
            ],
            context: { pendingEffect: pending, sourceCardDefId: def.id, sourcePlayerId: player.id },
            cardUseWindowFor: def.id,
          },
        }
      }
    }
  }

  // No counter → apply effect directly
  const afterEffect = applyCardEffect({ ...state, players, log }, pending)
  return afterEffect
}

// ─── Resolve Card Reaction ───

export function resolveCardReaction(state: GameState, optionId: string): GameState {
  const d = state.awaitingDecision
  if (!d || d.kind !== 'cardReaction') return state
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const player = players.find(p => p.id === d.playerId)
  if (!player) return state

  const pending = d.context.pendingEffect as PendingEffect | undefined
  if (!pending) return { ...state, players, log, awaitingDecision: undefined }

  if (optionId === '__ignore__') {
    log.push({ seq: log.length, kind: 'cardReaction', text: `${player.name} 选择承受攻击效果` })
    const afterEffect = applyCardEffect({ ...state, players, log }, pending)
    return { ...afterEffect, awaitingDecision: undefined }
  }

  // Counter: use the selected card
  const hand = player.hand ?? []
  const idx = hand.findIndex(c => c.instanceId === optionId)
  if (idx === -1) return { ...state, players, log, awaitingDecision: undefined }
  const inst = hand[idx]
  const deck = state.cardDeck
  if (!deck) return state
  const def = findCardDef(inst.definitionId, deck)
  if (!def) return state

  // Consume the counter card
  player.hand = hand.filter((_, i) => i !== idx)
  log.push({ seq: log.length, kind: 'cardReaction', text: `${player.name} 使用「${def.name}」反制！` })

  if (def.effectType === CardEffectType.IMMUNITY) {
    log.push({ seq: log.length, kind: 'cardReaction', text: `攻击被 ${player.name} 免疫！` })
    return { ...state, players, log, awaitingDecision: undefined }
  }
  if (def.effectType === CardEffectType.FRAME_TRANSFER) {
    const sourcePlayerId = d.context.sourcePlayerId as string
    const remaining = players.filter(p => p.id !== player.id && p.id !== sourcePlayerId && !p.bankrupt)
    if (remaining.length > 0) {
      const newTarget = remaining[Math.floor(Math.random() * remaining.length)]
      // Transfer the pending effect to new target
      const transferred = { ...pending, targetId: newTarget.id }
      const afterEffect = applyCardEffect({ ...state, players, log }, transferred)
      log.push({ seq: log.length, kind: 'cardReaction', text: `攻击被转嫁给 ${newTarget.name}！` })
      return { ...afterEffect, awaitingDecision: undefined }
    }
    return { ...state, players, log, awaitingDecision: undefined }
  }
  if (def.effectType === CardEffectType.REVENGE) {
    const sourcePlayerId = d.context.sourcePlayerId as string
    const source = players.find(p => p.id === sourcePlayerId)
    if (source && !source.bankrupt) {
      source.inJailTurns = 3
      log.push({ seq: log.length, kind: 'cardReaction', text: `${source.name} 被反击送入监狱！` })
    }
    return { ...state, players, log, awaitingDecision: undefined }
  }

  return { ...state, players, log, awaitingDecision: undefined }
}

// ─── Card Choice Resolution (for effects needing player choice) ───

export function resolveCardChoice(state: GameState, optionId: string): GameState {
  const d = state.awaitingDecision
  if (!d || d.kind !== 'useCardChoice') return state
  const players = state.players.map(p => ({ ...p }))
  const properties = { ...state.properties }
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const player = players.find(p => p.id === d.playerId)
  if (!player) return state
  const effect = d.context.cardEffect as string
  const cardName = d.context.cardName as string

  // Handle movement choices directly
  if (effect === 'MOVE_FORWARD') {
    const steps = parseInt(optionId, 10)
    const size = state.board.size
    const from = player.position
    const to = (from + steps) % size
    if (from + steps >= size) {
      player.cash += 2000
      pushLog('salary', `${player.name} 经过起点，领取 ¥2000`)
    }
    player.position = to
    pushLog('move', `${player.name} 使用「${cardName}」前进 ${steps} 步`)
    return { ...state, players, properties, log, awaitingDecision: undefined }
  }
  if (effect === 'MOVE_BACKWARD') {
    const steps = parseInt(optionId, 10)
    const size = state.board.size
    const from = player.position
    player.position = ((from - steps) % size + size) % size
    pushLog('move', `${player.name} 使用「${cardName}」后退 ${steps} 步`)
    return { ...state, players, properties, log, awaitingDecision: undefined }
  }
  if (effect === 'TELEPORT_TO_SPACE') {
    const targetIdx = parseInt(optionId, 10)
    const from = player.position
    player.position = targetIdx
    if (targetIdx < from) {
      player.cash += 2000
      pushLog('salary', `${player.name} 经过起点，领取 ¥2000`)
    }
    pushLog('move', `${player.name} 使用「${cardName}」传送到目标格`)
    return { ...state, players, properties, log, awaitingDecision: undefined }
  }

  // For other effects, pass the choice as target parameter to applyCardEffect
  const pending = d.context.pendingEffect as PendingEffect | undefined
  if (pending) {
    let updatedPending = { ...pending }
    if (effect === 'DEMOLISH_ONE' || effect === 'FORCE_AUCTION') {
      updatedPending = { ...updatedPending, targetTileId: parseInt(optionId, 10) }
    } else if (effect === 'SEND_TO_JAIL' || effect === 'FREEZE') {
      updatedPending = { ...updatedPending, targetId: optionId }
    }
    const afterEffect = applyCardEffect({ ...state, players, properties, log }, updatedPending)
    return { ...afterEffect, awaitingDecision: undefined }
  }

  return { ...state, players, properties, log, awaitingDecision: undefined }
}

// ─── Refresh Shop ───

export function refreshShop(deck: CardDeckState, day: number): CardDeckState {
  if (day % deck.shopInventory.refreshOnDay !== 0) return deck
  const shuffled = shuffle([...deck.definitions])
  return {
    ...deck,
    shopInventory: {
      ...deck.shopInventory,
      availableCards: shuffled.slice(0, 6).map(d => d.id),
    },
  }
}

// ─── Build Card Choice Decision (for effects that need player selection before applying) ───

function buildCardChoiceDecision(def: CardDefinition, playerId: string, state: GameState): DecisionRequest | undefined {
  const effect = def.effectType
  switch (effect) {
    case CardEffectType.MOVE_FORWARD:
      return {
        playerId, kind: 'useCardChoice',
        options: [
          { id: '1', label: '1 步' }, { id: '2', label: '2 步' },
          { id: '3', label: '3 步' }, { id: '4', label: '4 步' },
          { id: '5', label: '5 步' }, { id: '6', label: '6 步' },
        ],
        context: { cardEffect: 'MOVE_FORWARD', cardName: def.name },
      }
    case CardEffectType.MOVE_BACKWARD:
      return {
        playerId, kind: 'useCardChoice',
        options: [
          { id: '1', label: '后退 1 步' }, { id: '2', label: '后退 2 步' },
          { id: '3', label: '后退 3 步' },
        ],
        context: { cardEffect: 'MOVE_BACKWARD', cardName: def.name },
      }
    case CardEffectType.TELEPORT_TO_SPACE:
      return {
        playerId, kind: 'useCardChoice',
        options: state.board.tiles.filter(t => t.index !== state.players.find(p => p.id === playerId)?.position).map(t => ({
          id: String(t.index), label: t.name,
        })),
        context: { cardEffect: 'TELEPORT_TO_SPACE', cardName: def.name },
      }
    case CardEffectType.DEMOLISH_ONE:
      return {
        playerId, kind: 'useCardChoice',
        options: state.board.tiles
          .map((t, i) => ({ id: String(i), label: t.name }))
          .filter(o => (state.properties[Number(o.id)]?.level ?? 0) > 0),
        context: { cardEffect: 'DEMOLISH_ONE', cardName: def.name },
      }
    case CardEffectType.FORCE_AUCTION:
      return {
        playerId, kind: 'useCardChoice',
        options: state.board.tiles
          .map((t, i) => ({ id: String(i), label: t.name }))
          .filter(o => state.properties[Number(o.id)]?.ownerId !== undefined && state.properties[Number(o.id)]?.ownerId !== playerId),
        context: { cardEffect: 'FORCE_AUCTION', cardName: def.name },
      }
    case CardEffectType.SEND_TO_JAIL:
    case CardEffectType.FREEZE:
    case CardEffectType.STOP_TURN: {
      const opponents = state.players.filter(p => p.id !== playerId && !p.bankrupt)
      if (opponents.length === 0) return undefined
      return {
        playerId, kind: 'useCardChoice',
        options: opponents.map(p => ({ id: p.id, label: p.name })),
        context: { cardEffect: effect === CardEffectType.SEND_TO_JAIL ? 'SEND_TO_JAIL' : 'FREEZE', cardName: def.name },
      }
    }
    default:
      return undefined
  }
}

// ─── Route ───

export function handleCardAction(state: GameState, action: Action): GameState {
  if (action.type === 'USE_CARD') return handleUseCard(state, action)
  if (action.type === 'BUY_CARD') return handleBuyCard(state, action)
  return state
}
