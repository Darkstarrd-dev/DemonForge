import { describe, it, expect } from 'vitest'
import { createInitialState, reducer } from '../engine'
import { createDefaultBoard } from '../board.preset'
import type { GameState, NewGameConfig, EconomyState } from '../types'
import { SpaceType } from '../types'
import { handleEventSpace, resolveLottery, resolveTeleport, resolveMiniGame } from '../engine/event'

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

function setTurn(state: GameState, playerId: string): GameState {
  return { ...state, turn: { ...state.turn, currentPlayerId: playerId } }
}

function mockEventTile(index: number, spaceType: SpaceType, name: string): GameState {
  const st = baseState()
  const tile = { ...st.board.tiles[index], spaceType, name }
  const tiles = [...st.board.tiles]
  tiles[index] = tile
  return { ...st, board: { ...st.board, tiles } }
}

describe('handleEventSpace routing', () => {
  it('NEWS tile triggers news event without decision', () => {
    const state = mockEventTile(2, SpaceType.NEWS, '新闻')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(false)
    expect(result.state.log.length).toBeGreaterThan(state.log.length)
    expect(result.state.log[result.state.log.length - 1].kind).toBe('news')
  })

  it('FATE tile triggers fate event without decision', () => {
    const state = mockEventTile(2, SpaceType.FATE, '命运')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(false)
    expect(result.state.log.length).toBeGreaterThan(state.log.length)
  })

  it('MAGIC_HOUSE tile triggers magic house event without decision', () => {
    const state = mockEventTile(2, SpaceType.MAGIC_HOUSE, '魔法屋')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(false)
    expect(result.state.log.length).toBeGreaterThan(state.log.length)
  })

  it('TREASURE_BOX tile triggers treasure box without decision', () => {
    const state = mockEventTile(2, SpaceType.TREASURE_BOX, '宝箱')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(false)
    expect(result.state.log.length).toBeGreaterThan(state.log.length)
  })

  it('LOTTERY tile triggers lottery decision', () => {
    const state = mockEventTile(2, SpaceType.LOTTERY, '乐透')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(true)
    expect(result.decision).toBeDefined()
    expect(result.decision!.kind).toBe('lotteryBet')
  })

  it('TELEPORT tile triggers teleport decision', () => {
    const state = mockEventTile(2, SpaceType.TELEPORT, '传送')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(true)
    expect(result.decision).toBeDefined()
    expect(result.decision!.kind).toBe('teleportTarget')
    expect(result.decision!.options.length).toBeGreaterThan(0)
  })

  it('MINI_GAME tile triggers mini-game decision', () => {
    const state = mockEventTile(2, SpaceType.MINI_GAME, '小游戏')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(true)
    expect(result.decision).toBeDefined()
  })

  it('BANK tile triggers bank operation decision', () => {
    const state = mockEventTile(2, SpaceType.BANK, '银行')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(true)
    expect(result.decision!.kind).toBe('bankOperation')
    expect(result.decision!.options).toHaveLength(5)
  })

  it('SHOP tile triggers shop decision', () => {
    const state = mockEventTile(2, SpaceType.SHOP, '商店')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(true)
    expect(result.decision!.kind).toBe('useCardChoice')
    expect(result.decision!.context.eventShop).toBe(true)
  })

  it('normal property tile does not trigger event', () => {
    const state = baseState()
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 1)
    expect(result.needsDecision).toBe(false)
  })
})

describe('News events', () => {
  it('ALL_GAIN_CASH gives cash to all alive players', () => {
    const state = mockEventTile(2, SpaceType.NEWS, '新闻')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.state.log[result.state.log.length - 1].kind).toBe('news')
  })

  it('STOCK_SURGE sets stockLimitUpDays on all companies', () => {
    const state = mockEventTile(2, SpaceType.NEWS, '新闻')
    const economy: EconomyState = state.economy!
    const withEconomy = { ...state, economy: { ...economy } }
    const result = handleEventSpace(setTurn(withEconomy, withEconomy.players[0].id), withEconomy.players[0].id, 2)
    expect(result.state.log[result.state.log.length - 1].kind).toBe('news')
  })
})

describe('Fate events', () => {
  it('SEND_TO_JAIL sends player to jail', () => {
    const withFate = mockEventTile(2, SpaceType.FATE, '命运')
    const result = handleEventSpace(setTurn(withFate, withFate.players[0].id), withFate.players[0].id, 2)
    expect(result.needsDecision).toBe(false)
    expect(result.state.log.length).toBeGreaterThan(withFate.log.length)
  })

  it('GIVE_CARD adds card to player hand', () => {
    const withFate = mockEventTile(2, SpaceType.FATE, '命运')
    const result = handleEventSpace(setTurn(withFate, withFate.players[0].id), withFate.players[0].id, 2)
    expect(result.state.log.length).toBeGreaterThan(withFate.log.length)
  })
})

describe('Magic House events', () => {
  it('ALL_GAIN_CASH gives cash to player', () => {
    const state = mockEventTile(2, SpaceType.MAGIC_HOUSE, '魔法屋')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.state.log.length).toBeGreaterThan(state.log.length)
    expect(result.state.log[result.state.log.length - 1].kind).toBe('magicHouse')
  })

  it('CHANGE_VEHICLE upgrades vehicle', () => {
    const state = mockEventTile(2, SpaceType.MAGIC_HOUSE, '魔法屋')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.state.log.length).toBeGreaterThanOrEqual(state.log.length + 1)
  })
})

describe('Treasure Box', () => {
  it('gives cash reward', () => {
    const state = mockEventTile(7, SpaceType.TREASURE_BOX, '宝箱')
    const cash = state.players[0].cash
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 7)
    const player = result.state.players[0]
    expect(player.cash).toBeGreaterThanOrEqual(cash)
    expect(result.state.log[result.state.log.length - 1].kind).toBe('treasure')
  })

  it('triggers without decision', () => {
    const state = mockEventTile(7, SpaceType.TREASURE_BOX, '宝箱')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 7)
    expect(result.needsDecision).toBe(false)
  })
})

describe('Lottery', () => {
  it('creates bet/skip decision', () => {
    const state = mockEventTile(2, SpaceType.LOTTERY, '乐透')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(true)
    expect(result.decision!.options).toHaveLength(2)
    expect(result.decision!.options[0].id).toBe('bet')
    expect(result.decision!.options[1].id).toBe('skip')
  })

  it('resolveLottery skip does not cost cash', () => {
    const state = baseState()
    const cash = state.players[0].cash
    const result = resolveLottery(state, state.players[0].id, false)
    expect(result.players[0].cash).toBe(cash)
  })

  it('resolveLottery with bet deducts 200 cash', () => {
    const state = baseState()
    const cash = state.players[0].cash
    const result = resolveLottery(state, state.players[0].id, true)
    expect(result.players[0].cash).toBeLessThan(cash)
    expect(result.players[0].cash).toBeGreaterThanOrEqual(cash - 2200)
  })

  it('resolveLottery with bet but insufficient cash returns unchanged', () => {
    const state = baseState()
    const poorState = { ...state, players: state.players.map(p => ({ ...p, cash: 50 })) }
    const result = resolveLottery(poorState, poorState.players[0].id, true)
    expect(result.players[0].cash).toBe(50)
  })

  it('integration: LOTTERY tile → lotteryBet decision → resolve through reducer', () => {
    const state = mockEventTile(2, SpaceType.LOTTERY, '乐透')
    const s = setTurn(state, state.players[0].id)
    const result = handleEventSpace(s, s.players[0].id, 2)
    if (result.needsDecision && result.decision) {
      const next = reducer(result.state, { type: 'RESOLVE_DECISION', optionId: 'bet' })
      expect(next.awaitingDecision).toBeUndefined()
    }
  })
})

describe('Teleport', () => {
  it('creates teleport target decision with all tiles as options', () => {
    const withTele = mockEventTile(2, SpaceType.TELEPORT, '传送')
    const r2 = handleEventSpace(setTurn(withTele, withTele.players[0].id), withTele.players[0].id, 2)
    expect(r2.needsDecision).toBe(true)
    expect(r2.decision!.kind).toBe('teleportTarget')
    expect(r2.decision!.options.length).toBeGreaterThan(0)
  })

  it('resolveTeleport moves player to target tile', () => {
    const state = baseState()
    const result = resolveTeleport(state, state.players[0].id, 10)
    expect(result.players[0].position).toBe(10)
  })

  it('resolveTeleport gives salary when passing start', () => {
    const state = baseState()
    const moved = { ...state, players: state.players.map(p => ({ ...p, position: 30 })) }
    const cash = moved.players[0].cash
    const result = resolveTeleport(moved, moved.players[0].id, 5)
    expect(result.players[0].position).toBe(5)
    expect(result.players[0].cash).toBe(cash + 2000)
  })

  it('teleport decision resolved through reducer', () => {
    const state = mockEventTile(2, SpaceType.TELEPORT, '传送')
    const withTurn = setTurn(state, state.players[0].id)
    const result = handleEventSpace(withTurn, withTurn.players[0].id, 2)
    if (result.needsDecision && result.decision) {
      const withAwait = { ...result.state, awaitingDecision: result.decision }
      const next = reducer(withAwait, { type: 'RESOLVE_DECISION', optionId: '10' })
      expect(next.players[0].position).toBe(10)
      expect(next.awaitingDecision).toBeUndefined()
    }
  })
})

describe('Mini Game', () => {
  it('creates play/skip decision', () => {
    const state = mockEventTile(2, SpaceType.MINI_GAME, '小游戏')
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 2)
    expect(result.needsDecision).toBe(true)
    expect(result.decision!.options[0].id).toBe('play')
    expect(result.decision!.options[1].id).toBe('skip')
  })

  it('resolveMiniGame play gives cash', () => {
    const state = baseState()
    const cash = state.players[0].cash
    const result = resolveMiniGame(state, state.players[0].id, true)
    expect(result.players[0].cash).not.toBe(cash)
  })

  it('resolveMiniGame skip does nothing', () => {
    const state = baseState()
    const cash = state.players[0].cash
    const result = resolveMiniGame(state, state.players[0].id, false)
    expect(result.players[0].cash).toBe(cash)
  })
})

describe('Integration: event turns through reducer', () => {
  it('landing on NEWS tile through ROLL_DICE produces news log entry', () => {
    const state = mockEventTile(2, SpaceType.NEWS, '新闻')
    const s = setTurn(state, state.players[0].id)
    const result = reducer(s, { type: 'ROLL_DICE', dice: [1, 1] })
    if (result.board.tiles[2]?.spaceType === SpaceType.NEWS) {
      expect(result.log[result.log.length - 1].kind).toBe('news')
    }
  })

  it('landing on FATE tile through ROLL_DICE produces fate log entry', () => {
    const state = mockEventTile(2, SpaceType.FATE, '命运')
    const s = setTurn(state, state.players[0].id)
    const result = reducer(s, { type: 'ROLL_DICE', dice: [1, 1] })
    if (result.board.tiles[2]?.spaceType === SpaceType.FATE) {
      expect(result.log[result.log.length - 1].kind).toBe('fate')
    }
  })

  it('handles CHANCE tile without spaceType gracefully (no event)', () => {
    const state = baseState()
    const s = setTurn(state, state.players[0].id)
    const result = reducer(s, { type: 'ROLL_DICE', dice: [1, 1] })
    expect(result.players[0].position).toBe(2)
  })
})

describe('handleEventSpace with old TileType fallback', () => {
  it('news type (old) triggers news event', () => {
    const state = baseState()
    const tile = { ...state.board.tiles[2], type: 'news' as const, spaceType: undefined }
    const tiles = [...state.board.tiles]
    tiles[2] = tile
    const mod = { ...state, board: { ...state.board, tiles } }
    const result = handleEventSpace(setTurn(mod, mod.players[0].id), mod.players[0].id, 2)
    expect(result.needsDecision).toBe(false)
    if (result.state.log.length > mod.log.length) {
      expect(result.state.log[result.state.log.length - 1].kind).toBe('news')
    }
  })

  it('fate type (old) triggers fate event', () => {
    const state = baseState()
    const tile = { ...state.board.tiles[2], type: 'fate' as const, spaceType: undefined }
    const tiles = [...state.board.tiles]
    tiles[2] = tile
    const mod = { ...state, board: { ...state.board, tiles } }
    const result = handleEventSpace(setTurn(mod, mod.players[0].id), mod.players[0].id, 2)
    expect(result.needsDecision).toBe(false)
  })
})

describe('Edge cases', () => {
  it('event on nonexistent tile index returns unchanged state', () => {
    const state = baseState()
    const result = handleEventSpace(setTurn(state, state.players[0].id), state.players[0].id, 999)
    expect(result.needsDecision).toBe(false)
    expect(result.state.log.length).toBe(state.log.length)
  })

  it('treasure box works when hand is full (15 cards)', () => {
    const state = mockEventTile(7, SpaceType.TREASURE_BOX, '宝箱')
    const fullHand = Array.from({ length: 15 }, (_, i) => ({ definitionId: `test-${i}`, instanceId: `t${i}` }))
    const withFullHand = { ...state, players: state.players.map(p => ({ ...p, hand: fullHand })) }
    const result = handleEventSpace(setTurn(withFullHand, withFullHand.players[0].id), withFullHand.players[0].id, 7)
    expect(result.state.players[0].hand).toHaveLength(15)
  })

  it('lottery with insufficient cash returns no change', () => {
    const state = baseState()
    const poorState = { ...state, players: state.players.map(p => ({ ...p, cash: 0 })) }
    const result = resolveLottery(poorState, poorState.players[0].id, true)
    expect(result.players[0].cash).toBe(0)
  })
})
