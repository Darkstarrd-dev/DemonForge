// 数据加载器：从 JSON 文件加载内容数据到运行时定义表
// 使用 Vite 原生 JSON 导入能力（build 时打包，不产生运行时文件 IO）
import type { BoardConfig, BoardData, Tile, TileType } from '../types'
import { validateMapData } from './validator'
import classic40 from '../data/maps/classic-40.json'
import richman4Taiwan from '../data/maps/richman4-taiwan.json'

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

const SPACE_TO_TILE: Record<string, TileType> = {
  PROPERTY: 'property', START: 'go', TAX: 'tax',
  HOSPITAL: 'hospital', JAIL: 'jail', JAIL_VISIT: 'parking',
  BANK: 'bank', SHOP: 'shop', NEWS: 'news', FATE: 'fate',
  COMPANY: 'station', TREASURE_BOX: 'chance', PARK: 'parking',
  MAGIC_HOUSE: 'chance', MINI_GAME: 'chance', LOTTERY: 'chance',
  TELEPORT: 'chance', GAS_STATION: 'station', SCORE: 'chance',
  EMPTY: 'parking', ATTACK_SPACE: 'property',
}

const GROUP_COLORS: Record<string, string> = {
  zone_A: '#8B5A2B', zone_B: '#5B9BD5', zone_C: '#E84393',
  zone_D: '#E67E22', zone_E: '#E74C3C', zone_F: '#F1C40F',
  zone_G: '#27AE60', zone_H: '#2C3E50',
}

const COLOR_PALETTE = ['#1ABC9C', '#9B59B6', '#3498DB', '#E91E63', '#FF5722', '#795548', '#607D8B', '#009688', '#CDDC39', '#FF9800']

function groupColor(groupId?: string): string | undefined {
  if (!groupId) return undefined
  if (GROUP_COLORS[groupId]) return GROUP_COLORS[groupId]
  const idx = groupId.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return COLOR_PALETTE[idx % COLOR_PALETTE.length]
}

export function boardDataToBoardConfig(boardData: BoardData): { board: BoardConfig; gridSide: number } {
  const tiles: Tile[] = boardData.tiles.map((tv2) => {
    const oldType = SPACE_TO_TILE[tv2.type] ?? 'parking'
    const tile: Tile = { index: tv2.index, coord: tv2.coord, type: oldType, name: tv2.name }
    if (tv2.type === 'PROPERTY') {
      tile.zoneId = tv2.groupId
      tile.color = groupColor(tv2.groupId)
      tile.price = tv2.basePrice
      tile.upgradeCost = tv2.buildingLevels?.[1]?.buildCost ?? 0
      tile.rentByLevel = tv2.buildingLevels?.slice(0, 5).map((b) => b.baseRent) ?? []
    }
    if (tv2.type === 'TAX') {
      tile.taxAmount = 1000
    }
    return tile
  })
  return { board: { size: tiles.length, tiles }, gridSide: boardData.boardShape.gridSide ?? 11 }
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
