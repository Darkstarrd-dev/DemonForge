// 大富翁规则引擎：纯函数 reducer + 初始状态构造。
// 引擎层零渲染依赖。随机源（rollDice）独立于 reducer，dice 经 action 传入，
// 以保持 reducer 纯、StrictMode 下重复调用安全。里程碑见 docs/monopoly_plan.md §8。

import type {
  Action,
  DecisionRequest,
  GameState,
  NewGameConfig,
  Player,
  PropertyState,
} from './types'

const GO_SALARY = 2000 // 经过起点发薪
const HOSPITAL_TURNS = 2 // 住院休养回合数
const MAX_LEVEL = 4 // 地标
const MORTGAGE_RATE = 0.5 // 抵押得款 = 地价 × 0.5
const REDEEM_INTEREST = 1.1 // 赎回 = 抵押款 × 1.1

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

  // 仅为地产格建运行态，与 Tile 静态数据分离。
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

/** 掷两颗骰子（1–6）。在 reducer 之外调用，dice 经 action 传入以保持 reducer 纯。 */
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
      return handleMortgage(state, action.tileId)
    case 'REDEEM_PROPERTY':
      return handleRedeem(state, action.tileId)
    case 'END_TURN':
      return handleEndTurn(state)
    default:
      return state
  }
}

function currentIndex(state: GameState): number {
  return state.players.findIndex((p) => p.id === state.turn.currentPlayerId)
}

// 破产清算：释放名下地产（归还银行），标记破产。
function liquidate(player: Player, properties: Record<number, PropertyState>) {
  for (const tid of player.ownedTileIds) {
    properties[tid] = { ...properties[tid], ownerId: undefined, level: 0, mortgaged: false }
  }
  player.ownedTileIds = []
  player.bankrupt = true
}

// 掷骰 → 移动 → 结算落点：无主地产可买、自己地产可升级、他人地产收租（付不起则破产）。
function handleRoll(state: GameState, dice: [number, number]): GameState {
  const players = state.players.map((p) => ({ ...p })) // 收租可能改两名玩家，整体浅拷贝
  const properties = { ...state.properties }
  const log = [...state.log]
  const pushLog = (kind: string, text: string) => log.push({ seq: log.length, kind, text })
  const player = players[currentIndex(state)]

  if (player.inJailTurns > 0) {
    player.inJailTurns -= 1
    pushLog('jailSkip', `${player.name} 住院休养，跳过本回合（剩 ${player.inJailTurns} 回合）`)
    return { ...state, players, log, turn: { ...state.turn, phase: 'END_TURN' } }
  }

  const sum = dice[0] + dice[1]
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
  } else if (tile.type === 'tax') {
    const tax = tile.taxAmount ?? 0
    player.cash -= tax
    pushLog('tax', `${player.name} 缴纳税款 ¥${tax}`)
  } else if (tile.type === 'property') {
    const prop = properties[tile.index]
    if (!prop.ownerId) {
      // 无主：可买
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
      // 自己的地产：可升级（未到地标且买得起）
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
      // 他人未抵押地产：按等级收租
      const rent = (tile.rentByLevel ?? [0])[prop.level] ?? 0
      const owner = players.find((p) => p.id === prop.ownerId)
      if (owner) {
        if (player.cash >= rent) {
          player.cash -= rent
          owner.cash += rent
          pushLog('rent', `${player.name} 向 ${owner.name} 支付过路费 ¥${rent}`)
        } else {
          owner.cash += player.cash
          pushLog(
            'bankrupt',
            `${player.name} 无力支付过路费 ¥${rent}，宣告破产（剩余 ¥${player.cash} 归 ${owner.name}）`,
          )
          player.cash = 0
          liquidate(player, properties)
        }
      }
    }
  }

  // 胜负：仅剩一名未破产玩家即结束
  let status = state.status
  let winnerId = state.winnerId
  const alive = players.filter((p) => !p.bankrupt)
  if (alive.length <= 1) {
    status = 'ended'
    winnerId = alive[0]?.id
    const winner = players.find((p) => p.id === winnerId)
    if (winner) pushLog('win', `🏆 ${winner.name} 获胜！`)
  }

  return {
    ...state,
    players,
    properties,
    log,
    status,
    winnerId,
    turn: { ...state.turn, dice, phase: decision ? 'DECIDE' : 'END_TURN' },
    awaitingDecision: decision,
  }
}

// 消解决策点：buyProperty（买 / 放弃）、upgradeProperty（升级 / 暂不）。
function handleResolveDecision(state: GameState, optionId: string): GameState {
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

  return state
}

// 抵押地产换现金（抵押期间不收租）。
function handleMortgage(state: GameState, tileId: number): GameState {
  const prop = state.properties[tileId]
  if (!prop || !prop.ownerId || prop.mortgaged) return state
  const tile = state.board.tiles[tileId]
  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.properties }
  const log = [...state.log]
  const owner = players.find((p) => p.id === prop.ownerId)
  if (!owner) return state
  const value = Math.round(((tile.price ?? 0) * MORTGAGE_RATE) / 10) * 10
  owner.cash += value
  properties[tileId] = { ...prop, mortgaged: true }
  log.push({ seq: log.length, kind: 'mortgage', text: `${owner.name} 抵押「${tile.name}」，获得 ¥${value}` })
  return { ...state, players, properties, log }
}

// 赎回抵押地产（含利息），恢复收租。
function handleRedeem(state: GameState, tileId: number): GameState {
  const prop = state.properties[tileId]
  if (!prop || !prop.ownerId || !prop.mortgaged) return state
  const tile = state.board.tiles[tileId]
  const players = state.players.map((p) => ({ ...p }))
  const properties = { ...state.properties }
  const log = [...state.log]
  const owner = players.find((p) => p.id === prop.ownerId)
  if (!owner) return state
  const cost = Math.round(((tile.price ?? 0) * MORTGAGE_RATE * REDEEM_INTEREST) / 10) * 10
  if (owner.cash < cost) return state // 资金不足无法赎回
  owner.cash -= cost
  properties[tileId] = { ...prop, mortgaged: false }
  log.push({ seq: log.length, kind: 'redeem', text: `${owner.name} 赎回「${tile.name}」，花费 ¥${cost}` })
  return { ...state, players, properties, log }
}

// 切换到下一个未破产玩家，回合阶段回到 ROLL。
function handleEndTurn(state: GameState): GameState {
  const players = state.players
  const n = players.length
  let next = (currentIndex(state) + 1) % n
  let guard = 0
  while (players[next].bankrupt && guard < n) {
    next = (next + 1) % n
    guard += 1
  }
  return {
    ...state,
    turn: { currentPlayerId: players[next].id, phase: 'ROLL', doublesCount: 0, dice: undefined },
  }
}
