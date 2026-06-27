// 大富翁风格预设地图：40 格环形（11×11 grid 外圈，中间区留给 UI）。
// blockout 用，数值默认可调（见 docs/monopoly_plan.md §10）。

import type { BoardConfig, Tile, TileCoord, TileType } from './types'

const SIDE = 11 // grid 边长 → 外圈 4*(SIDE-1) = 40 格

// 40 格语义骨架：[type, zoneId?]。四角为特殊格（go/jail/parking/hospital）。
const LAYOUT: Array<[TileType, string?]> = [
  ['go'], ['property', 'A'], ['fate'], ['property', 'A'], ['tax'],
  ['station'], ['property', 'B'], ['chance'], ['property', 'B'], ['property', 'B'],
  ['jail'], ['property', 'C'], ['utility'], ['property', 'C'], ['property', 'C'],
  ['station'], ['property', 'D'], ['news'], ['property', 'D'], ['property', 'D'],
  ['parking'], ['property', 'E'], ['chance'], ['property', 'E'], ['property', 'E'],
  ['station'], ['property', 'F'], ['property', 'F'], ['utility'], ['property', 'F'],
  ['hospital'], ['property', 'G'], ['property', 'G'], ['fate'], ['property', 'G'],
  ['station'], ['chance'], ['property', 'H'], ['tax'], ['property', 'H'],
]

// 街区：名称 + blockout 色（取经典 8 色组观感）。
const ZONES: Record<string, { name: string; color: string }> = {
  A: { name: '棕榈道', color: '#8B5A2B' },
  B: { name: '蓝湖街', color: '#5B9BD5' },
  C: { name: '樱花路', color: '#E84393' },
  D: { name: '金橙道', color: '#E67E22' },
  E: { name: '烈焰街', color: '#E74C3C' },
  F: { name: '黄金场', color: '#F1C40F' },
  G: { name: '翡翠路', color: '#27AE60' },
  H: { name: '深蓝港', color: '#2C3E50' },
}

// 非地产格名称。
const SPECIAL_NAMES: Partial<Record<TileType, string>> = {
  go: '起点',
  jail: '监狱',
  parking: '免费停车',
  hospital: '医院',
  chance: '机会',
  fate: '命运',
  news: '新闻',
  tax: '税务局',
  station: '车站',
  utility: '公用事业',
  bank: '银行',
  shop: '商店',
}

const round10 = (n: number) => Math.round(n / 10) * 10

// 地产经济参数：价格随 index 递增，过路费按等级跳档。
function tileEconomy(index: number) {
  const price = round10(1000 + index * 60)
  const upgradeCost = round10(price * 0.5)
  const rentByLevel = [0.1, 0.3, 0.9, 1.6, 2.6].map((r) => round10(price * r))
  return { price, upgradeCost, rentByLevel }
}

// 顺时针外圈坐标序列，index 0 = 左上角。
function ringCoords(side: number): TileCoord[] {
  const coords: TileCoord[] = []
  for (let c = 1; c <= side; c++) coords.push({ row: 1, col: c }) // 顶边 →
  for (let r = 2; r <= side; r++) coords.push({ row: r, col: side }) // 右边 ↓
  for (let c = side - 1; c >= 1; c--) coords.push({ row: side, col: c }) // 底边 ←
  for (let r = side - 1; r >= 2; r--) coords.push({ row: r, col: 1 }) // 左边 ↑
  return coords
}

export function createDefaultBoard(): BoardConfig {
  const coords = ringCoords(SIDE)
  const zoneCounters: Record<string, number> = {}

  const tiles: Tile[] = LAYOUT.map(([type, zoneId], index) => {
    const coord = coords[index]
    if (type === 'property' && zoneId) {
      const zone = ZONES[zoneId]
      zoneCounters[zoneId] = (zoneCounters[zoneId] ?? 0) + 1
      return {
        index,
        coord,
        type,
        name: `${zone.name}${zoneCounters[zoneId]}`,
        zoneId,
        color: zone.color,
        ...tileEconomy(index),
      }
    }
    const name = SPECIAL_NAMES[type] ?? type
    if (type === 'tax') {
      return { index, coord, type, name, taxAmount: 1000 }
    }
    return { index, coord, type, name }
  })

  return { size: tiles.length, tiles }
}
