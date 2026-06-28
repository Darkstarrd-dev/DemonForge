import { describe, it, expect } from 'vitest'
import { validateMapData, validateMapConnectivity } from '../engine/validator'
import type { BoardData } from '../types'

function makeValidBoardData(overrides?: Partial<BoardData>): BoardData {
  return {
    mapId: 'test-map',
    version: 'test',
    name: '测试地图',
    size: 4,
    tiles: [
      { id: 't0', index: 0, type: 'START', name: '起点', coord: { row: 1, col: 1 }, neighborIds: ['t1', 't3'] },
      { id: 't1', index: 1, type: 'PROPERTY', name: '地产A', coord: { row: 1, col: 2 }, neighborIds: ['t0', 't2'], groupId: 'g1', basePrice: 200, buildingLevels: [{ level: 0, buildCost: 0, baseRent: 20 }, { level: 1, buildCost: 100, baseRent: 60 }, { level: 2, buildCost: 200, baseRent: 120 }, { level: 3, buildCost: 300, baseRent: 200 }, { level: 4, buildCost: 400, baseRent: 300 }, { level: 5, buildCost: 500, baseRent: 400 }] },
      { id: 't2', index: 2, type: 'TAX', name: '税务局', coord: { row: 1, col: 3 }, neighborIds: ['t1', 't3'] },
      { id: 't3', index: 3, type: 'JAIL', name: '监狱', coord: { row: 1, col: 4 }, neighborIds: ['t2', 't0'] },
    ],
    groups: [{ groupId: 'g1', name: '测试区', spaceIds: ['t1'] }],
    boardShape: { kind: 'ring', gridSide: 4 },
    layers: [],
    ...overrides,
  }
}

describe('validateMapData', () => {
  it('通过合法地图', () => {
    const result = validateMapData(makeValidBoardData())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('检测 size 不匹配', () => {
    const data = makeValidBoardData({ size: 10 })
    const result = validateMapData(data)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('size'))).toBe(true)
  })

  it('检测重复 tile.id', () => {
    const data = makeValidBoardData({
      tiles: [
        { id: 't0', index: 0, type: 'START', name: '起点', coord: { row: 1, col: 1 }, neighborIds: ['t1'] },
        { id: 't0', index: 1, type: 'PROPERTY', name: '地产A', coord: { row: 1, col: 2 }, neighborIds: ['t0'], groupId: 'g1', basePrice: 200, buildingLevels: [{ level: 0, buildCost: 0, baseRent: 20 }, { level: 1, buildCost: 100, baseRent: 60 }, { level: 2, buildCost: 200, baseRent: 120 }, { level: 3, buildCost: 300, baseRent: 200 }, { level: 4, buildCost: 400, baseRent: 300 }, { level: 5, buildCost: 500, baseRent: 400 }] },
      ],
    })
    const result = validateMapData(data)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('重复'))).toBe(true)
  })

  it('检测地产格缺少 basePrice', () => {
    const data = makeValidBoardData({
      tiles: [
        { id: 't0', index: 0, type: 'START', name: '起点', coord: { row: 1, col: 1 }, neighborIds: ['t1'] },
        { id: 't1', index: 1, type: 'PROPERTY', name: '地产A', coord: { row: 1, col: 2 }, neighborIds: ['t0'], groupId: 'g1' },
      ],
    })
    const result = validateMapData(data)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('basePrice'))).toBe(true)
  })

  it('检测非法 neighborId 引用', () => {
    const data = makeValidBoardData({
      tiles: [
        { id: 't0', index: 0, type: 'START', name: '起点', coord: { row: 1, col: 1 }, neighborIds: ['nonexistent'] },
      ],
    })
    const result = validateMapData(data)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('neighborId'))).toBe(true)
  })
})

describe('validateMapConnectivity', () => {
  it('连通图返回 true', () => {
    expect(validateMapConnectivity(makeValidBoardData())).toBe(true)
  })

  it('不连通图返回 false', () => {
    const data = makeValidBoardData({
      tiles: [
        { id: 't0', index: 0, type: 'START', name: '起点', coord: { row: 1, col: 1 }, neighborIds: [] },
        { id: 't1', index: 1, type: 'JAIL', name: '监狱', coord: { row: 1, col: 2 }, neighborIds: [] },
      ],
    })
    expect(validateMapConnectivity(data)).toBe(false)
  })
})
