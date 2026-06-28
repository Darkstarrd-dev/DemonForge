import { describe, it, expect } from 'vitest'
import { createInitialState } from '../engine'
import { createDefaultBoard } from '../board.preset'
import type { GameState, NewGameConfig, SaveGame } from '../types'
import { serializeGame, deserializeGame, extractSaveMeta, migrateSaveVersion, validateSaveIntegrity, SAVE_VERSION } from '../engine/serializer'

function makeConfig(overrides?: Partial<NewGameConfig>): NewGameConfig {
  return {
    board: createDefaultBoard(),
    players: [
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
