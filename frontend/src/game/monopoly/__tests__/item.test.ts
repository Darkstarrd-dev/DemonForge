import { describe, it, expect } from 'vitest'
import { createInitialState, reducer, resolveTraps, tickTimedBombs } from '../engine'
import type { GameState, NewGameConfig } from '../types'

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

function setTurn(state: GameState, playerId: string): GameState {
  return { ...state, turnContext: { ...state.turnContext, currentPlayerId: playerId } }
}

function givePoints(state: GameState, playerId: string, points: number): GameState {
  return {
    ...state,
    players: state.players.map(p => p.id === playerId ? { ...p, points: (p.points ?? 0) + points } : p),
  }
}

function addItemToInventory(state: GameState, playerId: string, itemDefId: string): GameState {
  const deck = state.itemDeck
  const def = deck.definitions.find(d => d.id === itemDefId)
  if (!def) return state
  return {
    ...state,
    players: state.players.map(p =>
      p.id === playerId
        ? { ...p, items: [...(p.items ?? []), { definitionId: itemDefId, instanceId: `test_${itemDefId}`, durability: def.durability }] }
        : p,
    ),
  }
}

describe('createItemDeck', () => {
  it('道具初始化含 13 种定义', () => {
    const state = baseState()
    expect(state.itemDeck.definitions).toHaveLength(13)
  })

  it('道具店初始有 3 件商品', () => {
    const state = baseState()
    expect(state.itemDeck.shopInventory.availableItemIds).toHaveLength(3)
  })

  it('研究所含 5 个可研发项目', () => {
    const state = baseState()
    expect(state.itemDeck.researchInventory.availableResearchIds).toHaveLength(5)
  })

  it('每位玩家初始道具为空', () => {
    const state = baseState()
    for (const p of state.players) {
      expect(p.items).toEqual([])
    }
  })
})

describe('BUY_ITEM', () => {
  it('从道具店购买道具', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 100)
    const shopItem = state.itemDeck.shopInventory.availableItemIds[0]
    const def = state.itemDeck.definitions.find(d => d.id === shopItem)!
    const next = reducer(state, { type: 'BUY_ITEM', itemDefId: shopItem })
    expect(next.players[0].items).toHaveLength(1)
    expect(next.players[0].items![0].definitionId).toBe(shopItem)
    expect(next.players[0].points).toBe(100 - def.pointCost)
  })

  it('从研究所研发道具', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 100)
    const researchItem = state.itemDeck.researchInventory.availableResearchIds[0]
    const def = state.itemDeck.definitions.find(d => d.id === researchItem)!
    const next = reducer(state, { type: 'BUY_ITEM', itemDefId: researchItem })
    expect(next.players[0].items).toHaveLength(1)
    expect(next.players[0].points).toBe(100 - def.pointCost)
    // Research item is removed from available list
    expect(next.itemDeck.researchInventory.availableResearchIds).not.toContain(researchItem)
  })

  it('点数不足不能购买', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const shopItem = state.itemDeck.shopInventory.availableItemIds[0]
    const next = reducer(state, { type: 'BUY_ITEM', itemDefId: shopItem })
    expect(next.players[0].items).toHaveLength(0)
    expect(next).toBe(state)
  })

  it('超过持有上限 5 不能购买', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 999)
    const manyItems = Array.from({ length: 5 }, (_, i) => ({
      definitionId: `test-item-${i}`, instanceId: `ti${i}`, durability: -1,
    }))
    state = { ...state, players: state.players.map(p =>
      p.id === state.players[0].id ? { ...p, items: manyItems } : p) }
    const shopItem = state.itemDeck.shopInventory.availableItemIds[0]
    const next = reducer(state, { type: 'BUY_ITEM', itemDefId: shopItem })
    expect(next).toBe(state)
  })

  it('不在商店和研究所的道具不能购买', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 999)
    const nonShopId = state.itemDeck.definitions
      .find(d => !state.itemDeck.shopInventory.availableItemIds.includes(d.id)
        && !state.itemDeck.researchInventory.availableResearchIds.includes(d.id))
    if (!nonShopId) return
    const next = reducer(state, { type: 'BUY_ITEM', itemDefId: nonShopId.id })
    expect(next).toBe(state)
  })
})

describe('USE_ITEM: vehicle items', () => {
  it('使用摩托车改变交通工具', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-00')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-00' })
    expect(next.players[0].vehicle).toBe('MOTORCYCLE')
    expect(next.log[next.log.length - 1].text).toContain('摩托车')
  })

  it('使用汽车改变交通工具', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-01')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-01' })
    expect(next.players[0].vehicle).toBe('CAR')
  })
})

describe('USE_ITEM: weapon items', () => {
  it('飞弹攻击地产降一级', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-02')
    // Set up owned property on tile c40_01
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === state.players[1].id ? { ...p, ownedTileIds: ["c40_01"] } : p),
      board: {
        ...state.board,
        properties: { ...state.board.properties, "c40_01": { ...state.board.properties["c40_01"], ownerId: state.players[1].id, level: 3 } },
      },
    }
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-02', targetTileId: "c40_01" })
    expect(next.board.properties["c40_01"].level).toBe(2)
  })

  it('炸弹将建筑炸至平地', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-03')
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === state.players[1].id ? { ...p, ownedTileIds: ["c40_01"] } : p),
      board: {
        ...state.board,
        properties: { ...state.board.properties, "c40_01": { ...state.board.properties["c40_01"], ownerId: state.players[1].id, level: 3 } },
      },
    }
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-03', targetTileId: "c40_01" })
    expect(next.board.properties["c40_01"].level).toBe(0)
  })

  it('核子飞弹范围摧毁建筑', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-11')
    // Set up several properties
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === state.players[1].id ? { ...p, ownedTileIds: ["c40_01", "c40_03", "c40_05"] } : p),
      board: {
        ...state.board,
        properties: {
          ...state.board.properties,
          "c40_01": { ...state.board.properties["c40_01"], ownerId: state.players[1].id, level: 2 },
          "c40_03": { ...state.board.properties["c40_03"], ownerId: state.players[1].id, level: 1 },
          "c40_05": { ...state.board.properties["c40_05"], ownerId: state.players[1].id, level: 3 },
        },
      },
    }
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-11', targetTileId: "c40_03" })
    expect(next.board.properties["c40_03"].level).toBe(0)
    expect(next.board.properties["c40_01"].level).toBe(0) // within range 5
    expect(next.board.properties["c40_05"].level).toBe(0) // within range 5
  })
})

describe('USE_ITEM: trap items', () => {
  it('放置地雷在格子上', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-04')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-04', targetTileId: "c40_05" })
    expect(next.board.boardTraps["c40_05"]).toBeDefined()
    expect(next.board.boardTraps["c40_05"].itemDefId).toBe('item-04')
  })

  it('放置路障在格子上', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-07')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-07', targetTileId: "c40_10" })
    expect(next.board.boardTraps["c40_10"].itemDefId).toBe('item-07')
  })

  it('地雷触发扣钱加住院', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const playerCash = state.players[0].cash
    state = {
      ...state,
      board: {
        ...state.board,
        boardTraps: { "c40_05": { itemDefId: 'item-04', instanceId: 'mine1', ownerId: state.players[1].id, countdown: -1 } },
      },
    }
    const next = resolveTraps(state, 5)
    expect(next.players[0].cash).toBeLessThan(playerCash)
    expect(next.players[0].hospitalTurns).toBe(2)
    expect(next.board.boardTraps["c40_05"]).toBeUndefined()
  })
})

describe('USE_ITEM: tool items', () => {
  it('工程车拆除建筑至平地', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-09')
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === state.players[1].id ? { ...p, ownedTileIds: ["c40_01"] } : p),
      board: {
        ...state.board,
        properties: { ...state.board.properties, "c40_01": { ...state.board.properties["c40_01"], ownerId: state.players[1].id, level: 4 } },
      },
    }
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-09', targetTileId: "c40_01" })
    expect(next.board.properties["c40_01"].level).toBe(0)
  })

  it('吸尘器设置 rentAbsorbing', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-10')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-10' })
    expect(next.players[0].rentAbsorbing).toBe(true)
    expect(next.players[0].isCollectingRent).toBe(false)
  })

  it('机器娃娃清除前方陷阱', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-06')
    state = {
      ...state,
      board: {
        ...state.board,
        boardTraps: {
          "c40_05": { itemDefId: 'item-04', instanceId: 'm1', ownerId: state.players[1].id, countdown: -1 },
          "c40_10": { itemDefId: 'item-07', instanceId: 'r1', ownerId: state.players[1].id, countdown: -1 },
        },
      },
    }
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-06' })
    expect(Object.keys(next.board.boardTraps)).toHaveLength(0)
  })

  it('传送器传送到目标玩家位置', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-12')
    // Set player B at position c40_15
    state = { ...state, players: state.players.map(p =>
      p.id === state.players[1].id ? { ...p, position: "c40_15" } : p) }
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-12', targetId: state.players[1].id })
    expect(next.players[0].position).toBe("c40_15")
  })
})

describe('USE_ITEM: durability', () => {
  it('消耗品使用后减少耐久', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-02')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-02', targetTileId: "c40_01" })
    // item-02 has durability 1, should be removed after use
    expect(next.players[0].items).toHaveLength(0)
  })

  it('耐久归零后从道具栏移除', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    // item-06 (机器娃娃) has durability 3
    state = addItemToInventory(state, state.players[0].id, 'item-06')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-06' })
    // Uses 1 → remaining 2
    expect(next.players[0].items).toHaveLength(1)
    expect(next.players[0].items![0].durability).toBe(2)
  })

  it('无限耐久道具不消耗', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-00')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-00' })
    // item-00 has durability -1 (infinite)
    expect(next.players[0].items).toHaveLength(1)
  })
})

describe('USE_ITEM: item needs choice', () => {
  it('无目标时使用需要选择的道具弹选择窗口', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addItemToInventory(state, state.players[0].id, 'item-04')
    const next = reducer(state, { type: 'USE_ITEM', itemInstanceId: 'test_item-04' })
    expect(next.awaitingDecision).toBeDefined()
    expect(next.awaitingDecision!.kind).toBe('useCardChoice')
    // Item should be removed from inventory while awaiting choice
    expect(next.players[0].items).toHaveLength(0)
  })
})

describe('refreshItemShop', () => {
  it('商店刷新不影响购买', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 999)
    const next = reducer(state, { type: 'END_TURN' })
    // Shop was initialized, END_TURN refreshes if day % 3 === 0 (day 1)
    expect(next.itemDeck.shopInventory.availableItemIds).toHaveLength(3)
  })
})

describe('tickTimedBombs', () => {
  it('定时炸弹倒计时结束后爆炸', () => {
    let state = baseState()
    state = {
      ...state,
      board: {
        ...state.board,
        boardTraps: {
          "c40_07": { itemDefId: 'item-05', instanceId: 'b1', ownerId: state.players[0].id, countdown: 1 },
        },
        properties: { ...state.board.properties, "c40_07": { ...state.board.properties["c40_07"], ownerId: state.players[1].id, level: 3 } },
      },
    }
    const next = tickTimedBombs(state)
    expect(Object.keys(next.board.boardTraps)).toHaveLength(0)
    expect(next.board.properties["c40_07"].level).toBe(0)
  })
})
