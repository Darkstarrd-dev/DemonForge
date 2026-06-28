// TurnFSM 子系统：回合状态机 + 骰子移动 + 落点结算 + 决策消解
import type { DecisionRequest, GameState, Player, PropertyState } from '../types'

const GO_SALARY = 2000
const HOSPITAL_TURNS = 2
const MAX_LEVEL = 4

function currentIndex(state: GameState): number {
  return state.players.findIndex((p) => p.id === state.turn.currentPlayerId)
}

function liquidate(player: Player, properties: Record<number, PropertyState>) {
  for (const tid of player.ownedTileIds) {
    properties[tid] = { ...properties[tid], ownerId: undefined, level: 0, mortgaged: false }
  }
  player.ownedTileIds = []
  player.bankrupt = true
}

import { resolveTraps } from './item'
import { getGodMoveBoost, calcGodModifiedRent } from './god'
import { handleEventSpace, resolveLottery, resolveTeleport, resolveMiniGame } from './event'

export function handleRoll(state: GameState, dice: number[]): GameState {
  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.properties }
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const player = players[currentIndex(state)]

  if (player.inJailTurns > 0) {
    player.inJailTurns -= 1
    pushLog('jailSkip', `${player.name} 住院休养，跳过本回合（剩 ${player.inJailTurns} 回合）`)
    return { ...state, players, log, turn: { ...state.turn, phase: 'END_TURN' } }
  }

  if ((player.skipTurns ?? 0) > 0) {
    player.skipTurns = (player.skipTurns ?? 0) - 1
    pushLog('skipTurn', `${player.name} 被停赛，跳过本回合（剩 ${player.skipTurns} 回合）`)
    return { ...state, players, log, turn: { ...state.turn, phase: 'END_TURN' } }
  }

  let sum = dice.reduce((s, v) => s + v, 0)
  const godBoost = getGodMoveBoost(player)
  if (godBoost !== 0) {
    sum = Math.max(1, sum + godBoost)
  }
  const size = state.board.size
  const from = player.position
  const to = (from + sum) % size
  if (from + sum >= size) {
    player.cash += GO_SALARY
    pushLog('salary', `${player.name} 经过起点，领取薪水 ¥${GO_SALARY}`)
  }
  player.position = to

  const tile = state.board.tiles[to]
  pushLog('move', `${player.name} 掷出 ${dice[0]}+${dice[1]}=${sum}，走到「${tile.name}」`)

  let decision: DecisionRequest | undefined

  if (tile.type === 'hospital') {
    player.inJailTurns = HOSPITAL_TURNS
    pushLog('hospital', `${player.name} 受伤住院，将休养 ${HOSPITAL_TURNS} 回合`)
  } else if (tile.type === 'attack') {
    const damage = tile.damage ?? 500
    player.cash -= damage
    pushLog('attack', `${player.name} 踩到攻击格「${tile.name}」，损失 ¥${damage}`)
    if (player.cash <= 0 || player.bankrupt) {
      pushLog('bankrupt', `${player.name} 被攻击格击败，宣告破产`)
      liquidate(player, properties)
    }
  } else if (tile.type === 'tax') {
    const tax = tile.taxAmount ?? 0
    player.cash -= tax
    pushLog('tax', `${player.name} 缴纳税款 ¥${tax}`)
  } else if (tile.type === 'property') {
    const prop = properties[tile.index]
    if (!prop.ownerId) {
      const price = tile.price ?? 0
      if (player.cash >= price) {
        decision = {
          playerId: player.id,
          kind: 'buyProperty',
          options: [
            { id: 'buy', label: `购买（¥${price}）` },
            { id: 'skip', label: '放弃' },
          ],
          context: { tileId: tile.index, tileName: tile.name, price },
        }
        pushLog('land', `${player.name} 停在无主地产「${tile.name}」`)
      } else {
        pushLog('land', `${player.name} 停在「${tile.name}」，资金不足无法购买`)
      }
    } else if (prop.ownerId === player.id) {
      if (prop.level < MAX_LEVEL) {
        const cost = tile.upgradeCost ?? 0
        if (player.cash >= cost) {
          decision = {
            playerId: player.id,
            kind: 'upgradeProperty',
            options: [
              { id: 'upgrade', label: `升级（¥${cost}）` },
              { id: 'skip', label: '暂不升级' },
            ],
            context: { tileId: tile.index, tileName: tile.name, cost, nextLevel: prop.level + 1 },
          }
          pushLog('land', `${player.name} 回到自己的「${tile.name}」（${prop.level} 级）`)
        }
      }
    } else if (!prop.mortgaged) {
      const baseRent = (tile.rentByLevel ?? [0])[prop.level] ?? 0
      const owner = players.find((p) => p.id === prop.ownerId)
      const rent = owner ? calcGodModifiedRent(baseRent, owner, player) : baseRent
      if (owner) {
        if (player.rentAbsorbing) {
          const absorbed = Math.min(rent, player.cash)
          player.cash -= absorbed
          player.cash += absorbed  // absorbed = toll goes back to self
          player.rentAbsorbing = false
          pushLog('rent', `${player.name} 使用吸尘器吸收过路费 ¥${absorbed}（免付 ${owner.name} 的租金）`)
        } else if (player.cash >= rent) {
          player.cash -= rent
          owner.cash += rent
          pushLog('rent', `${player.name} 向 ${owner.name} 支付过路费 ¥${rent}`)
        } else {
          owner.cash += player.cash
          pushLog('bankrupt',
            `${player.name} 无力支付过路费 ¥${rent}，宣告破产（剩余 ¥${player.cash} 归 ${owner.name}）`)
          player.cash = 0
          liquidate(player, properties)
        }
      }
    }
  } else {
    // 事件格落点（新闻/命运/魔法屋/宝箱/乐透/传送/小游戏/银行/商店）
    const tempState = { ...state, players, properties, log, status: state.status, winnerId: state.winnerId }
    const result = handleEventSpace(tempState, player.id, to)
    const s = result.state
    // Merge back from event result
    players.splice(0, players.length, ...s.players)
    Object.assign(properties, s.properties)
    log.splice(0, log.length, ...s.log)
    if (result.needsDecision && result.decision) {
      decision = result.decision
    }
  }

  let status: GameState['status'] = state.status
  let winnerId: GameState['winnerId'] = state.winnerId
  const alive = players.filter((p) => !p.bankrupt)
  if (alive.length <= 1) {
    status = 'ended'
    winnerId = alive[0]?.id
    const winner = players.find((p) => p.id === winnerId)
    if (winner) pushLog('win', `${winner.name} 获胜！`)
  }

  // Check for traps on the landed tile
  const trapResolved = resolveTraps({ ...state, players, properties, log, status, winnerId }, to)

  return {
    ...trapResolved,
    turn: { ...state.turn, dice, phase: decision ? 'DECIDE' : 'END_TURN' as const },
    awaitingDecision: decision,
  }
}

export function handleResolveDecision(state: GameState, optionId: string): GameState {
  const d = state.awaitingDecision
  if (!d) return state

  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.properties }
  const log = [...state.log]
  const player = players.find((p) => p.id === d.playerId)
  const endTurn = { ...state.turn, phase: 'END_TURN' as const }

  if (d.kind === 'buyProperty') {
    const tileId = d.context.tileId as number
    const tileName = d.context.tileName as string
    const price = d.context.price as number
    if (player && optionId === 'buy') {
      player.cash -= price
      player.ownedTileIds = [...player.ownedTileIds, tileId]
      properties[tileId] = { ...properties[tileId], ownerId: player.id }
      log.push({ seq: log.length, kind: 'buy', text: `${player.name} 购得「${tileName}」，花费 ¥${price}` })
    } else if (player) {
      log.push({ seq: log.length, kind: 'skip', text: `${player.name} 放弃购买「${tileName}」` })
    }
    return { ...state, players, properties, log, awaitingDecision: undefined, turn: endTurn }
  }

  if (d.kind === 'upgradeProperty') {
    const tileId = d.context.tileId as number
    const tileName = d.context.tileName as string
    const cost = d.context.cost as number
    const nextLevel = d.context.nextLevel as number
    if (player && optionId === 'upgrade') {
      player.cash -= cost
      properties[tileId] = { ...properties[tileId], level: nextLevel }
      const label = nextLevel >= MAX_LEVEL ? '地标' : `${nextLevel} 级`
      log.push({ seq: log.length, kind: 'upgrade', text: `${player.name} 将「${tileName}」升级为 ${label}` })
    } else if (player) {
      log.push({ seq: log.length, kind: 'skip', text: `${player.name} 暂不升级「${tileName}」` })
    }
    return { ...state, players, properties, log, awaitingDecision: undefined, turn: endTurn }
  }

  // ─── Event decisions ───
  if (d.kind === 'lotteryBet') {
    return { ...resolveLottery(state, d.playerId, optionId === 'bet'), turn: endTurn }
  }
  if (d.kind === 'teleportTarget') {
    return { ...resolveTeleport(state, d.playerId, parseInt(optionId, 10)), turn: endTurn }
  }
  if (d.kind === 'magicHouseEffect') {
    return { ...resolveMiniGame(state, d.playerId, optionId === 'play'), turn: endTurn }
  }
  if (d.kind === 'bankOperation') {
    log.push({ seq: log.length, kind: 'bank', text: `${player?.name ?? '玩家'} 选择「${optionId === 'skip' ? '离开' : optionId}」` })
    return { ...state, players, log, awaitingDecision: undefined, turn: endTurn }
  }
  if (d.kind === 'useCardChoice' && d.context.eventShop) {
    log.push({ seq: log.length, kind: 'shop', text: `${player?.name ?? '玩家'} 进入商店` })
    return { ...state, players, log, awaitingDecision: undefined, turn: endTurn }
  }

  return state
}

export function handleEndTurn(state: GameState): GameState {
  const players = state.players
  const n = players.length
  let next = (currentIndex(state) + 1) % n
  let guard = 0
  while (players[next].bankrupt && guard < n) {
    next = (next + 1) % n
    guard += 1
  }

  // Decrement sealed/priceUp group durations
  let sealedGroups = state.sealedGroups
  if (sealedGroups) {
    const nextSealed: Record<string, number> = {}
    for (const [gid, days] of Object.entries(sealedGroups)) {
      if (days > 1) nextSealed[gid] = days - 1
    }
    sealedGroups = Object.keys(nextSealed).length > 0 ? nextSealed : undefined
  }
  let priceUpGroups = state.priceUpGroups
  if (priceUpGroups) {
    const nextUp: Record<string, number> = {}
    for (const [gid, days] of Object.entries(priceUpGroups)) {
      if (days > 1) nextUp[gid] = days - 1
    }
    priceUpGroups = Object.keys(nextUp).length > 0 ? nextUp : undefined
  }

  return {
    ...state,
    turn: { currentPlayerId: players[next].id, phase: 'ROLL', doublesCount: 0, dice: undefined },
    sealedGroups,
    priceUpGroups,
  }
}
