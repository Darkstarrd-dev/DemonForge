// 大富翁规则引擎：纯函数 reducer + 初始状态构造。
// 引擎层零渲染依赖。随机源（rollDice）独立于 reducer，dice 经 action 传入，
// 以保持 reducer 纯、StrictMode 下重复调用安全。里程碑见 docs/monopoly_plan.md §8。

import type { Action, GameState, NewGameConfig, Player, PropertyState } from './types'

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
    case 'END_TURN':
      return handleEndTurn(state)
    default:
      return state
  }
}

function currentIndex(state: GameState): number {
  return state.players.findIndex((p) => p.id === state.turn.currentPlayerId)
}

// 掷骰 → 移动 → 结算落点。住院中则跳过本回合并递减。
function handleRoll(state: GameState, dice: [number, number]): GameState {
  const players = [...state.players]
  const idx = currentIndex(state)
  const player = { ...players[idx] }
  const log = [...state.log] // seq 直接取 push 前的 log.length

  if (player.inJailTurns > 0) {
    player.inJailTurns -= 1
    log.push({
      seq: log.length,
      kind: 'jailSkip',
      text: `${player.name} 住院休养，跳过本回合（剩 ${player.inJailTurns} 回合）`,
    })
    players[idx] = player
    return { ...state, players, log, turn: { ...state.turn, phase: 'END_TURN' } }
  }

  const sum = dice[0] + dice[1]
  const size = state.board.size
  const from = player.position
  const to = (from + sum) % size

  if (from + sum >= size) {
    player.cash += GO_SALARY
    log.push({ seq: log.length, kind: 'salary', text: `${player.name} 经过起点，领取薪水 ¥${GO_SALARY}` })
  }
  player.position = to

  const tile = state.board.tiles[to]
  log.push({
    seq: log.length,
    kind: 'move',
    text: `${player.name} 掷出 ${dice[0]}+${dice[1]}=${sum}，走到「${tile.name}」`,
  })

  // 落点结算（P1：住院 / 税收；地产买卖 / 收租见 P2）
  if (tile.type === 'hospital') {
    player.inJailTurns = HOSPITAL_TURNS
    log.push({
      seq: log.length,
      kind: 'hospital',
      text: `${player.name} 受伤住院，将休养 ${HOSPITAL_TURNS} 回合`,
    })
  } else if (tile.type === 'tax') {
    const tax = tile.taxAmount ?? 0
    player.cash -= tax
    log.push({ seq: log.length, kind: 'tax', text: `${player.name} 缴纳税款 ¥${tax}` })
  }

  players[idx] = player
  return { ...state, players, log, turn: { ...state.turn, dice, phase: 'END_TURN' } }
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
