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
    properties[tid] = { ...properties[tid], ownerId: undefined, level: 0 }
  }
  player.ownedTileIds = []
  player.bankrupt = true
}

// 掷骰 → 移动 → 结算落点。停无主地产挂决策点；停他人地产收租（付不起则破产）。
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
    const price = tile.price ?? 0
    if (!prop.ownerId) {
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
    } else if (prop.ownerId !== player.id && !prop.mortgaged) {
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

// 消解决策点（P2：buyProperty 的 买 / 放弃）。
function handleResolveDecision(state: GameState, optionId: string): GameState {
  const d = state.awaitingDecision
  if (!d) return state

  if (d.kind === 'buyProperty') {
    const players = state.players.map((p) => ({ ...p }))
    const properties = { ...state.properties }
    const log = [...state.log]
    const player = players.find((p) => p.id === d.playerId)
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

    return {
      ...state,
      players,
      properties,
      log,
      awaitingDecision: undefined,
      turn: { ...state.turn, phase: 'END_TURN' },
    }
  }

  return state
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
