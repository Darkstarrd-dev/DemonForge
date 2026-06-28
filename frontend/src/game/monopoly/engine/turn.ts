// TurnFSM 子系统：回合状态机 + 骰子移动 + 落点结算 + 决策消解
// Phase 0 统一后：TurnContext + string ID + BoardState
import type { DecisionRequest, GameState, Tile } from '../types'
import { SpaceType, TurnPhaseV2 } from '../types'

const GO_SALARY = 2000
const HOSPITAL_TURNS = 2
const MAX_LEVEL = 4

function currentIndex(state: GameState): number {
  return state.players.findIndex((p) => p.id === state.turnContext.currentPlayerId)
}

/** 根据 tile ID 查找 tile */
function findTile(state: GameState, tileId: string): Tile | undefined {
  return state.board.tiles.find((t) => t.id === tileId)
}

/** 根据 tile index 查找 tile */
function findTileByIndex(state: GameState, index: number): Tile | undefined {
  return state.board.tiles.find((t) => t.index === index)
}

/** 沿 neighborIds 前进指定步数，返回目标 tile ID 与路径 */
function advanceOnRing(state: GameState, currentId: string, steps: number): { targetId: string; path: string[] } {
  const path: string[] = []
  let pos = currentId
  let remaining = steps

  while (remaining > 0) {
    const tile = findTile(state, pos)
    if (!tile) break

    const neighbors = tile.neighborIds ?? []
    if (neighbors.length === 0) {
      // 无 neighborIds 时回退到 index 取模
      const size = state.board.tiles.length
      const nextIdx = (tile.index + 1) % size
      const nextTile = findTileByIndex(state, nextIdx)
      if (!nextTile) break
      pos = nextTile.id
    } else {
      // 环形拓扑：neighborIds = [prev, next]，最后一个为前进方向
      pos = neighbors[neighbors.length - 1]
    }
    path.push(pos)
    remaining--
  }

  return { targetId: pos, path }
}

import { resolveTraps } from './item'
import { getGodMoveBoost, calcGodModifiedRent } from './god'
import { handleEventSpace, resolveLottery, resolveTeleport, resolveMiniGame } from './event'
import { calculateRent } from './board'
import { liquidate } from './player'

export function handleRoll(state: GameState, dice: number[]): GameState {
  const players = state.players.map((p) => ({ ...p }))
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const player = players[currentIndex(state)]

  // 住院跳过
  if ((player.jailTurns ?? player.jailTurns ?? 0) > 0) {
    const remainingJT = (player.jailTurns ?? player.jailTurns ?? 0) - 1
    player.jailTurns = remainingJT
    
    pushLog('jailSkip', `${player.name} 住院休养，跳过本回合（剩 ${remainingJT} 回合）`)
    return {
      ...state, players, log,
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.TURN_END },
    }
  }

  // 停赛跳过
  if ((player.skipTurns ?? 0) > 0) {
    player.skipTurns = (player.skipTurns ?? 0) - 1
    pushLog('skipTurn', `${player.name} 被停赛，跳过本回合（剩 ${player.skipTurns} 回合）`)
    return {
      ...state, players, log,
      turnContext: { ...state.turnContext, phase: TurnPhaseV2.TURN_END },
    }
  }

  let sum = dice.reduce((s, v) => s + v, 0)
  const godBoost = getGodMoveBoost(player)
  if (godBoost !== 0) {
    sum = Math.max(1, sum + godBoost)
  }
  const size = state.board.tiles.length

  // 环形走动
  const currTile = findTile(state, player.position)
  const fromIdx = currTile?.index ?? 0
  const fromPos = player.position
  const { targetId, path: movePath } = advanceOnRing(state, fromPos, sum)

  // 经过起点检测
  if (fromIdx + sum >= size) {
    player.cash += GO_SALARY
    pushLog('salary', `${player.name} 经过起点，领取薪水 ¥${GO_SALARY}`)
  }
  player.position = targetId

  const tile = findTile(state, targetId)
  if (!tile) {
    return {
      ...state, players, log,
      turnContext: { ...state.turnContext, diceResults: dice, phase: TurnPhaseV2.TURN_END },
    }
  }

  pushLog('move', `${player.name} 掷出 ${dice[0]}+${dice[1]}=${sum}，走到「${tile.name}」`)

  let decision: DecisionRequest | undefined

  if (tile.type === SpaceType.HOSPITAL) {
    player.jailTurns = HOSPITAL_TURNS
    player.jailTurns = HOSPITAL_TURNS
    pushLog('hospital', `${player.name} 受伤住院，将休养 ${HOSPITAL_TURNS} 回合`)
  } else if (tile.type === SpaceType.ATTACK_SPACE) {
    const damage = tile.damage ?? 500
    player.cash -= damage
    pushLog('attack', `${player.name} 踩到攻击格「${tile.name}」，损失 ¥${damage}`)
    if (player.cash <= 0 || player.bankrupt) {
      pushLog('bankrupt', `${player.name} 被攻击格击败，宣告破产`)
      liquidate(player, state)
    }
  } else if (tile.type === SpaceType.TAX) {
    const tax = tile.taxAmount ?? 0
    player.cash -= tax
    pushLog('tax', `${player.name} 缴纳税款 ¥${tax}`)
  } else if (tile.type === SpaceType.PROPERTY) {
    const prop = state.board.properties[tile.id]
    if (!prop.ownerId) {
      const price = tile.price ?? tile.basePrice ?? 0
      if (player.cash >= price) {
        decision = {
          playerId: player.id,
          kind: 'buyProperty',
          options: [
            { id: 'buy', label: `购买（¥${price}）` },
            { id: 'skip', label: '放弃' },
          ],
          context: { tileId: tile.id, tileName: tile.name, price },
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
            context: { tileId: tile.id, tileName: tile.name, cost, nextLevel: prop.level + 1 },
          }
          pushLog('land', `${player.name} 回到自己的「${tile.name}」（${prop.level} 级）`)
        }
      }
    } else {
      const { amount: rent, creditorId } = calculateRent(state, tile.id)
      if (rent > 0 && creditorId) {
        const owner = players.find((p) => p.id === creditorId)
        const godRent = owner ? calcGodModifiedRent(rent, owner, player) : rent
        if (owner) {
          if (player.rentAbsorbing) {
            const absorbed = Math.min(godRent, player.cash)
            player.cash -= absorbed
            player.cash += absorbed
            player.rentAbsorbing = false
            pushLog('rent', `${player.name} 使用吸尘器吸收过路费 ¥${absorbed}（免付 ${owner.name} 的租金）`)
          } else if (player.cash >= godRent) {
            player.cash -= godRent
            owner.cash += godRent
            pushLog('rent', `${player.name} 向 ${owner.name} 支付过路费 ¥${godRent}`)
          } else {
            owner.cash += player.cash
            pushLog('bankrupt',
              `${player.name} 无力支付过路费 ¥${godRent}，宣告破产（剩余 ¥${player.cash} 归 ${owner.name}）`)
            player.cash = 0
            liquidate(player, state, owner.id)
          }
        }
      }
    }
  } else {
    // 事件格落点
    const idx = tile.index
    const tempState = { ...state, players, board: { ...state.board, properties: { ...state.board.properties } }, log, status: state.status, winnerId: state.winnerId }
    const result = handleEventSpace(tempState, player.id, idx)
    const s = result.state
    players.splice(0, players.length, ...s.players)
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

  // Check for traps on the landed tile (resolveTraps uses tile index)
  const trapResolved = resolveTraps({ ...state, players, log, status, winnerId }, tile.index)

  return {
    ...trapResolved,
    turnContext: {
      ...state.turnContext,
      diceResults: dice,
      moveSteps: sum,
      movePath,
      phase: decision ? TurnPhaseV2.PURCHASE_DECISION : TurnPhaseV2.TURN_END,
    },
    awaitingDecision: decision,
  }
}

export function handleResolveDecision(state: GameState, optionId: string): GameState {
  const d = state.awaitingDecision
  if (!d) return state

  const players = state.players.map((p) => ({ ...p }))
  const log = [...state.log]
  const player = players.find((p) => p.id === d.playerId)
  const endTurn = { ...state.turnContext, phase: TurnPhaseV2.TURN_END }

  if (d.kind === 'buyProperty') {
    const tileId = d.context.tileId as string
    const tileName = d.context.tileName as string
    const price = d.context.price as number
    if (player && optionId === 'buy') {
      player.cash -= price
      player.ownedTileIds = [...player.ownedTileIds, tileId]
      state.board.properties[tileId] = { ...state.board.properties[tileId], ownerId: player.id }
      log.push({ seq: log.length, kind: 'buy', text: `${player.name} 购得「${tileName}」，花费 ¥${price}` })
    } else if (player) {
      log.push({ seq: log.length, kind: 'skip', text: `${player.name} 放弃购买「${tileName}」` })
    }
    return { ...state, players, log, awaitingDecision: undefined, turnContext: endTurn }
  }

  if (d.kind === 'upgradeProperty') {
    const tileId = d.context.tileId as string
    const tileName = d.context.tileName as string
    const cost = d.context.cost as number
    const nextLevel = d.context.nextLevel as number
    if (player && optionId === 'upgrade') {
      player.cash -= cost
      state.board.properties[tileId] = { ...state.board.properties[tileId], level: nextLevel }
      const label = nextLevel >= MAX_LEVEL ? '地标' : `${nextLevel} 级`
      log.push({ seq: log.length, kind: 'upgrade', text: `${player.name} 将「${tileName}」升级为 ${label}` })
    } else if (player) {
      log.push({ seq: log.length, kind: 'skip', text: `${player.name} 暂不升级「${tileName}」` })
    }
    return { ...state, players, log, awaitingDecision: undefined, turnContext: endTurn }
  }

  if (d.kind === 'lotteryBet') {
    return { ...resolveLottery(state, d.playerId, optionId === 'bet'), turnContext: endTurn }
  }
  if (d.kind === 'teleportTarget') {
    return { ...resolveTeleport(state, d.playerId, optionId), turnContext: endTurn }
  }
  if (d.kind === 'magicHouseEffect') {
    return { ...resolveMiniGame(state, d.playerId, optionId === 'play'), turnContext: endTurn }
  }
  if (d.kind === 'bankOperation') {
    log.push({ seq: log.length, kind: 'bank', text: `${player?.name ?? '玩家'} 选择「${optionId === 'skip' ? '离开' : optionId}」` })
    return { ...state, players, log, awaitingDecision: undefined, turnContext: endTurn }
  }
  if (d.kind === 'useCardChoice' && d.context.eventShop) {
    log.push({ seq: log.length, kind: 'shop', text: `${player?.name ?? '玩家'} 进入商店` })
    return { ...state, players, log, awaitingDecision: undefined, turnContext: endTurn }
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
  let sealedGroups: Record<string, number> | undefined = state.board.sealedGroups
  if (sealedGroups) {
    const nextSealed: Record<string, number> = {}
    for (const [gid, days] of Object.entries(sealedGroups)) {
      if (days > 1) nextSealed[gid] = days - 1
    }
    sealedGroups = Object.keys(nextSealed).length > 0 ? nextSealed : undefined
  }
  let priceUpGroups: Record<string, number> | undefined = state.board.priceUpGroups
  if (priceUpGroups) {
    const nextUp: Record<string, number> = {}
    for (const [gid, days] of Object.entries(priceUpGroups)) {
      if (days > 1) nextUp[gid] = days - 1
    }
    priceUpGroups = Object.keys(nextUp).length > 0 ? nextUp : undefined
  }

  // Increment day when all players have taken a turn (wrap-around)
  let day = state.day
  if (next === 0) day += 1

  return {
    ...state,
    day,
    turnContext: {
      currentPlayerId: players[next].id,
      phase: TurnPhaseV2.TURN_START,
      diceResults: [],
      diceCount: 2,
      moveSteps: 0,
      movePath: [],
      consecutiveDoubles: 0,
    },
    board: {
      ...state.board,
      sealedGroups: sealedGroups ?? {},
      priceUpGroups: priceUpGroups ?? {},
    },
  }
}
