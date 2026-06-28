// 数据校验：地图连通性 / 引用完整性 / 枚举合法 / 建筑等级连续
import type { Tile, BoardData, PropertyGroup } from '../types'
import { SpaceType } from '../types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateMapData(data: BoardData): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!data.mapId) errors.push('mapId 不能为空')
  if (data.size !== data.tiles.length) errors.push(`size (${data.size}) 与 tiles 长度 (${data.tiles.length}) 不匹配`)

  const tileMap = new Map<string, Tile>()
  for (const tile of data.tiles) {
    if (tileMap.has(tile.id)) errors.push(`重复 tile.id: ${tile.id}`)
    tileMap.set(tile.id, tile)

    if (tile.index < 0 || tile.index >= data.tiles.length) errors.push(`tile ${tile.id} index 越界: ${tile.index}`)

    if (tile.neighborIds.length === 0) warnings.push(`tile ${tile.id} 无 neighborIds`)
    for (const nid of tile.neighborIds) {
      if (!tileMap.has(nid) && data.tiles.findIndex((t) => t.id === nid) < 0) {
        errors.push(`tile ${tile.id} 引用不存在的 neighborId: ${nid}`)
      }
    }

    if (tile.type === SpaceType.PROPERTY) {
      if (!tile.groupId) errors.push(`地产格 ${tile.id} 缺少 groupId`)
      if (!tile.basePrice) errors.push(`地产格 ${tile.id} 缺少 basePrice`)
      if (!tile.buildingLevels || tile.buildingLevels.length === 0) {
        errors.push(`地产格 ${tile.id} 缺少 buildingLevels`)
      } else if (!validateBuildingLevels(tile.buildingLevels)) {
        errors.push(`地产格 ${tile.id} buildingLevels 不连续（需 0-5 六项）`)
      }
    }

    if (!Object.values(SpaceType).includes(tile.type)) {
      errors.push(`tile ${tile.id} type 非法: ${tile.type}`)
    }
  }

  const groupMap = new Map<string, PropertyGroup>()
  for (const g of data.groups) {
    if (groupMap.has(g.groupId)) errors.push(`重复 groupId: ${g.groupId}`)
    groupMap.set(g.groupId, g)
    for (const sid of g.spaceIds) {
      if (!tileMap.has(sid) && data.tiles.findIndex((t) => t.id === sid) < 0) {
        errors.push(`group ${g.groupId} 引用不存在的 tile id: ${sid}`)
      }
    }
  }

  for (const tile of data.tiles) {
    if (tile.groupId && !groupMap.has(tile.groupId)) {
      errors.push(`tile ${tile.id} 引用不存在的 groupId: ${tile.groupId}`)
    }
  }

  validateTilemapLayers(data.layers, errors)

  return { valid: errors.length === 0, errors, warnings }
}

function validateBuildingLevels(levels: Array<{ level: number; buildCost: number }>): boolean {
  if (levels.length !== 6) return false
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].level !== i) return false
  }
  return true
}

function validateTilemapLayers(layers: BoardData['layers'], errors: string[]) {
  const layerIds = new Set<string>()
  for (const layer of layers) {
    if (layerIds.has(layer.id)) errors.push(`重复 layer id: ${layer.id}`)
    layerIds.add(layer.id)
    if (!['tile', 'object', 'decoration'].includes(layer.type)) {
      errors.push(`layer ${layer.id} type 非法: ${layer.type}`)
    }
  }
}

export function validateMapConnectivity(data: BoardData): boolean {
  if (data.tiles.length === 0) return false
  const visited = new Set<string>()
  const queue = [data.tiles[0].id]
  visited.add(data.tiles[0].id)
  while (queue.length > 0) {
    const cur = queue.shift()!
    const tile = data.tiles.find((t) => t.id === cur)
    if (!tile) continue
    for (const nid of tile.neighborIds) {
      if (!visited.has(nid)) {
        visited.add(nid)
        queue.push(nid)
      }
    }
  }
  return visited.size === data.tiles.length
}
