import { describe, it, expect } from 'vitest'
import { getMapIds, loadMapData } from '../engine/loader'

describe('loader', () => {
  it('能获取地图 ID 列表', () => {
    const ids = getMapIds()
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(ids).toContain('classic-40')
    expect(ids).toContain('richman4-taiwan')
  })

  it('能加载经典 40 格地图', () => {
    const result = loadMapData('classic-40')
    expect(result.boardData.size).toBe(40)
    expect(result.boardData.mapId).toBe('classic-40')
    expect(result.boardData.tiles).toHaveLength(40)
  })

  it('能加载台湾地图', () => {
    const result = loadMapData('richman4-taiwan')
    expect(result.boardData.size).toBe(36)
    expect(result.boardData.mapId).toBe('richman4-taiwan')
    expect(result.boardData.tiles).toHaveLength(36)
  })

  it('未知地图 ID 抛异常', () => {
    expect(() => loadMapData('nonexistent')).toThrow()
  })
})
