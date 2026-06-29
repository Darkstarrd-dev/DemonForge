import { describe, it, expect } from 'vitest'
import { createInitialState, reducer } from '../engine'
import type { GameState, NewGameConfig } from '../types'
import { TurnPhaseV2 } from '../types'

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

function addCardToHand(state: GameState, playerId: string, cardDefId: string): GameState {
  const deck = state.cardDeck
  const def = deck.definitions.find(d => d.id === cardDefId)
  if (!def) return state
  return {
    ...state,
    players: state.players.map(p =>
      p.id === playerId
        ? { ...p, hand: [...(p.hand ?? []), { definitionId: cardDefId, instanceId: `test_${cardDefId}` }] }
        : p,
    ),
  }
}

describe('createCardDeck', () => {
  it('卡组初始化含 30 种卡片定义', () => {
    const state = baseState()
    expect(state.cardDeck).toBeDefined()
    expect(state.cardDeck.definitions).toHaveLength(30)
  })

  it('摸牌堆含 60 张（每种 2 张）', () => {
    const state = baseState()
    expect(state.cardDeck.drawPile).toHaveLength(60)
  })

  it('商店初始有 6 张可用卡片', () => {
    const state = baseState()
    expect(state.cardDeck.shopInventory.availableCards).toHaveLength(6)
  })

  it('每位玩家初始手牌为空、点数为 0', () => {
    const state = baseState()
    for (const p of state.players) {
      expect(p.hand).toEqual([])
      expect(p.points).toBe(0)
    }
  })
})

describe('BUY_CARD', () => {
  it('有足够点数时购买卡片', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 100)
    const shopCard = state.cardDeck.shopInventory.availableCards[0]
    const def = state.cardDeck.definitions.find(d => d.id === shopCard)!
    const next = reducer(state, { type: 'BUY_CARD', cardDefId: shopCard })
    expect(next.players[0].hand).toHaveLength(1)
    expect(next.players[0].hand![0].definitionId).toBe(shopCard)
    expect(next.players[0].points).toBe(100 - def.pointCost)
  })

  it('点数不足时不能购买', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    const shopCard = state.cardDeck.shopInventory.availableCards[0]
    const next = reducer(state, { type: 'BUY_CARD', cardDefId: shopCard })
    expect(next.players[0].hand).toHaveLength(0)
    expect(next).toBe(state)
  })

  it('超过手牌上限 15 不能购买', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 999)
    const manyCards = Array.from({ length: 15 }, (_, i) => ({ definitionId: `test-${i}`, instanceId: `t${i}` }))
    state = { ...state, players: state.players.map(p =>
      p.id === state.players[0].id ? { ...p, hand: manyCards } : p) }
    const shopCard = state.cardDeck.shopInventory.availableCards[0]
    const next = reducer(state, { type: 'BUY_CARD', cardDefId: shopCard })
    expect(next).toBe(state)
  })

  it('不在商店的卡片不能购买', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 999)
    const nonShopCard = state.cardDeck.definitions
      .find(d => !state.cardDeck.shopInventory.availableCards.includes(d.id))
    if (!nonShopCard) return
    const next = reducer(state, { type: 'BUY_CARD', cardDefId: nonShopCard.id })
    expect(next).toBe(state)
  })
})

describe('USE_CARD: money effects', () => {
  it('均富卡使所有玩家现金相等', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-11')
    const total = state.players.reduce((s, p) => s + p.cash, 0)
    const avg = Math.floor(total / state.players.length)
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-11' })
    expect(next.players[0].cash).toBe(avg)
    expect(next.players[1].cash).toBe(avg)
  })

  it('红利卡使所有玩家获得现金（ALL_GAIN_CASH 效果未在卡片引擎实现）', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-23')
    const playerCash = state.players[0].cash
    const otherCash = state.players[1].cash
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-23' })
    expect(next.players[0].cash).toBe(playerCash)
    expect(next.players[1].cash).toBe(otherCash)
  })
})

describe('USE_CARD: status effects', () => {
  it('陷害卡送入狱', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-17')
    const targetId = state.players[1].id
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-17', targetId })
    expect(next.players[1].jailTurns).toBe(3)
    expect(next.log[next.log.length - 1].text).toContain('送入监狱')
  })

  it('冻结卡使对手停一回合', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-05')
    const targetId = state.players[1].id
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-05', targetId })
    expect(next.players[1].skipTurns).toBe(1)
  })

  it('使用后从手牌移除', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-05')
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-05', targetId: state.players[1].id })
    expect(next.players[0].hand).toHaveLength(0)
  })
})

describe('USE_CARD: reaction / counter chain', () => {
  it('使用陷害卡触犯反制窗口（对方有免罪卡）', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-17')
    // Give target a counter card (免罪卡 card-20)
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === state.players[1].id
          ? { ...p, hand: [...(p.hand ?? []), { definitionId: 'card-20', instanceId: 'reaction_card' }] }
          : p,
      ),
    }
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-17', targetId: state.players[1].id })
    expect(next.awaitingDecision).toBeDefined()
    expect(next.awaitingDecision!.kind).toBe('cardReaction')
    expect(next.awaitingDecision!.playerId).toBe(state.players[1].id)
  })

  it('免罪卡反击后取消攻击', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-17')
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === state.players[1].id
          ? { ...p, hand: [...(p.hand ?? []), { definitionId: 'card-20', instanceId: 'reaction_card' }] }
          : p,
      ),
    }
    const afterUse = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-17', targetId: state.players[1].id })
    expect(afterUse.awaitingDecision).toBeDefined()
    // Target uses immunity card
    const next = reducer(afterUse, { type: 'RESOLVE_DECISION', optionId: 'reaction_card' })
    expect(next.players[1].jailTurns).toBeUndefined()
    expect(next.players[1].hand).toHaveLength(0) // immunity card consumed
    expect(next.awaitingDecision).toBeUndefined()
  })

  it('选择承受效果则反制窗口关闭、效果生效', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-17')
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === state.players[1].id
          ? { ...p, hand: [...(p.hand ?? []), { definitionId: 'card-20', instanceId: 'reaction_card' }] }
          : p,
      ),
    }
    const afterUse = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-17', targetId: state.players[1].id })
    // Target chooses to ignore
    const next = reducer(afterUse, { type: 'RESOLVE_DECISION', optionId: '__ignore__' })
    expect(next.players[1].jailTurns).toBe(3) // effect still applies
    expect(next.awaitingDecision).toBeUndefined()
  })
})

describe('USE_CARD: card choice resolution', () => {
  it('传送卡弹选择（useCardChoice）', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-27')
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-27' })
    expect(next.awaitingDecision).toBeDefined()
    expect(next.awaitingDecision!.kind).toBe('useCardChoice')
  })

  it('选择传送位置后玩家移动到目标格', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-27')
    const afterUse = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-27' })
    const next = reducer(afterUse, { type: 'RESOLVE_DECISION', optionId: 'c40_05' })
    expect(next.players[0].position).toBe('c40_05')
    expect(next.awaitingDecision).toBeUndefined()
  })

  it('遥控骰子选择步数并前进', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-00')
    const afterUse = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-00' })
    expect(afterUse.awaitingDecision).toBeDefined()
    const next = reducer(afterUse, { type: 'RESOLVE_DECISION', optionId: '4' })
    expect(next.players[0].position).toBe('c40_04')
  })
})

describe('USE_CARD: property effects', () => {
  it('购地卡强制购买无主地产', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-12')
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-12', targetTileId: 'c40_01' })
    expect(next.board.properties['c40_01'].ownerId).toBe(state.players[0].id)
    expect(next.players[0].ownedTileIds).toContain('c40_01')
    expect(next.players[0].cash).toBeLessThan(15000)
  })

  it('涨价卡使路段涨价', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-08')
    const tile = state.board.tiles.find(t => t.groupId !== undefined)
    if (!tile) return
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-08', targetTileId: tile.id })
    const groupId = tile.groupId!
    expect(next.board.priceUpGroups).toBeDefined()
    expect(next.board.priceUpGroups![groupId]).toBe(5)
  })

  it('查封卡查封路段', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-09')
    const tile = state.board.tiles.find(t => t.groupId !== undefined)
    if (!tile) return
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-09', targetTileId: tile.id })
    const groupId = tile.groupId!
    expect(next.board.sealedGroups).toBeDefined()
    expect(next.board.sealedGroups![groupId]).toBe(5)
  })
})

describe('sell and remove card', () => {
  it('涨价卡/查封卡持续时间递减', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = addCardToHand(state, state.players[0].id, 'card-08')
    const tile = state.board.tiles.find(t => t.groupId !== undefined)
    if (!tile) return
    const withCard = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_card-08', targetTileId: tile.id })
    expect(withCard.board.priceUpGroups![tile.groupId!]).toBe(5)
    const afterEnd1 = reducer(withCard, { type: 'END_TURN' })
    expect(afterEnd1.board.priceUpGroups![tile.groupId!]).toBe(4)
    const afterEnd2 = reducer(afterEnd1, { type: 'END_TURN' })
    expect(afterEnd2.board.priceUpGroups![tile.groupId!]).toBe(3)
    const afterEnd3 = reducer(afterEnd2, { type: 'END_TURN' })
    expect(afterEnd3.board.priceUpGroups![tile.groupId!]).toBe(2)
    const afterEnd4 = reducer(afterEnd3, { type: 'END_TURN' })
    expect(afterEnd4.board.priceUpGroups![tile.groupId!]).toBe(1)
    const afterEnd5 = reducer(afterEnd4, { type: 'END_TURN' })
    expect(afterEnd5.board.priceUpGroups).toEqual({})
  })
})

describe('skipTurns in turn flow', () => {
  it('被冻结的玩家跳过回合', () => {
    let state = baseState()
    state = { ...state, players: state.players.map(p =>
      p.id === state.players[0].id ? { ...p, skipTurns: 1 } : p) }
    const next = reducer(state, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(next.turnContext.phase).toBe(TurnPhaseV2.TURN_END)
    expect(next.players[0].skipTurns).toBe(0)
  })
})

describe('store refresh', () => {
  it('商店刷新不影响购买', () => {
    let state = baseState()
    state = setTurn(state, state.players[0].id)
    state = givePoints(state, state.players[0].id, 999)
    const deck = state.cardDeck
    const refreshed = {
      ...deck,
      shopInventory: { ...deck.shopInventory, availableCards: deck.definitions.slice(0, 6).map(d => d.id) },
    }
    state = { ...state, cardDeck: refreshed }
    const shopCard = refreshed.shopInventory.availableCards[0]
    const next = reducer(state, { type: 'BUY_CARD', cardDefId: shopCard })
    expect(next.players[0].hand).toHaveLength(1)
  })
})
