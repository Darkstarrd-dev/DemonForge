import type { GameState, GameConfig, SaveGame, SaveMeta, TurnContext, EconomyState, Player } from '../types'
import { GamePhase, TurnPhaseV2 } from '../types'

export const SAVE_VERSION = 'richman@1.0.0'

export function generateSaveId(): string {
  return `save_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function serializeGame(state: GameState, config: GameConfig, name: string): SaveGame {
  return {
    id: generateSaveId(),
    name: name || `存档 ${new Date().toLocaleString('zh-CN')}`,
    version: SAVE_VERSION,
    timestamp: Date.now(),
    gameState: JSON.parse(JSON.stringify(state)),
    config: JSON.parse(JSON.stringify(config)),
  }
}

export function deserializeGame(save: SaveGame): { state: GameState; config: GameConfig } {
  if (!save.gameState || !save.config) {
    throw new Error('存档数据不完整')
  }
  const migrated = migrateSaveVersion(save)
  const state = JSON.parse(JSON.stringify(migrated.gameState)) as GameState
  const config = JSON.parse(JSON.stringify(migrated.config)) as GameConfig
  return { state, config }
}

export function extractSaveMeta(save: SaveGame): SaveMeta {
  const s = save.gameState
  const alive = s.players.filter((p) => !p.bankrupt)
  return {
    id: save.id,
    name: save.name,
    version: save.version,
    timestamp: save.timestamp,
    playerCount: alive.length,
    mapId: s.mapId,
    mapName: s.mapName,
    day: s.day,
    status: s.status,
  }
}

const DEFAULT_TURN_CONTEXT: TurnContext = {
  currentPlayerId: '',
  phase: TurnPhaseV2.TURN_START,
  diceResults: [],
  diceCount: 2,
  moveSteps: 0,
  movePath: [],
  consecutiveDoubles: 0,
}

const DEFAULT_ECONOMY: Partial<EconomyState> = {
  priceIndex: 1.0,
  priceIndexMode: 'asset_based',
  depositInterestRate: 0.05,
  loanTermDays: 10,
  dividendDay: 5,
  bankAccounts: {},
  companies: {},
  bankruptCount: 0,
}

const DEFAULT_PLAYER: Partial<Player> = {
  hand: [],
  items: [],
  bankDeposit: 0,
  bankLoan: 0,
  loanDueDay: 0,
  stocks: {},
  points: 0,
  jailTurns: 0,
  hospitalTurns: 0,
  skipTurns: 0,
  vehicle: 'PEDESTRIAN',
  consecutiveDoubles: 0,
}

export function migrateSaveVersion(save: SaveGame): SaveGame {
  if (save.version === SAVE_VERSION) return save
  const s = { ...save, gameState: { ...save.gameState } } as SaveGame

  // 版本号升级
  if (s.version < 'richman@1.0.0') {
    s.version = SAVE_VERSION
  }

  const gs = s.gameState as unknown as Record<string, unknown>

  // TurnContext 字段补全
  if (gs.turnContext) {
    const tc = gs.turnContext as Record<string, unknown>
    if (tc.diceCount === undefined) tc.diceCount = DEFAULT_TURN_CONTEXT.diceCount
    if (tc.moveSteps === undefined) tc.moveSteps = DEFAULT_TURN_CONTEXT.moveSteps
    if (tc.movePath === undefined) tc.movePath = DEFAULT_TURN_CONTEXT.movePath
    if (tc.consecutiveDoubles === undefined) tc.consecutiveDoubles = DEFAULT_TURN_CONTEXT.consecutiveDoubles
    if (tc.phase === undefined) tc.phase = DEFAULT_TURN_CONTEXT.phase
    if (tc.diceResults === undefined) tc.diceResults = DEFAULT_TURN_CONTEXT.diceResults
  } else {
    gs.turnContext = DEFAULT_TURN_CONTEXT
  }

  // EconomyState 字段补全
  if (gs.economy) {
    const ec = gs.economy as Record<string, unknown>
    if (ec.bankAccounts === undefined) ec.bankAccounts = DEFAULT_ECONOMY.bankAccounts
    if (ec.companies === undefined) ec.companies = DEFAULT_ECONOMY.companies
    if (ec.priceIndex === undefined) ec.priceIndex = DEFAULT_ECONOMY.priceIndex
    if (ec.priceIndexMode === undefined) ec.priceIndexMode = DEFAULT_ECONOMY.priceIndexMode
    if (ec.depositInterestRate === undefined) ec.depositInterestRate = DEFAULT_ECONOMY.depositInterestRate
    if (ec.loanTermDays === undefined) ec.loanTermDays = DEFAULT_ECONOMY.loanTermDays
    if (ec.dividendDay === undefined) ec.dividendDay = DEFAULT_ECONOMY.dividendDay
    if (ec.bankruptCount === undefined) ec.bankruptCount = DEFAULT_ECONOMY.bankruptCount
    if (ec.initialCash === undefined) ec.initialCash = gs.players ? (gs.players as Player[]).length * 15000 : 60000
    if (ec.initialPlayerCount === undefined) ec.initialPlayerCount = gs.players ? (gs.players as Player[]).length : 4
  } else {
    gs.economy = DEFAULT_ECONOMY
  }

  // ItemDeckState 字段补全（旧存档可能缺 mapName/shopInventory）
  if (gs.itemDeck) {
    const id = gs.itemDeck as Record<string, unknown>
    if (id.shopInventory === undefined) id.shopInventory = {}
    if (id.researchInventory === undefined) id.researchInventory = {}
  }

  // Player 字段补全
  if (Array.isArray(gs.players)) {
    gs.players = (gs.players as Record<string, unknown>[]).map((p) => {
      if (p.hand === undefined) p.hand = DEFAULT_PLAYER.hand
      if (p.items === undefined) p.items = DEFAULT_PLAYER.items
      if (p.bankDeposit === undefined) p.bankDeposit = DEFAULT_PLAYER.bankDeposit
      if (p.bankLoan === undefined) p.bankLoan = DEFAULT_PLAYER.bankLoan
      if (p.loanDueDay === undefined) p.loanDueDay = DEFAULT_PLAYER.loanDueDay
      if (p.stocks === undefined) p.stocks = DEFAULT_PLAYER.stocks
      if (p.points === undefined) p.points = DEFAULT_PLAYER.points
      if (p.jailTurns === undefined) p.jailTurns = DEFAULT_PLAYER.jailTurns
      if (p.hospitalTurns === undefined) p.hospitalTurns = DEFAULT_PLAYER.hospitalTurns
      if (p.skipTurns === undefined) p.skipTurns = DEFAULT_PLAYER.skipTurns
      if (p.vehicle === undefined) p.vehicle = DEFAULT_PLAYER.vehicle
      if (p.consecutiveDoubles === undefined) p.consecutiveDoubles = DEFAULT_PLAYER.consecutiveDoubles
      if (p.ownedTileIds === undefined) p.ownedTileIds = []
      return p
    })
  }

  // BoardState 字段补全
  if (gs.board) {
    const bd = gs.board as Record<string, unknown>
    if (bd.sealedGroups === undefined) bd.sealedGroups = {}
    if (bd.priceUpGroups === undefined) bd.priceUpGroups = {}
    if (bd.boardTraps === undefined) bd.boardTraps = []
  }

  // GameConfig 字段补全
  const cfg = s.config as unknown as Record<string, unknown>
  if (cfg) {
    if (cfg.priceIndexEnabled === undefined) cfg.priceIndexEnabled = true
    if (cfg.allowDoubleRoll === undefined) cfg.allowDoubleRoll = true
    if (cfg.allowConsecutiveDoublesJail === undefined) cfg.allowConsecutiveDoublesJail = true
    if (cfg.diceMode === undefined) cfg.diceMode = 'dice'
  }

  // 日志补全
  if (!Array.isArray(gs.log)) gs.log = [{ seq: 0, kind: 'gameStart', text: '游戏开始' }]
  if (gs.phase === undefined) gs.phase = GamePhase.PLAYING
  if (gs.status === undefined) gs.status = 'playing'

  return s as SaveGame
}

export function validateSaveIntegrity(save: SaveGame): string[] {
  const errors: string[] = []
  if (!save.id) errors.push('缺少存档 ID')
  if (!save.gameState) errors.push('缺少游戏状态')
  if (!save.config) errors.push('缺少游戏配置')
  if (!save.gameState?.players?.length) errors.push('玩家列表为空')
  if (!save.gameState?.board?.tiles?.length) errors.push('地图数据为空')
  return errors
}
