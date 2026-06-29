import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import type { GameState, NewGameConfig, SaveGame } from '../types'
import { serializeGame, deserializeGame, extractSaveMeta, migrateSaveVersion, validateSaveIntegrity, SAVE_VERSION } from '../engine/serializer'

function makeConfig(overrides?: Partial<NewGameConfig>): NewGameConfig {
  return {    players: [
      { name: '玩家A', color: '#E74C3C', controller: 'human' },
      { name: '玩家B', color: '#3498DB', controller: 'ai' },
    ],
    startingCash: 15000,
    mapId: 'classic-40',
    ...overrides,
  }
}

function baseState(): GameState {
  return createInitialState(makeConfig())
}

describe('serializeGame', () => {
  it('序列化后包含必填字段', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, '测试存档')
    expect(save.id).toBeDefined()
    expect(save.name).toBe('测试存档')
    expect(save.version).toBe(SAVE_VERSION)
    expect(save.timestamp).toBeGreaterThan(0)
    expect(save.gameState).toBeDefined()
    expect(save.config).toBeDefined()
  })

  it('不提供名称时自动生成', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, '')
    expect(save.name).toContain('存档')
  })

  it('深拷贝不共享引用', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    save.gameState.players[0].cash = 0
    expect(state.players[0].cash).toBe(15000)
  })
})

describe('deserializeGame', () => {
  it('反序列化恢复完整状态', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const { state: restored, config } = deserializeGame(save)
    expect(restored.players).toHaveLength(2)
    expect(restored.players[0].cash).toBe(15000)
    expect(config.startingCash).toBe(15000)
  })

  it('不完整数据抛出错误', () => {
    const bad = { id: 'bad', name: 'bad', version: SAVE_VERSION, timestamp: 0 } as unknown as SaveGame
    expect(() => deserializeGame(bad)).toThrow('存档数据不完整')
  })
})

describe('extractSaveMeta', () => {
  it('提取存单元信息', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, '测试')
    const meta = extractSaveMeta(save)
    expect(meta.id).toBe(save.id)
    expect(meta.name).toBe('测试')
    expect(meta.playerCount).toBe(2)
    expect(meta.mapId).toBe('classic-40')
    expect(meta.status).toBe('playing')
  })

  it('排除破产玩家', () => {
    const state = baseState()
    state.players[1].bankrupt = true
    const save = serializeGame(state, state.config!, 'test')
    const meta = extractSaveMeta(save)
    expect(meta.playerCount).toBe(1)
  })
})

describe('migrateSaveVersion', () => {
  it('最新版本不迁移', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const migrated = migrateSaveVersion(save)
    expect(migrated.version).toBe(SAVE_VERSION)
  })

  it('旧版本升级', () => {
    const state = baseState()
    const oldSave: SaveGame = {
      ...serializeGame(state, state.config!, 'test'),
      version: 'richman@0.9.0',
    }
    const migrated = migrateSaveVersion(oldSave)
    expect(migrated.version).toBe(SAVE_VERSION)
  })

  it('补全缺失的 turnContext 字段', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const gs = save.gameState as unknown as Record<string, unknown>
    const tc = gs.turnContext as Record<string, unknown>
    delete tc.diceCount
    delete tc.movePath
    delete tc.consecutiveDoubles
    const migrated = migrateSaveVersion({ ...save, version: 'richman@0.8.0' })
    const mt = (migrated.gameState as unknown as Record<string, unknown>).turnContext as Record<string, unknown>
    expect(mt.diceCount).toBe(2)
    expect(mt.movePath).toEqual([])
    expect(mt.consecutiveDoubles).toBe(0)
  })

  it('补全缺失的 economy 字段', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const gs = save.gameState as unknown as Record<string, unknown>
    const ec = gs.economy as Record<string, unknown>
    delete ec.bankAccounts
    delete ec.companies
    delete ec.priceIndex
    const migrated = migrateSaveVersion({ ...save, version: 'richman@0.8.0' })
    const me = (migrated.gameState as unknown as Record<string, unknown>).economy as Record<string, unknown>
    expect(me.bankAccounts).toEqual({})
    expect(me.companies).toEqual({})
    expect(me.priceIndex).toBe(1.0)
  })

  it('补全缺失的玩家字段', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const gs = save.gameState as unknown as Record<string, unknown>
    const players = gs.players as Record<string, unknown>[]
    delete players[0].hand
    delete players[0].items
    delete players[0].points
    delete players[0].vehicle
    delete players[0].hospitalTurns
    const migrated = migrateSaveVersion({ ...save, version: 'richman@0.8.0' })
    const mp = (migrated.gameState as unknown as Record<string, unknown>).players as Record<string, unknown>[]
    expect(mp[0].hand).toEqual([])
    expect(mp[0].items).toEqual([])
    expect(mp[0].points).toBe(0)
    expect(mp[0].vehicle).toBe('PEDESTRIAN')
    expect(mp[0].hospitalTurns).toBe(0)
  })

  it('补全缺失的 board 字段', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const gs = save.gameState as unknown as Record<string, unknown>
    const bd = gs.board as Record<string, unknown>
    delete bd.sealedGroups
    delete bd.priceUpGroups
    delete bd.boardTraps
    const migrated = migrateSaveVersion({ ...save, version: 'richman@0.8.0' })
    const mb = (migrated.gameState as unknown as Record<string, unknown>).board as Record<string, unknown>
    expect(mb.sealedGroups).toEqual({})
    expect(mb.priceUpGroups).toEqual({})
    expect(mb.boardTraps).toEqual([])
  })

  it('补全缺失的 itemDeck 字段', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const gs = save.gameState as unknown as Record<string, unknown>
    const id = gs.itemDeck as Record<string, unknown>
    delete id.shopInventory
    delete id.researchInventory
    const migrated = migrateSaveVersion({ ...save, version: 'richman@0.8.0' })
    const mi = (migrated.gameState as unknown as Record<string, unknown>).itemDeck as Record<string, unknown>
    expect(mi.shopInventory).toEqual({})
    expect(mi.researchInventory).toEqual({})
  })

  it('整段缺失 turnContext/economy 时用默认值填充', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const gs = save.gameState as unknown as Record<string, unknown>
    delete gs.turnContext
    delete gs.economy
    const migrated = migrateSaveVersion({ ...save, version: 'richman@0.7.0' })
    const mg = migrated.gameState as unknown as Record<string, unknown>
    expect(mg.turnContext).toBeDefined()
    expect((mg.turnContext as Record<string, unknown>).diceCount).toBe(2)
    expect(mg.economy).toBeDefined()
    expect((mg.economy as Record<string, unknown>).priceIndex).toBe(1.0)
  })
})

describe('validateSaveIntegrity', () => {
  it('完整存档无错误', () => {
    const state = baseState()
    const save = serializeGame(state, state.config!, 'test')
    const errors = validateSaveIntegrity(save)
    expect(errors).toEqual([])
  })

  it('缺失 ID 报错', () => {
    const save = { gameState: { players: [{ id: 'p1' }], board: { tiles: [{}] } }, config: {} } as unknown as SaveGame
    const errors = validateSaveIntegrity(save)
    expect(errors).toContain('缺少存档 ID')
  })

  it('空玩家列表报错', () => {
    const save = { id: 's1', gameState: { players: [], board: { tiles: [{}] } }, config: {} } as unknown as SaveGame
    const errors = validateSaveIntegrity(save)
    expect(errors).toContain('玩家列表为空')
  })

  it('空地图报错', () => {
    const save = { id: 's1', gameState: { players: [{ id: 'p1' }], board: { tiles: [] } }, config: {} } as unknown as SaveGame
    const errors = validateSaveIntegrity(save)
    expect(errors).toContain('地图数据为空')
  })
})
