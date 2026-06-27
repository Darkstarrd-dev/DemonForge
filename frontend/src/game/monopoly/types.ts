// 大富翁规则引擎 —— 类型定义
// 纯 TS，零渲染依赖（不得 import React/antd/Phaser/Three）。
// 数据模型说明见 docs/monopoly_plan.md §4。

// —— 地图（静态数据） ——

export type TileType =
  | 'go' // 起点（发薪）
  | 'property' // 地产（可买可升级）
  | 'station' // 车站
  | 'utility' // 公用事业
  | 'chance' // 机会
  | 'fate' // 命运
  | 'news' // 新闻
  | 'jail' // 监狱
  | 'hospital' // 医院
  | 'tax' // 税收
  | 'bank' // 银行
  | 'shop' // 商店（道具，后置）
  | 'parking' // 公园 / 免费停车

/** 棋盘格在 grid 中的位置（1-based）。支持任意坐标 → 不规整地图 / 3D 不改逻辑。 */
export interface TileCoord {
  row: number
  col: number
}

export interface Tile {
  index: number
  coord: TileCoord
  type: TileType
  name: string
  zoneId?: string // 街区（连号加成用，本期不强制）
  color?: string // blockout 街区色
  price?: number // 地产购买价
  upgradeCost?: number // 每级升级花费
  rentByLevel?: number[] // [持有, 1级, 2级, 3级, 地标]
  taxAmount?: number // 税收格扣款
}

export interface BoardConfig {
  size: number
  tiles: Tile[]
}

// —— 玩家与地产运行态 ——

export type ControllerKind = 'human' | 'ai'

export interface Player {
  id: string
  name: string
  color: string
  cash: number
  position: number // 当前格 index
  inJailTurns: number // >0 表示被困（监狱 / 医院）
  ownedTileIds: number[]
  bankrupt: boolean
  characterCardId?: string // 角色卡预留：绑定 M2 角色卡 cardId
  controller: ControllerKind // AI 预留：谁来决策
  aiNodeId?: string // AI 预留：用哪个 LLM 节点
}

/** 地产运行态，与 Tile 静态数据分离。 */
export interface PropertyState {
  tileId: number
  ownerId?: string
  level: number // 0..4（0 持有 / 1 / 2 / 3 / 地标）
  mortgaged: boolean
}

// —— 回合与决策 ——

export type TurnPhase = 'ROLL' | 'MOVE' | 'SETTLE' | 'DECIDE' | 'END_TURN'

export interface TurnState {
  currentPlayerId: string
  phase: TurnPhase
  dice?: [number, number]
  doublesCount: number
}

export type DecisionKind =
  | 'buyProperty'
  | 'upgradeProperty'
  | 'payOrMortgage'
  | 'jailChoice'
  | 'trade'

export interface DecisionOption {
  id: string
  label: string
}

/** 决策点：同时服务玩家 UI 与 AI（见 docs/monopoly_plan.md §6）。 */
export interface DecisionRequest {
  playerId: string
  kind: DecisionKind
  options: DecisionOption[]
  context: Record<string, unknown>
}

// —— 事件流与全局状态 ——

/** 事件流条目，便于回放 / AI 读历史。 */
export interface GameEvent {
  seq: number
  kind: string
  text: string // 人类可读日志
  data?: Record<string, unknown>
}

export type GameStatus = 'playing' | 'ended'

export interface GameState {
  board: BoardConfig
  players: Player[]
  properties: Record<number, PropertyState>
  turn: TurnState
  awaitingDecision?: DecisionRequest
  log: GameEvent[]
  status: GameStatus
  winnerId?: string
}

// —— Action（reducer 输入） ——
// P2 已加 RESOLVE_DECISION（消解决策点）；地产升级 / 抵押见后续阶段
// （见 docs/monopoly_plan.md §8）。
export type Action =
  | { type: 'NEW_GAME'; config: NewGameConfig }
  | { type: 'ROLL_DICE'; dice: [number, number] }
  | { type: 'END_TURN' }
  | { type: 'RESOLVE_DECISION'; optionId: string }

export interface NewGamePlayerSpec {
  name: string
  color: string
  controller: ControllerKind
  characterCardId?: string
  aiNodeId?: string
}

export interface NewGameConfig {
  board: BoardConfig
  players: NewGamePlayerSpec[]
  startingCash: number
}
