import type { GameState, GameConfig, SaveGame, SaveMeta } from '../types'

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
  const state = JSON.parse(JSON.stringify(save.gameState)) as GameState
  const config = JSON.parse(JSON.stringify(save.config)) as GameConfig
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
    day: s.day ?? 1,
    status: s.status,
  }
}

export function migrateSaveVersion(save: SaveGame): SaveGame {
  if (save.version === SAVE_VERSION) return save
  let s = { ...save }
  if (s.version < 'richman@1.0.0') {
    s = { ...s, version: SAVE_VERSION }
  }
  return s
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
