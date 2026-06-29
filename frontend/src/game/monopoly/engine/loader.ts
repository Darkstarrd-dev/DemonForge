// 数据加载器：从 JSON 文件加载内容数据到运行时定义表
// 使用 Vite 原生 JSON 导入能力（build 时打包，不产生运行时文件 IO）
import type { BoardData, BoardState, GameConfig, PropertyState } from '../types'
import { SpaceType } from '../types'
import { validateMapData } from './validator'
import classic40 from '../data/maps/classic-40.json'
import richman4Taiwan from '../data/maps/richman4-taiwan.json'
import richman4Default from '../data/config/richman4-default.json'
import richman10Online from '../data/config/richman10-online.json'
import richman11Hotfight from '../data/config/richman11-hotfight.json'

export type LoadedMap = { boardData: BoardData; source: string }

const MAP_REGISTRY: Record<string, () => BoardData> = {
  'classic-40': () => classic40 as BoardData,
  'richman4-taiwan': () => richman4Taiwan as BoardData,
}

const MAP_NAMES: Record<string, string> = {
  'classic-40': '经典 40 格',
  'richman4-taiwan': '台湾地图',
}

export function getMapIds(): string[] {
  return Object.keys(MAP_REGISTRY)
}

export function getMapName(mapId: string): string {
  return MAP_NAMES[mapId] ?? mapId
}

export function getMapList(): { id: string; name: string }[] {
  return getMapIds().map((id) => ({ id, name: getMapName(id) }))
}

const GROUP_COLORS: Record<string, string> = {
  zone_A: '#8B5A2B', zone_B: '#5B9BD5', zone_C: '#E84393',
  zone_D: '#E67E22', zone_E: '#E74C3C', zone_F: '#F1C40F',
  zone_G: '#27AE60', zone_H: '#2C3E50',
}

const COLOR_PALETTE = ['#1ABC9C', '#9B59B6', '#3498DB', '#E91E63', '#FF5722', '#795548', '#607D8B', '#009688', '#CDDC39', '#FF9800']

export function groupColor(groupId?: string): string | undefined {
  if (!groupId) return undefined
  if (GROUP_COLORS[groupId]) return GROUP_COLORS[groupId]
  const idx = groupId.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return COLOR_PALETTE[idx % COLOR_PALETTE.length]
}

/** 从 BoardData 创建运行时 BoardState */
export function createBoardState(boardData: BoardData): BoardState {
  const tiles = boardData.tiles.map((t) => {
    const enriched = { ...t }
    if (t.type === SpaceType.ATTACK_SPACE) {
      enriched.damage = enriched.damage ?? 500
    }
    return enriched
  })

  // 初始化 property entries
  const properties: Record<string, PropertyState> = {}
  for (const tile of tiles) {
    if (tile.type === SpaceType.PROPERTY) {
      properties[tile.id] = { tileId: tile.id, level: 0, mortgaged: false }
    }
  }

  return {
    data: boardData,
    tiles,
    properties,
    sealedGroups: {},
    priceUpGroups: {},
    boardTraps: {},
  }
}

export function loadMapData(mapId: string): LoadedMap {
  const loader = MAP_REGISTRY[mapId]
  if (!loader) throw new Error(`未知地图 ID: ${mapId}`)
  const boardData = loader()
  const result = validateMapData(boardData)
  if (!result.valid) {
    console.warn(`地图 ${mapId} 校验警告:`, result.errors)
  }
  return { boardData, source: mapId }
}

export function loadAllMaps(): LoadedMap[] {
  return Object.keys(MAP_REGISTRY).map((id) => {
    try { return loadMapData(id) } catch (e) { console.error(`加载地图 ${id} 失败:`, e); return null }
  }).filter((x): x is LoadedMap => x !== null)
}

// ─── M7: 多版本配置预设 ──────────────────────────────

const CONFIG_PRESETS: Record<string, GameConfig> = {
  'richman4-default': (richman4Default as { config: GameConfig }).config,
  'richman10-online': (richman10Online as { config: GameConfig }).config,
  'richman11-hotfight': (richman11Hotfight as { config: GameConfig }).config,
}

export function getConfigPresets(): { id: string; name: string }[] {
  return [
    { id: 'richman4-default', name: '大富翁4 经典' },
    { id: 'richman10-online', name: '大富翁10 联网' },
    { id: 'richman11-hotfight', name: '大富翁11 热斗' },
  ]
}

export function loadConfig(configPresetId: string): GameConfig | undefined {
  return CONFIG_PRESETS[configPresetId]
}

/** 根据 mapId + variant 预处理地图：热斗模式下替换 PROPERTY→ATTACK_SPACE */
export function applyVariantToBoard(boardData: BoardData, variant?: string): BoardData {
  if (variant !== 'hot_fight') return boardData
  return {
    ...boardData,
    tiles: boardData.tiles.map((t) => {
      if (t.type === 'PROPERTY') return { ...t, type: 'ATTACK_SPACE' as const, name: `攻击·${t.name}` }
      if (t.type === 'HOSPITAL') return { ...t, type: 'PARK' as const, name: '公园' }
      return t
    }),
  }
}
