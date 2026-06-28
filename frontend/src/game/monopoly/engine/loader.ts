// 数据加载器：从 JSON 文件加载内容数据到运行时定义表
// 使用 Vite 原生 JSON 导入能力（build 时打包，不产生运行时文件 IO）
import type { BoardData } from '../types'
import { validateMapData } from './validator'
import classic40 from '../data/maps/classic-40.json'
import richman4Taiwan from '../data/maps/richman4-taiwan.json'

export type LoadedMap = { boardData: BoardData; source: string }

const MAP_REGISTRY: Record<string, () => BoardData> = {
  'classic-40': () => classic40 as BoardData,
  'richman4-taiwan': () => richman4Taiwan as BoardData,
}

export function getMapIds(): string[] {
  return Object.keys(MAP_REGISTRY)
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
