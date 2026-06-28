import godsData from '../data/gods/richman4-gods.json'
import type { GameState, Player, GodDefinition, CardInstance } from '../types'

let _godDefs: GodDefinition[] | null = null
let _instanceCounter = 0

function nextCardInstanceId(): string {
  return `gi_${++_instanceCounter}`
}

export function loadGodDefinitions(): GodDefinition[] {
  if (!_godDefs) _godDefs = godsData as GodDefinition[]
  return _godDefs
}

export function findGodDef(godId: string): GodDefinition | undefined {
  return loadGodDefinitions().find(g => g.id === godId)
}

export function applyPlayerGodDailyEffect(state: GameState, player: Player): GameState {
  if (!player.godId) return state
  const godDef = findGodDef(player.godId)
  if (!godDef) return state
  const log = [...state.log]
  const pushLog = (text: string) => log.push({ seq: log.length, kind: 'godEffect', text })
  let players = state.players.map(p => ({ ...p }))
  const current = players.find(p => p.id === player.id)
  if (!current) return state
  let deck = state.cardDeck ? { ...state.cardDeck } : undefined

  for (const effect of godDef.effects) {
    switch (effect.type) {
      case 'CASH_GAIN': {
        const targets = effect.target === 'ALL' ? players.filter(p => !p.bankrupt)
          : effect.target === 'SELF' ? [current] : []
        for (const t of targets) {
          t.cash += effect.value
          pushLog(`${t.name} 因神明「${godDef.name}」获得 ¥${effect.value}`)
        }
        break
      }
      case 'CASH_LOSE': {
        const targets = effect.target === 'ALL' ? players.filter(p => !p.bankrupt)
          : effect.target === 'SELF' ? [current] : []
        for (const t of targets) {
          const lost = Math.min(t.cash, effect.value)
          t.cash -= lost
          pushLog(`${t.name} 因神明「${godDef.name}」失去 ¥${lost}`)
        }
        break
      }
      case 'CARD_DRAW': {
        if (effect.value > 0 && deck) {
          for (let i = 0; i < effect.value; i++) {
            if (deck.drawPile.length === 0) break
            const top: string = deck.drawPile[0]
            deck = { ...deck, drawPile: deck.drawPile.slice(1), discardPile: [...deck.discardPile, top] }
            const hand = current.hand ?? []
            if (hand.length < 15) {
              const cardInst: CardInstance = { definitionId: top, instanceId: nextCardInstanceId() }
              current.hand = [...hand, cardInst]
              pushLog(`${current.name} 因神明「${godDef.name}」获得一张卡片`)
            }
          }
        }
        if (effect.value < 0 && deck) {
          const hand = current.hand ?? []
          const toDiscard = Math.min(Math.abs(effect.value), hand.length)
          for (let i = 0; i < toDiscard; i++) {
            const removed = hand.pop()
            if (removed) deck = { ...deck, discardPile: [...deck.discardPile, removed.definitionId] }
          }
          current.hand = hand
          if (toDiscard > 0) pushLog(`${current.name} 因神明「${godDef.name}」被强弃 ${toDiscard} 张卡片`)
        }
        break
      }
    }
  }

  let result: GameState = { ...state, players, log }
  if (deck) result = { ...result, cardDeck: deck }
  return result
}

export function applyAllGodDailyEffects(state: GameState): GameState {
  let s = state
  for (const p of s.players) {
    if (!p.bankrupt && p.godId) {
      s = applyPlayerGodDailyEffect(s, p)
    }
  }
  return s
}

export function tickGodDurations(state: GameState): GameState {
  const players = state.players.map(p => ({ ...p }))
  const log = [...state.log]
  const pushLog = (text: string) => log.push({ seq: log.length, kind: 'godTick', text })

  for (const p of players) {
    if (!p.godId) continue
    const remain = (p.godRemainingDays ?? 0) - 1
    if (remain <= 0) {
      const godDef = findGodDef(p.godId)
      if (godDef?.transformTo) {
        p.godId = godDef.transformTo
        p.godRemainingDays = 7
        const newGod = findGodDef(godDef.transformTo)
        pushLog(`${p.name} 身上的「${godDef.name}」变成了「${newGod?.name ?? godDef.transformTo}」`)
      } else {
        pushLog(`${p.name} 身上的「${godDef?.name ?? p.godId}」离开了`)
        p.godId = undefined
        p.godRemainingDays = 0
      }
    } else {
      p.godRemainingDays = remain
    }
  }

  return { ...state, players, log }
}

export function summonNearestGod(state: GameState): string | undefined {
  const defs = loadGodDefinitions()
  const used = new Set(state.players.filter(p => p.godId).map(p => p.godId))
  const pool = defs.filter(g => g.id !== 'god-12' && !used.has(g.id))
  if (pool.length === 0) return undefined
  return pool[Math.floor(Math.random() * pool.length)].id
}

export function getGodMoveBoost(player: Player): number {
  if (!player.godId) return 0
  const def = findGodDef(player.godId)
  if (!def) return 0
  for (const effect of def.effects) {
    if (effect.type === 'MOVE_BOOST') return effect.value
  }
  return 0
}

export function getGodRentMultiplier(landlord: Player, tenant: Player): number {
  let multiplier = 1.0

  if (landlord.godId) {
    const def = findGodDef(landlord.godId)
    if (def) {
      for (const effect of def.effects) {
        if (effect.type === 'RENT_BOOST' && effect.target === 'SELF') multiplier *= effect.value
        if (effect.type === 'RENT_REDUCE' && effect.target === 'SELF') multiplier *= effect.value
      }
    }
  }

  if (tenant.godId) {
    const def = findGodDef(tenant.godId)
    if (def) {
      for (const effect of def.effects) {
        if (effect.type === 'RENT_REDUCE' && effect.target === 'SELF') multiplier *= effect.value
      }
    }
  }

  return multiplier
}

export function handleGodPossession(state: GameState, playerId: string, godId: string): GameState {
  const godDef = findGodDef(godId)
  if (!godDef) return state
  const players = state.players.map(p => p.id === playerId ? { ...p, godId, godRemainingDays: godDef.durationDays } : p)
  const log = [...state.log, { seq: state.log.length, kind: 'godPossess', text: `${players.find(p => p.id === playerId)?.name} 被「${godDef.name}」附身（${godDef.durationDays} 天）` }]
  return { ...state, players, log }
}

export function handleGodDismiss(state: GameState, playerId: string): GameState {
  const players = state.players.map(p => {
    if (p.id !== playerId || !p.godId) return p
    const def = findGodDef(p.godId)
    if (def && !def.canDismiss) return p
    return { ...p, godId: undefined, godRemainingDays: 0 }
  })
  const player = players.find(p => p.id === playerId)!
  const log = [...state.log]
  if (!player.godId) {
    log.push({ seq: log.length, kind: 'godDismiss', text: `${player.name} 送走了附身神明` })
  } else {
    log.push({ seq: log.length, kind: 'godDismiss', text: `${player.name} 尝试送神失败（该神明不可送走）` })
  }
  return { ...state, players, log }
}

export function calcGodModifiedRent(baseRent: number, landlord: Player, tenant: Player): number {
  const ml = getGodRentMultiplier(landlord, tenant)
  return Math.floor(baseRent * ml)
}
