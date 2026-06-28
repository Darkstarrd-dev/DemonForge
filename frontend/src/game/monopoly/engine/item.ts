// Item 子系统：13 种道具效果（M4 全量实现，P1-6 改为 effectType 数据驱动）
import type { GameState, Action, ItemDefinition, ItemDeckState, ItemInstance, DecisionRequest, TrapState } from '../types'
import { ItemEffectType } from '../types'
import itemsData from '../data/items/richman4-items.json'

const ITEM_HAND_LIMIT = 5
const TARGET_TILE_ITEMS = ['item-02', 'item-03', 'item-04', 'item-05', 'item-07', 'item-08', 'item-09', 'item-11']
const TARGET_PLAYER_ITEMS = ['item-12']

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
  return `ii_${++_instanceCounter}`
}

export function createItemDeck(): ItemDeckState {
  const definitions = itemsData as ItemDefinition[]
  const shopItems = definitions.filter(d => d.acquireMethod === 'SHOP')
  const shopAvailable = shuffle(shopItems.map(d => d.id)).slice(0, 3)
  const researchItems = definitions.filter(d => d.acquireMethod === 'RESEARCH_LAB')
  return {
    definitions,
    shopInventory: { availableItemIds: shopAvailable, refreshOnDay: 3 },
    researchInventory: { availableResearchIds: researchItems.map(d => d.id) },
  }
}

export function findItemDef(itemDefId: string, deck: ItemDeckState): ItemDefinition | undefined {
  return deck.definitions.find(d => d.id === itemDefId)
}

export function refreshItemShop(deck: ItemDeckState, day: number): ItemDeckState {
  if (day % deck.shopInventory.refreshOnDay !== 0) return deck
  const shopItems = deck.definitions.filter(d => d.acquireMethod === 'SHOP')
  const shuffled = shuffle(shopItems.map(d => d.id))
  return {
    ...deck,
    shopInventory: { ...deck.shopInventory, availableItemIds: shuffled.slice(0, 3) },
  }
}

// ─── Buy Item ───

export function handleBuyItem(state: GameState, action: Action & { type: 'BUY_ITEM' }): GameState {
  const deck = state.itemDeck
  if (!deck) return state
  const players = state.players.map(p => ({ ...p }))
  const player = players.find(p => p.id === state.turnContext.currentPlayerId)
  if (!player || player.bankrupt) return state
  const def = findItemDef(action.itemDefId, deck)
  if (!def) return state
  const inShop = deck.shopInventory.availableItemIds.includes(def.id)
  const inResearch = deck.researchInventory.availableResearchIds.includes(def.id)
  if (!inShop && !inResearch) return state
  const points = player.points ?? 0
  if (points < def.pointCost) return state
  const itemLen = (player.items ?? []).length
  if (itemLen >= ITEM_HAND_LIMIT) return state
  const itemInst: ItemInstance = { definitionId: def.id, instanceId: nextInstanceId(), durability: def.durability }
  player.points = points - def.pointCost
  player.items = [...(player.items ?? []), itemInst]
  let newDeck = deck
  if (inResearch) {
    newDeck = {
      ...deck,
      researchInventory: {
        ...deck.researchInventory,
        availableResearchIds: deck.researchInventory.availableResearchIds.filter(id => id !== def.id),
      },
    }
  }
  const log = [...state.log, {
    seq: state.log.length, kind: 'buyItem',
    text: `${player.name} 购买道具「${def.name}」（花费 ${def.pointCost} 点）`,
  }]
  return { ...state, players, itemDeck: newDeck, log }
}

// ─── Consume item (remove or decrease durability) ───

function consumeItem(items: ItemInstance[], idx: number, def: ItemDefinition): ItemInstance[] {
  const newItems = [...items]
  if (def.durability === -1) return newItems
  const updatedInst = { ...newItems[idx], durability: newItems[idx].durability - 1 }
  if (updatedInst.durability <= 0) {
    newItems.splice(idx, 1)
  } else {
    newItems[idx] = updatedInst
  }
  return newItems
}

// ─── Apply item effect (core logic, target already resolved) ───

function applyItemEffect(
  state: GameState,
  def: ItemDefinition,
  playerIdx: number,
  itemIdx: number,
  targetTileId?: string,
  targetId?: string,
): GameState {
  const players = state.players.map(p => ({ ...p }))
  const properties = { ...state.board.properties }
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const player = players[playerIdx]
  const traps: Record<string, TrapState> = state.board.boardTraps ? { ...state.board.boardTraps } : {}

  const effectType = def.effectType
  const params = def.effectParams ?? {}

  if (effectType === ItemEffectType.CHANGE_VEHICLE) {
    player.vehicle = (params.vehicle as 'MOTORCYCLE' | 'CAR') ?? 'MOTORCYCLE'
    const diceCount = player.vehicle === 'CAR' ? 3 : 2
    pushLog('useItem', `${player.name} 使用「${def.name}」，现可掷 ${diceCount} 颗骰子`)
  } else if (effectType === ItemEffectType.LAUNCH_MISSILE) {
    if (targetTileId !== undefined) {
      const prop = properties[targetTileId]
      if (prop) {
        if (params.demolish) {
          const d = prop.level
          prop.level = 0
          properties[targetTileId] = { ...prop }
          pushLog('useItem', `${player.name} 使用「${def.name}」，${d > 0 ? `拆除 ${d} 级建筑` : '目标无建筑'}`)
        } else {
          if (prop.level > 0) {
            prop.level -= 1
            properties[targetTileId] = { ...prop }
            pushLog('useItem', `${player.name} 使用「${def.name}」，攻击地产`)
          } else {
            pushLog('useItem', `${player.name} 使用「${def.name}」，但目标无建筑`)
          }
        }
      }
    }
  } else if (effectType === ItemEffectType.SET_TRAP) {
    if (targetTileId !== undefined) {
      const trapType = (params.trapType as string) ?? 'mine'
      const countdown = trapType === 'bomb' ? ((params.countdown as number) ?? 3) : -1
      const instId = trapType === 'bomb' ? 'bomb_' + Date.now() : 'trap_' + Date.now()
      traps[targetTileId] = {
        itemDefId: def.id,
        instanceId: instId,
        ownerId: player.id,
        countdown,
      }
      const trapTile = state.board.tiles.find(t => t.id === targetTileId)
      pushLog('useItem', `${player.name} 在格 ${trapTile?.name ?? targetTileId} 放置${def.name}`)
    }
  } else if (effectType === ItemEffectType.REMOVE_DEBRIS) {
    const playerTile = state.board.tiles.find(t => t.id === player.position)
    const playerTileIdx = playerTile?.index ?? 0
    let cleared = 0
    for (let i = 0; i < state.board.tiles.length; i++) {
      const ci = (playerTileIdx + i) % state.board.tiles.length
      const tileId = state.board.tiles[ci]?.id
      if (tileId && traps[tileId]) { delete traps[tileId]; cleared++ }
    }
    pushLog('useItem', `${player.name} 使用「${def.name}」，清除 ${cleared} 个障碍`)
  } else if (effectType === ItemEffectType.ROADBLOCK) {
    if (targetTileId !== undefined) {
      traps[targetTileId] = { itemDefId: def.id, instanceId: 'block_' + Date.now(), ownerId: player.id, countdown: -1 }
      const trapTile = state.board.tiles.find(t => t.id === targetTileId)
      pushLog('useItem', `${player.name} 在格 ${trapTile?.name ?? targetTileId} 放置路障`)
    }
  } else if (effectType === ItemEffectType.TELEPORT) {
    if (targetTileId !== undefined) {
      const fromTile = state.board.tiles.find(t => t.id === player.position)
      const targetTile = state.board.tiles.find(t => t.id === targetTileId)
      if (fromTile && targetTile) {
        if (targetTile.index < fromTile.index) { player.cash += 2000; pushLog('salary', `${player.name} 经过起点，领取 ¥2000`) }
        player.position = targetTileId
        pushLog('useItem', `${player.name} 使用「${def.name}」移动到目标格`)
      }
    } else if (targetId) {
      const target = players.find(p => p.id === targetId)
      if (target && !target.bankrupt) {
        player.position = target.position
        pushLog('useItem', `${player.name} 使用「${def.name}」，传送到 ${target.name} 的位置`)
      }
    }
  } else if (effectType === ItemEffectType.ABSORB_DAMAGE) {
    player.isCollectingRent = false
    player.rentAbsorbing = true
    pushLog('useItem', `${player.name} 使用「${def.name}」，途经他人地产吸收过路费`)
  } else if (effectType === ItemEffectType.NUCLEAR_BOMB) {
    if (targetTileId !== undefined) {
      const targetTile = state.board.tiles.find(t => t.id === targetTileId)
      const range = (params.range as number) ?? def.effectRange
      let destroyed = 0
      for (let i = 0; i < state.board.tiles.length; i++) {
        const tId = state.board.tiles[i]?.id
        if (tId) {
          const prop = properties[tId]
          if (prop && prop.level > 0) {
            const tile = state.board.tiles[i]
            const targetIdx = targetTile?.index ?? 0
            if (Math.abs((tile?.index ?? 0) - targetIdx) <= range || Math.abs((tile?.index ?? 0) - targetIdx) >= state.board.tiles.length - range) {
              properties[tId] = { ...prop, level: 0 }
              destroyed++
            }
          }
        }
      }
      pushLog('useItem', `${player.name} 使用「${def.name}」，摧毁 ${destroyed} 座建筑`)
    }
  } else {
    pushLog('useItem', `${player.name} 使用「${def.name}」（效果：${effectType ?? '未定义'}）`)
  }

  const itemsArr = player.items ?? []
  const consumed = consumeItem(itemsArr, itemIdx, def)
  player.items = consumed

  return {
    ...state, players,
    board: { ...state.board, properties, boardTraps: Object.keys(traps).length > 0 ? traps : {} },
    log,
    awaitingDecision: undefined,
  }
}

// ─── Use Item (two-phase: apply or build choice) ───

export function handleUseItem(state: GameState, action: Action & { type: 'USE_ITEM' }): GameState {
  const players = state.players.map(p => ({ ...p }))
  const playerIdx = players.findIndex(p => p.id === state.turnContext.currentPlayerId)
  if (playerIdx === -1) return state
  const player = players[playerIdx]
  if (player.bankrupt) return state
  const deck = state.itemDeck
  if (!deck) return state
  const items = player.items ?? []
  const itemIdx = items.findIndex(c => c.instanceId === action.itemInstanceId)
  if (itemIdx === -1) return state
  const inst = items[itemIdx]
  const def = findItemDef(inst.definitionId, deck)
  if (!def) return state

  // If target already provided (or self-use item), apply directly
  const isSelfUse = !TARGET_TILE_ITEMS.includes(def.id) && !TARGET_PLAYER_ITEMS.includes(def.id)
  if (isSelfUse || action.targetTileId !== undefined || action.targetId !== undefined) {
    return applyItemEffect(state, def, playerIdx, itemIdx, action.targetTileId, action.targetId)
  }

  // Need choice — build decision
  const decision = buildItemChoiceDecision(def, player.id, state)
  if (!decision) {
    // No valid targets — still consume item with a log
    const log = [...state.log, { seq: state.log.length, kind: 'useItem', text: `${player.name} 尝试使用「${def.name}」，但无有效目标` }]
    const consumed = consumeItem(items, itemIdx, def)
    player.items = consumed
    return { ...state, players, log, awaitingDecision: undefined }
  }

  // Store pending item context, remove item from hand first
  const newItems = [...items]
  newItems.splice(itemIdx, 1)
  player.items = newItems

  return {
    ...state, players,
    awaitingDecision: {
      ...decision,
      context: { ...decision.context, pendingItemDefId: def.id, pendingItemIdx: itemIdx, originalItems: items },
    },
  }
}

// ─── Build Item Choice Decision ───

export function buildItemChoiceDecision(def: ItemDefinition, playerId: string, state: GameState): DecisionRequest | undefined {
  if (TARGET_PLAYER_ITEMS.includes(def.id)) {
    const opponents = state.players.filter(p => p.id !== playerId && !p.bankrupt)
    if (opponents.length === 0) return undefined
    return {
      playerId, kind: 'useCardChoice',
      options: opponents.map(p => ({ id: p.id, label: p.name })),
      context: { cardEffect: 'ITEM_TARGET_PLAYER', cardName: def.name, itemDefId: def.id },
    }
  }
  if (def.id === 'item-08') {
    const playerPos = state.players.find(p => p.id === playerId)?.position
    return {
      playerId, kind: 'useCardChoice',
      options: state.board.tiles
        .filter(t => t.id !== playerPos)
        .map(t => ({ id: t.id, label: t.name })),
      context: { cardEffect: 'ITEM_TARGET_TILE', cardName: def.name, itemDefId: def.id },
    }
  }
  if (TARGET_TILE_ITEMS.includes(def.id)) {
    const isOffensive = ['item-02', 'item-03', 'item-09', 'item-11']
    const tiles = state.board.tiles
      .filter(t => {
        const prop = state.board.properties[t.id]
        if (isOffensive.includes(def.id)) return prop && prop.level > 0 && prop.ownerId && prop.ownerId !== playerId
        return true // items 04,05,07 can be placed anywhere
      })
    if (tiles.length === 0) return undefined
    return {
      playerId, kind: 'useCardChoice',
      options: tiles.slice(0, 20).map(t => ({
        id: t.id,
        label: `${t.name}${state.board.properties[t.id]?.level > 0 ? ` (${state.board.properties[t.id].level}级)` : ''}`,
      })),
      context: { cardEffect: 'ITEM_TARGET_TILE', cardName: def.name, itemDefId: def.id },
    }
  }
  return undefined
}

// ─── Resolve Item Choice ───

export function resolveItemChoice(state: GameState, optionId: string): GameState {
  const d = state.awaitingDecision
  if (!d || d.kind !== 'useCardChoice') return state
  const itemDefId = d.context.itemDefId as string | undefined
  if (!itemDefId) return state
  const def = state.itemDeck?.definitions.find(x => x.id === itemDefId)
  if (!def) return state

  const players = state.players.map(p => ({ ...p }))
  const player = players.find(p => p.id === d.playerId)
  if (!player) return state

  // Restore the item to player's inventory and apply with target
  const originalItems = d.context.originalItems as ItemInstance[] | undefined
  player.items = originalItems ?? player.items

  const items = player.items ?? []
  const itemIdx = items.findIndex((_, i) => {
    const p = players.find(x => x.id === d.playerId)
    return p?.items?.[i]?.definitionId === itemDefId
  })

  let targetTileId: string | undefined
  let targetId: string | undefined
  if (TARGET_PLAYER_ITEMS.includes(itemDefId)) {
    targetId = optionId
    const opponent = players.find(p => p.id === optionId)
    if (opponent) targetTileId = opponent.position
  } else {
    targetTileId = optionId
  }

  return applyItemEffect(
    { ...state, players },
    def,
    players.findIndex(p => p.id === d.playerId),
    Math.max(0, itemIdx),
    targetTileId,
    targetId,
  )
}

// ─── Trap resolution ───

export function resolveTraps(state: GameState, tileIndex: number): GameState {
  const tileId = state.board.tiles[tileIndex]?.id
  if (!tileId) return state
  const traps = state.board.boardTraps
  if (!traps || !traps[tileId]) return state
  const trap = traps[tileId]
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const playerIdx = players.findIndex(p => p.id === state.turnContext.currentPlayerId)
  if (playerIdx === -1) return state
  const player = players[playerIdx]
  const newTraps = { ...traps }

  if (trap.itemDefId === 'item-04') {
    const owner = players.find(p => p.id === trap.ownerId)
    const dmg = 800
    player.cash = Math.max(0, player.cash - dmg)
    if (owner) owner.cash += dmg
    player.hospitalTurns = 2
    player.status = 'IN_HOSPITAL'
    pushLog('trap', `${player.name} 踩中地雷！扣 ¥${dmg} 住院 2 回合`)
    delete newTraps[tileId]
  } else if (trap.itemDefId === 'item-07') {
    pushLog('trap', `${player.name} 被路障挡住`)
    delete newTraps[tileId]
  } else if (trap.itemDefId === 'item-05') {
    const dmg = 2000
    player.cash = Math.max(0, player.cash - dmg)
    player.hospitalTurns = 3
    player.status = 'IN_HOSPITAL'
    pushLog('trap', `${player.name} 踩到定时炸弹！扣 ¥${dmg} 住院 3 回合`)
    delete newTraps[tileId]
  }

  return {
    ...state, players, log,
    board: { ...state.board, boardTraps: newTraps },
  }
}

/** 定时炸弹每日倒计时 */
export function tickTimedBombs(state: GameState): GameState {
  const traps = state.board.boardTraps
  if (!traps || Object.keys(traps).length === 0) return state
  const players = state.players.map(p => ({ ...p }))
  const properties = { ...state.board.properties }
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const newTraps: Record<string, TrapState> = {}

  for (const [tileId, trap] of Object.entries(traps)) {
    if (trap.itemDefId === 'item-05') {
      const tile = state.board.tiles.find(t => t.id === tileId)
      const idx = tile?.index ?? 0
      const rem = trap.countdown - 1
      if (rem <= 0) {
        let d = 0
        for (let i = Math.max(0, idx - 2); i <= Math.min(state.board.tiles.length - 1, idx + 2); i++) {
          const propTileId = state.board.tiles[i]?.id
          if (propTileId && properties[propTileId] && properties[propTileId].level > 0) {
            properties[propTileId] = { ...properties[propTileId], level: 0 }
            d++
          }
        }
        pushLog('trap', `定时炸弹爆炸！摧毁 ${d} 座建筑`)
      } else {
        newTraps[tileId] = { ...trap, countdown: rem }
      }
    } else {
      newTraps[tileId] = trap
    }
  }

  return {
    ...state, players,
    board: { ...state.board, properties, boardTraps: Object.keys(newTraps).length > 0 ? newTraps : {} },
    log,
  }
}

// ─── Route ───

export function handleItemAction(state: GameState, action: Action): GameState {
  if (action.type === 'USE_ITEM') return handleUseItem(state, action)
  if (action.type === 'BUY_ITEM') return handleBuyItem(state, action)
  return state
}

export { ITEM_HAND_LIMIT }
