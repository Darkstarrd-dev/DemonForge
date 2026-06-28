import { describe, it, expect } from 'vitest'
import { getConfigPresets, getMapIds, getMapList, loadConfig, loadMapData, boardDataToBoardConfig } from '../engine/loader'
import { SpaceType } from '../types'

describe('loader', () => {
  it('能获取地图 ID 列表', () => {
    const ids = getMapIds()
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(ids).toContain('classic-40')
    expect(ids).toContain('richman4-taiwan')
  })

  it('能获取地图列表含名称', () => {
    const list = getMapList()
    expect(list.length).toBeGreaterThanOrEqual(2)
    const classic = list.find((m) => m.id === 'classic-40')
    expect(classic).toBeDefined()
    expect(classic!.name).toBe('经典 40 格')
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

  describe('boardDataToBoardConfig', () => {
    it('经典 40 格转换后含正确 tile 数量和 type', () => {
      const board = boardDataToBoardConfig(loadMapData('classic-40').boardData)
      expect(board.tiles).toHaveLength(40)
      const propCount = board.tiles.filter((t) => t.type === SpaceType.PROPERTY).length
      expect(propCount).toBeGreaterThan(0)
    })

    it('台湾地图转换后含 36 格', () => {
      const board = boardDataToBoardConfig(loadMapData('richman4-taiwan').boardData)
      expect(board.tiles).toHaveLength(36)
    })

    it('PROPERTY 瓦片映射 price/upgradeCost/rentByLevel', () => {
      const board = boardDataToBoardConfig(loadMapData('classic-40').boardData)
      const prop = board.tiles.find((t) => t.type === SpaceType.PROPERTY && t.index === 1)
      expect(prop).toBeDefined()
      expect(prop!.price).toBe(1060)
      expect(prop!.upgradeCost).toBe(530)
      expect(prop!.rentByLevel).toHaveLength(5)
    })
  })
})

describe('M7 多版本变体', () => {
  it('getConfigPresets 返回 3 个预设', () => {
    const presets = getConfigPresets()
    expect(presets).toHaveLength(3)
    expect(presets[0].id).toBe('richman4-default')
  })
  it('loadConfig 加载 richman4 配置正确', () => {
    const cfg = loadConfig('richman4-default')
    expect(cfg).toBeDefined()
    expect(cfg!.version).toBe('richman4')
    expect(cfg!.startingCash).toBe(15000)
    expect(cfg!.bankEnabled).toBe(true)
    expect(cfg!.stockEnabled).toBe(true)
  })
  it('loadConfig 加载 richman10 配置正确', () => {
    const cfg = loadConfig('richman10-online')
    expect(cfg).toBeDefined()
    expect(cfg!.version).toBe('richman10')
    expect(cfg!.stockEnabled).toBe(false)
    expect(cfg!.pointSystem).toBe('cash')
  })
  it('loadConfig 加载 richman11 热斗配置正确', () => {
    const cfg = loadConfig('richman11-hotfight')
    expect(cfg).toBeDefined()
    expect(cfg!.version).toBe('richman11')
    expect(cfg!.variant).toBe('hot_fight')
    expect(cfg!.bankEnabled).toBe(false)
  })
})
