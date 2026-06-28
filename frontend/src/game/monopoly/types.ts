// 大富翁规则引擎 —— 类型定义
// 纯 TS，零渲染依赖（不得 import React/antd/Phaser/Three）。
// §3 全量类型：P0-P6 blockout 所用类型保留（向后兼容）+ §3 新类型追加。
// 旧类型：P0-P6 blockout 使用（BoardConfig/Tile/Player 等）
// 新类型：M0+ 全量数据驱动层（BoardData/CardDefinition/FullGameState 等）

// ════════════════════════════════════════════
// §3.0 基础枚举 & 工具类型
// ════════════════════════════════════════════

// ------ 旧的格子类型（P0-P6 blockout 用） ------
export type TileType =
  | 'go' | 'property' | 'station' | 'utility' | 'chance'
  | 'fate' | 'news' | 'jail' | 'hospital' | 'tax'
  | 'bank' | 'shop' | 'parking'

// ------ 新的全量格子类型（§3.2） ------
export const SpaceType = {
  PROPERTY: 'PROPERTY',
  COMPANY: 'COMPANY',
  START: 'START',
  JAIL_VISIT: 'JAIL_VISIT',
  JAIL: 'JAIL',
  HOSPITAL: 'HOSPITAL',
  MAGIC_HOUSE: 'MAGIC_HOUSE',
  BANK: 'BANK',
  SHOP: 'SHOP',
  LOTTERY: 'LOTTERY',
  NEWS: 'NEWS',
  MINI_GAME: 'MINI_GAME',
  SCORE: 'SCORE',
  GAS_STATION: 'GAS_STATION',
  PARK: 'PARK',
  TAX: 'TAX',
  TELEPORT: 'TELEPORT',
  TREASURE_BOX: 'TREASURE_BOX',
  FATE: 'FATE',
  ATTACK_SPACE: 'ATTACK_SPACE',
  EMPTY: 'EMPTY',
} as const
export type SpaceType = (typeof SpaceType)[keyof typeof SpaceType]

export const PlayerStatus = { ACTIVE: 'ACTIVE', IN_JAIL: 'IN_JAIL', IN_HOSPITAL: 'IN_HOSPITAL', BANKRUPT: 'BANKRUPT' } as const
export type PlayerStatus = (typeof PlayerStatus)[keyof typeof PlayerStatus]

export const GamePhase = { SETUP: 'SETUP', PLAYING: 'PLAYING', GAME_OVER: 'GAME_OVER' } as const
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase]

export const GameStatus = { playing: 'playing', ended: 'ended' } as const
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus]

// ════════════════════════════════════════════
// §3.2 地图数据结构
// ════════════════════════════════════════════

export interface TileCoord { row: number; col: number }
export interface Position3D { x: number; y: number; z: number }

/** 资产引用（2D/3D 通用，本轮仅定义结构，资产后置填充） */
export interface AssetRef {
  spriteId?: string
  iconId?: string
  modelId?: string
  scale?: [number, number, number]
  rotation?: [number, number, number]
  idleAnimId?: string
  actionAnimId?: string
  effects?: string[]
}

export interface BuildingLevel {
  level: number
  buildCost: number
  baseRent: number
}

export interface TilemapObject {
  id: string
  spriteId?: string
  modelId?: string
  coord: TileCoord
  assetRef?: AssetRef
}

export interface TilemapLayer {
  id: string
  name: string
  type: 'tile' | 'object' | 'decoration'
  visible: boolean
  zIndex: number
  data?: number[][] | TilemapObject[]
}

export interface PropertyGroup {
  groupId: string
  name: string
  spaceIds: string[]
}

export interface CenterAreaDef {
  title: string
  subtitle?: string
  assetRef?: AssetRef
}

export interface BoardShape {
  kind: 'ring' | 'grid' | 'custom'
  gridSide?: number
  centerArea?: CenterAreaDef
}

/** 地图静态定义（数据文件加载，运行时只读） */
export interface BoardData {
  mapId: string
  version: string
  name: string
  size: number
  tiles: TileV2[]
  groups: PropertyGroup[]
  boardShape: BoardShape
  layers: TilemapLayer[]
  metadata?: Record<string, unknown>
}

// ------ 旧 Tile（P0-P6 blockout 用） ------
export interface Tile {
  index: number
  coord: TileCoord
  type: TileType
  name: string
  zoneId?: string
  color?: string
  price?: number
  upgradeCost?: number
  rentByLevel?: number[]
  taxAmount?: number
}

// ------ 新 Tile（§3.2 全量字段） ------
export interface TileV2 {
  id: string
  index: number
  type: SpaceType
  name: string
  coord: TileCoord
  neighborIds: string[]
  groupId?: string
  landType?: 'RESIDENTIAL' | 'COMMERCIAL'
  basePrice?: number
  buildingLevels?: BuildingLevel[]
  isChainStoreCandidate?: boolean
  taxRate?: number
  companyType?: CompanyType
  weaponType?: 'MINE' | 'MISSILE' | 'EXPLOSIVE' | 'NUKE'
  damage?: number
  damageRange?: number
  assetRef?: AssetRef
}

export interface BoardConfig { size: number; tiles: Tile[] }

// ------ 地图运行时状态（§3.2） ------
export interface BoardState {
  data: BoardData
  properties: Record<string, PropertyState>
  sealedGroups: Record<string, number>
  priceUpGroups: Record<string, number>
}

/** 地产运行态（旧：P0-P6 blockout 用） */
export interface PropertyState {
  tileId: number
  ownerId?: string
  level: number
  mortgaged: boolean
  isChainStore?: boolean
  buildingAssetRef?: AssetRef
}

// ════════════════════════════════════════════
// §3.3 玩家
// ════════════════════════════════════════════

export type ControllerKind = 'human' | 'ai'

/** 玩家（旧：P0-P6 blockout 用） */
export interface Player {
  id: string
  name: string
  color: string
  cash: number
  position: number
  inJailTurns: number
  ownedTileIds: number[]
  bankrupt: boolean
  characterCardId?: string
  controller: ControllerKind
  aiNodeId?: string
  // 扩展字段（§3.3，旧代码访问不到时不设也能用）
  totalAssets?: number
  bankDeposit?: number
  bankLoan?: number
  loanDueDay?: number
  stocks?: Record<string, number>
  previousPosition?: number
  hand?: CardInstance[]
  items?: ItemInstance[]
  status?: PlayerStatus
  jailTurns?: number
  hospitalTurns?: number
  skipTurns?: number
  isCollectingRent?: boolean
  consecutiveDoubles?: number
  godId?: string
  godRemainingDays?: number
  points?: number
  vehicle?: 'PEDESTRIAN' | 'MOTORCYCLE' | 'CAR'
  aiDifficulty?: 'easy' | 'normal' | 'hard'
}

export interface CardInstance { definitionId: string; instanceId: string }
export interface ItemInstance { definitionId: string; instanceId: string; durability: number }

// ════════════════════════════════════════════
// §3.4 卡片系统（30 种 + 反制链）
// ════════════════════════════════════════════

export const CardEffectType = {
  TELEPORT_TO_SPACE: 'TELEPORT_TO_SPACE',
  MOVE_BACKWARD: 'MOVE_BACKWARD',
  MOVE_FORWARD: 'MOVE_FORWARD',
  CHANGE_DIRECTION: 'CHANGE_DIRECTION',
  FORCE_MOVE: 'FORCE_MOVE',
  EQUALIZE_CASH_ALL: 'EQUALIZE_CASH_ALL',
  EQUALIZE_CASH_ONE: 'EQUALIZE_CASH_ONE',
  STEAL_CARD_ITEM: 'STEAL_CARD_ITEM',
  TAX_TARGET: 'TAX_TARGET',
  UPGRADE_GROUP: 'UPGRADE_GROUP',
  DEMOLISH_GROUP: 'DEMOLISH_GROUP',
  DEMOLISH_ONE: 'DEMOLISH_ONE',
  DOWNGRADE_ONE: 'DOWNGRADE_ONE',
  CONVERT_CHAIN_STORE: 'CONVERT_CHAIN_STORE',
  FORCE_PURCHASE: 'FORCE_PURCHASE',
  SWAP_LAND: 'SWAP_LAND',
  SWAP_BUILDING: 'SWAP_BUILDING',
  FORCE_AUCTION: 'FORCE_AUCTION',
  PRICE_UP_GROUP: 'PRICE_UP_GROUP',
  SEAL_GROUP: 'SEAL_GROUP',
  SEND_TO_JAIL: 'SEND_TO_JAIL',
  FRAME_TRANSFER: 'FRAME_TRANSFER',
  REVENGE: 'REVENGE',
  IMMUNITY: 'IMMUNITY',
  FREE_PASS: 'FREE_PASS',
  FREEZE: 'FREEZE',
  SLOW_TURTLE: 'SLOW_TURTLE',
  STOP_TURN: 'STOP_TURN',
  STOCK_UP: 'STOCK_UP',
  STOCK_DOWN: 'STOCK_DOWN',
  SUMMON_GOD: 'SUMMON_GOD',
  DISMISS_GOD: 'DISMISS_GOD',
  ALLIANCE: 'ALLIANCE',
} as const
export type CardEffectType = (typeof CardEffectType)[keyof typeof CardEffectType]

export const CardUseTiming = { ON_TURN: 'ON_TURN', ON_RENT: 'ON_RENT', REACTION: 'REACTION', PASSIVE: 'PASSIVE', ANYTIME: 'ANYTIME' } as const
export type CardUseTiming = (typeof CardUseTiming)[keyof typeof CardUseTiming]

export interface CardDefinition {
  id: string
  name: string
  description: string
  pointCost: number
  targetType: 'SELF' | 'OPPONENT' | 'ALL' | 'PROPERTY' | 'GLOBAL'
  effectType: CardEffectType
  effectParams: Record<string, unknown>
  useTiming: CardUseTiming
  stackable: boolean
  duration: number
  canUseOnCompany: boolean
  counterCards: string[]
  versions: string[]
  iconAssetRef?: AssetRef
}

export interface ShopInventory {
  availableCards: string[]
  refreshOnDay: number
}

export interface CardDeckState {
  definitions: CardDefinition[]
  drawPile: string[]
  discardPile: string[]
  shopInventory: ShopInventory
}

// ════════════════════════════════════════════
// §3.5 道具系统（13 种）
// ════════════════════════════════════════════

export const ItemCategory = { VEHICLE: 'VEHICLE', WEAPON: 'WEAPON', TRAP: 'TRAP', TOOL: 'TOOL' } as const
export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory]

export interface ItemDefinition {
  id: string
  name: string
  description: string
  category: ItemCategory
  pointCost: number
  acquireMethod: 'SHOP' | 'RESEARCH_LAB' | 'PICKUP' | 'INITIAL'
  effectRange: number
  durability: number
  versions: string[]
  iconAssetRef?: AssetRef
}

// ════════════════════════════════════════════
// §3.6 神明系统（13 种）
// ════════════════════════════════════════════

export interface GodEffect {
  type: string
  value: number
  target: 'SELF' | 'OPPONENT' | 'ALL'
}

export interface GodDefinition {
  id: string
  name: string
  alignment: 'GOOD' | 'BAD' | 'NEUTRAL'
  durationDays: number
  canDismiss: boolean
  transformTo?: string
  effects: GodEffect[]
  iconAssetRef?: AssetRef
}

// ════════════════════════════════════════════
// §3.7 角色（与 M2 EntityCard 映射）
// ════════════════════════════════════════════

export interface MonopolyCharacter {
  id: string
  name: string
  persona: string
  color: string
  startingCash?: number
  specialAbility?: string
  avatarAssetRef?: AssetRef
  pawnAssetRef?: AssetRef
}

// ════════════════════════════════════════════
// §3.8 公司企业
// ════════════════════════════════════════════

export const CompanyType = {
  BANK: 'BANK', DEPARTMENT_STORE: 'DEPARTMENT_STORE', GAS_STATION: 'GAS_STATION',
  AMUSEMENT_PARK: 'AMUSEMENT_PARK', RESTAURANT: 'RESTAURANT',
  TECH_COMPANY: 'TECH_COMPANY', INSURANCE_COMPANY: 'INSURANCE_COMPANY',
} as const
export type CompanyType = (typeof CompanyType)[keyof typeof CompanyType]

export interface CompanyDefinition {
  id: string
  name: string
  type: CompanyType
  initialStockPrice: number
  chairmanPrivilege: string
  iconAssetRef?: AssetRef
}

export interface CompanyState {
  companyId: string
  stockPrice: number
  stockLimitUpDays: number
  stockLimitDownDays: number
  shareholders: Record<string, number>
  chairmanId?: string
}

// ════════════════════════════════════════════
// §3.9 事件池
// ════════════════════════════════════════════

export const EventEffectType = {
  ALL_GAIN_CASH: 'ALL_GAIN_CASH', ALL_LOSE_CASH: 'ALL_LOSE_CASH',
  ALL_GAIN_PERCENT: 'ALL_GAIN_PERCENT', ALL_LOSE_PERCENT: 'ALL_LOSE_PERCENT',
  PROPERTY_PRICE_UP: 'PROPERTY_PRICE_UP', PROPERTY_PRICE_DOWN: 'PROPERTY_PRICE_DOWN',
  RANDOM_PLAYER_GAIN: 'RANDOM_PLAYER_GAIN', RANDOM_PLAYER_LOSE: 'RANDOM_PLAYER_LOSE',
  STOCK_SURGE: 'STOCK_SURGE', STOCK_CRASH: 'STOCK_CRASH',
} as const
export type EventEffectType = (typeof EventEffectType)[keyof typeof EventEffectType]

export interface EventEffect {
  type: EventEffectType
  value: number
  target: 'ALL' | 'RANDOM' | 'RICHEST' | 'POOREST'
}

export interface NewsEvent {
  id: string
  title: string
  description: string
  effect: EventEffect
}

export interface MagicHouseEffect {
  id: string
  description: string
  type: EventEffectType | 'TELEPORT' | 'GIVE_CARD' | 'STEAL_ALL_ITEMS' | 'CHANGE_VEHICLE'
  params: Record<string, unknown>
  isPositive: boolean
}

export interface FateEvent {
  id: string
  title: string
  description: string
  effect: EventEffect | 'TELEPORT' | 'GIVE_CARD' | 'SEND_TO_JAIL' | 'GOD_POSSESSION'
  params: Record<string, unknown>
}

// ════════════════════════════════════════════
// §3.10 小游戏 / 乐透 / 宝箱 / 传送
// ════════════════════════════════════════════

export interface MiniGameDef {
  id: string
  name: string
  triggerCondition: 'LAND_ON_SPACE' | 'SPECIFIC_DAY' | 'CARD_EFFECT'
  rewardFormula: string
  penaltyFormula: string
  gameModuleId?: string
}

export interface MiniGameResult {
  playerId: string
  gameId: string
  score: number
  cashDelta: number
  pointDelta: number
}

export interface LotteryConfig { betCost: number; prizeFormula: string }

export interface TreasureBoxConfig {
  possibleRewards: Array<
    { type: 'cash'; value: number }
    | { type: 'card'; cardId: string }
    | { type: 'item'; itemId: string }
    | { type: 'points'; value: number }
  >
}

export interface TeleportConfig {
  mode: 'RANDOM' | 'SPECIFIC' | 'NEAREST_TYPE'
  targetType?: SpaceType
}

// ════════════════════════════════════════════
// §3.11 经济系统
// ════════════════════════════════════════════

export interface BankAccount {
  playerId: string
  deposit: number
  loan: number
  loanDueDay: number
}

export interface EconomyState {
  priceIndex: number
  initialCash: number
  initialPlayerCount: number
  bankruptCount: number
  priceIndexMode: 'asset_based' | 'auto_increment'
  autoIncrementIntervalDays?: number
  lastAutoIncrementDay?: number
  bankAccounts: Record<string, BankAccount>
  companies: Record<string, CompanyState>
  dividendDay: number
  depositInterestRate: number
  loanTermDays: number
}

// ════════════════════════════════════════════
// §3.12 游戏配置与多版本变体
// ════════════════════════════════════════════

export interface GameConfig {
  playerCount: number
  startingCash: number
  mapId: string
  victoryCondition: 'LAST_STANDING' | 'TARGET_ASSETS' | 'MAX_TURNS'
  targetAssets?: number
  maxTurns?: number
  diceMode: 'dice' | 'movement_card'
  allowDoubleRoll: boolean
  allowConsecutiveDoublesJail: boolean
  priceIndexEnabled: boolean
  priceIndexMode: 'asset_based' | 'auto_increment'
  bankEnabled: boolean
  stockEnabled: boolean
  initialDeposit: number
  cardHandLimit: number
  pointSystem: 'points' | 'cash'
  bankruptcyMode: 'ELIMINATE' | 'DEBT'
  gameMode: 'STORY' | 'BIOGRAPHY' | 'HOT_SEAT' | 'ONLINE'
  variant: 'classic' | 'hot_fight' | 'richman_spinoff'
  renderMode: '2D' | '3D'
  version: 'richman4' | 'richman8' | 'richman10' | 'richman11'
}

export interface ConfigPreset {
  id: string
  name: string
  config: GameConfig
}

// ════════════════════════════════════════════
// §3.13 存档
// ════════════════════════════════════════════

export interface SaveGame {
  version: string
  timestamp: number
  gameState: FullGameState
  config: GameConfig
}

// ════════════════════════════════════════════
// §3.14 决策点
// ════════════════════════════════════════════

export type DecisionKind =
  | 'buyProperty' | 'upgradeProperty' | 'payOrMortgage' | 'jailChoice' | 'trade'
  | 'useCard' | 'useCardChoice' | 'useItem' | 'bankOperation' | 'stockTrade' | 'choosePath'
  | 'cardReaction'
  | 'lotteryBet' | 'teleportTarget' | 'magicHouseEffect'

export interface DecisionOption {
  id: string
  label: string
  preview?: { cashDelta?: number; description?: string }
}

export interface DecisionRequest {
  playerId: string
  kind: DecisionKind
  options: DecisionOption[]
  context: Record<string, unknown>
  cardUseWindowFor?: string
}

// ════════════════════════════════════════════
// §3.15 Action（reducer 输入，全量）
// ════════════════════════════════════════════

export type Action =
  | { type: 'NEW_GAME'; config: NewGameConfig }
  | { type: 'LOAD_GAME'; save: SaveGame }
  | { type: 'ROLL_DICE'; dice: [number, number] }
  | { type: 'CHOOSE_PATH'; direction: 'LEFT' | 'RIGHT' }
  | { type: 'END_TURN' }
  | { type: 'RESOLVE_DECISION'; optionId: string; extra?: Record<string, unknown> }
  | { type: 'PURCHASE_PROPERTY'; tileId: number }
  | { type: 'DECLINE_PURCHASE' }
  | { type: 'BUILD_STRUCTURE'; tileId: number }
  | { type: 'DECLINE_BUILD' }
  | { type: 'MORTGAGE_PROPERTY'; tileId: number }
  | { type: 'REDEEM_PROPERTY'; tileId: number }
  | { type: 'USE_CARD'; cardInstanceId: string; targetId?: string; targetTileId?: number }
  | { type: 'USE_ITEM'; itemInstanceId: string; targetTileId?: number }
  | { type: 'BUY_CARD'; cardDefId: string }
  | { type: 'BUY_ITEM'; itemDefId: string }
  | { type: 'BANK_DEPOSIT'; amount: number }
  | { type: 'BANK_WITHDRAW'; amount: number }
  | { type: 'BANK_LOAN'; amount: number }
  | { type: 'BANK_REPAY'; amount: number }
  | { type: 'BUY_STOCK'; companyId: string; quantity: number }
  | { type: 'SELL_STOCK'; companyId: string; quantity: number }
  | { type: 'PAY_JAIL_FEE' }
  | { type: 'USE_JAIL_CARD' }
  | { type: 'DECLARE_BANKRUPT' }
  | { type: 'TRIGGER_EVENT'; eventId: string }
  | { type: 'MINI_GAME_RESULT'; result: MiniGameResult }

// ════════════════════════════════════════════
// P0-P6 游戏状态（blockout 用，向后兼容）
// ════════════════════════════════════════════

export type TurnPhase = 'ROLL' | 'MOVE' | 'SETTLE' | 'DECIDE' | 'END_TURN'

export type GameStatusStr = 'playing' | 'ended'

export interface TurnState {
  currentPlayerId: string
  phase: TurnPhase
  dice?: [number, number]
  doublesCount: number
}

export interface GameEvent {
  seq: number
  kind: string
  text: string
  data?: Record<string, unknown>
}

/** P0-P6 blockout 游戏状态（旧系统），M2 起扩展 economy/day 字段，M3 起扩展 cardDeck */
export interface GameState {
  board: BoardConfig
  mapId: string
  mapName: string
  players: Player[]
  properties: Record<number, PropertyState>
  turn: TurnState
  awaitingDecision?: DecisionRequest
  log: GameEvent[]
  status: GameStatusStr
  winnerId?: string
  day?: number
  economy?: EconomyState
  cardDeck?: CardDeckState
  priceUpGroups?: Record<string, number>
  sealedGroups?: Record<string, number>
}

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
  mapId?: string
}

// ════════════════════════════════════════════
// §3.1 顶层 FullGameState（M1+ 全量系统用）
// ════════════════════════════════════════════

export interface TurnContext {
  currentPlayerId: string
  phase: TurnPhaseV2
  diceResults: number[]
  diceCount: number
  moveSteps: number
  movePath: string[]
  pendingRent?: RentInfo
  pendingPurchase?: PurchaseInfo
  cardUseWindowFor?: string
  consecutiveDoubles: number
}

export interface RentInfo {
  tileId: string
  amount: number
  debtorId: string
  creditorId: string
}

export interface PurchaseInfo {
  tileId: string
  price: number
}

export const TurnPhaseV2 = {
  TURN_START: 'TURN_START',
  ROLL_DICE: 'ROLL_DICE',
  MOVING: 'MOVING',
  SPACE_RESOLUTION: 'SPACE_RESOLUTION',
  PURCHASE_DECISION: 'PURCHASE_DECISION',
  BUILD_DECISION: 'BUILD_DECISION',
  RENT_PAYMENT: 'RENT_PAYMENT',
  CARD_EVENT: 'CARD_EVENT',
  SPECIAL_SPACE: 'SPECIAL_SPACE',
  CARD_USE_WINDOW: 'CARD_USE_WINDOW',
  STOCK_TRADE: 'STOCK_TRADE',
  TURN_END: 'TURN_END',
} as const
export type TurnPhaseV2 = (typeof TurnPhaseV2)[keyof typeof TurnPhaseV2]

export interface GameLogEntry {
  seq: number
  kind: string
  text: string
  data?: Record<string, unknown>
}

/** §3.1 全量游戏状态（M1+ 用） */
export interface FullGameState {
  version: string
  mapId: string
  day: number
  phase: GamePhase
  turnContext: TurnContext
  board: BoardState
  players: Player[]
  cardDeck: CardDeckState
  economy: EconomyState
  config: GameConfig
  pendingEvents: GameEvent[]
  awaitingDecision?: DecisionRequest
  log: GameLogEntry[]
  rngSeed: number
  status: GameStatus
  winnerId?: string
}

// ════════════════════════════════════════════
// AI 行为模型（§6）
// ════════════════════════════════════════════

export interface AIConfig {
  difficulty: 'easy' | 'normal' | 'hard'
  purchaseThreshold: number
  buildThreshold: number
  attackCardPropensity: number
  targetLeader: boolean
  considerPriceIndex: boolean
}

export interface AIDecisionContext {
  gameState: GameState
  playerId: string
  legalActions: Action[]
  request?: DecisionRequest
}

export interface AIDecisionResult {
  action: Action
  reason: string
}
