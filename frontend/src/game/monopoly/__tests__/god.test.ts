import { describe, it, expect } from 'vitest'
import { createInitialState, reducer, findGodDef, loadGodDefinitions, applyPlayerGodDailyEffect, getGodMoveBoost, calcGodModifiedRent, handleGodPossession, handleGodDismiss, tickGodDurations, summonNearestGod } from '../engine'
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

function setPlayerGod(state: GameState, playerId: string, godId: string, remainingDays?: number): GameState {
  const def = findGodDef(godId)
  return {
    ...state,
    players: state.players.map(p =>
      p.id === playerId
        ? { ...p, godId, godRemainingDays: remainingDays ?? def?.durationDays ?? 7 }
        : p,
    ),
  }
}

function getPlayerById(state: GameState, id: string) {
  return state.players.find(p => p.id === id)!
}

describe('loadGodDefinitions', () => {
  it('加载 13 种神明定义', () => {
    const defs = loadGodDefinitions()
    expect(defs).toHaveLength(13)
  })

  it('各神明有基本字段', () => {
    const defs = loadGodDefinitions()
    for (const g of defs) {
      expect(g.id).toBeTruthy()
      expect(g.name).toBeTruthy()
      expect(g.durationDays).toBeGreaterThan(0)
      expect(g.effects.length).toBeGreaterThan(0)
    }
  })

  it('死神不可送走', () => {
    const death = findGodDef('god-11')!
    expect(death.canDismiss).toBe(false)
    expect(death.durationDays).toBe(13)
  })

  it('小财神可变身大财神', () => {
    const smallGod = findGodDef('god-04')!
    expect(smallGod.transformTo).toBe('god-05')
  })
})

describe('findGodDef', () => {
  it('查找已知神明', () => {
    const g = findGodDef('god-00')
    expect(g).toBeDefined()
    expect(g!.name).toBe('财神')
  })

  it('未知 ID 返回 undefined', () => {
    expect(findGodDef('god-99')).toBeUndefined()
  })
})

describe('handleGodPossession', () => {
  it('附身后设置 godId 和剩余天数', () => {
    const state = baseState()
    const pid = state.players[0].id
    const next = handleGodPossession(state, pid, 'god-00')
    expect(next.players[0].godId).toBe('god-00')
    expect(next.players[0].godRemainingDays).toBe(7)
  })

  it('附身后写入日志', () => {
    const state = baseState()
    const pid = state.players[0].id
    const next = handleGodPossession(state, pid, 'god-00')
    const lastLog = next.log[next.log.length - 1]
    expect(lastLog.kind).toBe('godPossess')
    expect(lastLog.text).toContain('财神')
  })
})

describe('handleGodDismiss', () => {
  it('送走可送神明', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-00')
    const pid = state.players[0].id
    const next = handleGodDismiss(state, pid)
    expect(getPlayerById(next, pid).godId).toBeUndefined()
    expect(getPlayerById(next, pid).godRemainingDays).toBe(0)
  })

  it('死神不可送走', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-11')
    const pid = state.players[0].id
    const next = handleGodDismiss(state, pid)
    expect(getPlayerById(next, pid).godId).toBe('god-11')
  })
})

describe('tickGodDurations', () => {
  it('减少剩余天数', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-00', 3)
    const next = tickGodDurations(state)
    expect(getPlayerById(next, baseState().players[0].id).godRemainingDays).toBe(2)
  })

  it('到期神明离开', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-00', 1)
    const next = tickGodDurations(state)
    expect(getPlayerById(next, baseState().players[0].id).godId).toBeUndefined()
  })

  it('小财神到期变身大财神（god-04→god-05）', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-04', 1)
    const next = tickGodDurations(state)
    expect(getPlayerById(next, baseState().players[0].id).godId).toBe('god-05')
    expect(getPlayerById(next, baseState().players[0].id).godRemainingDays).toBe(7)
  })
})

describe('applyPlayerGodDailyEffect', () => {
  it('财神每日给玩家 500 现金', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-00')
    const cash = getPlayerById(state, baseState().players[0].id).cash
    const next = applyPlayerGodDailyEffect(state, getPlayerById(state, baseState().players[0].id))
    expect(getPlayerById(next, baseState().players[0].id).cash).toBe(cash + 500)
  })

  it('穷神每日扣 500 现金', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-06')
    const cash = getPlayerById(state, baseState().players[0].id).cash
    const next = applyPlayerGodDailyEffect(state, getPlayerById(state, baseState().players[0].id))
    expect(getPlayerById(next, baseState().players[0].id).cash).toBe(cash - 500)
  })

  it('死神每日扣 200 现金', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-11')
    const cash = getPlayerById(state, baseState().players[0].id).cash
    const next = applyPlayerGodDailyEffect(state, getPlayerById(state, baseState().players[0].id))
    expect(getPlayerById(next, baseState().players[0].id).cash).toBe(cash - 200)
  })

  it('天使每日给所有玩家 300 现金', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-12')
    const cashA = getPlayerById(state, baseState().players[0].id).cash
    const cashB = getPlayerById(state, baseState().players[1].id).cash
    const next = applyPlayerGodDailyEffect(state, getPlayerById(state, baseState().players[0].id))
    expect(getPlayerById(next, baseState().players[0].id).cash).toBe(cashA + 300)
    expect(getPlayerById(next, baseState().players[1].id).cash).toBe(cashB + 300)
  })

  it('福神每日给一张卡片', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-01')
    const before = (getPlayerById(state, baseState().players[0].id).hand ?? []).length
    const next = applyPlayerGodDailyEffect(state, getPlayerById(state, baseState().players[0].id))
    expect((getPlayerById(next, baseState().players[0].id).hand ?? []).length).toBe(before + 1)
  })

  it('捣蛋鬼每日扣一张卡片', () => {
    let state = setPlayerGod(baseState(), baseState().players[0].id, 'god-08')
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === baseState().players[0].id
          ? { ...p, hand: [{ definitionId: 'card-00', instanceId: 'test_hand' }] }
          : p,
      ),
    }
    const before = (getPlayerById(state, baseState().players[0].id).hand ?? []).length
    const next = applyPlayerGodDailyEffect(state, getPlayerById(state, baseState().players[0].id))
    expect((getPlayerById(next, baseState().players[0].id).hand ?? []).length).toBe(Math.max(0, before - 1))
  })

  it('无神明附身时无效果', () => {
    const state = baseState()
    const next = applyPlayerGodDailyEffect(state, getPlayerById(state, baseState().players[0].id))
    expect(next.players[0].cash).toBe(baseState().players[0].cash)
    expect(next.log.length).toBe(baseState().log.length)
  })
})

describe('getGodMoveBoost', () => {
  it('土地公 +2 步', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-03')
    const boost = getGodMoveBoost(getPlayerById(state, baseState().players[0].id))
    expect(boost).toBe(2)
  })

  it('瞌睡虫 -2 步', () => {
    const state = setPlayerGod(baseState(), baseState().players[0].id, 'god-09')
    const boost = getGodMoveBoost(getPlayerById(state, baseState().players[0].id))
    expect(boost).toBe(-2)
  })

  it('无神明时 0', () => {
    expect(getGodMoveBoost(baseState().players[0])).toBe(0)
  })
})

describe('calcGodModifiedRent', () => {
  it('财神使房东租金 ×1.5', () => {
    const landlord = { ...baseState().players[0], godId: 'god-00' }
    const tenant = baseState().players[1]
    expect(calcGodModifiedRent(100, landlord, tenant)).toBe(150)
  })

  it('爱神使租户租金 ×0.5', () => {
    const landlord = baseState().players[0]
    const tenant = { ...baseState().players[1], godId: 'god-02' }
    expect(calcGodModifiedRent(100, landlord, tenant)).toBe(50)
  })

  it('霉神使房东租金 ×0.5', () => {
    const landlord = { ...baseState().players[0], godId: 'god-10' }
    const tenant = baseState().players[1]
    expect(calcGodModifiedRent(160, landlord, tenant)).toBe(80)
  })

  it('财神+爱神叠加租金 ×0.75', () => {
    const landlord = { ...baseState().players[0], godId: 'god-00' }
    const tenant = { ...baseState().players[1], godId: 'god-02' }
    expect(calcGodModifiedRent(100, landlord, tenant)).toBe(75)
  })

  it('无神明时租金不变', () => {
    expect(calcGodModifiedRent(200, baseState().players[0], baseState().players[1])).toBe(200)
  })
})

describe('summonNearestGod', () => {
  it('返回一个有效的神明 ID', () => {
    const state = baseState()
    const godId = summonNearestGod(state)
    expect(godId).toBeDefined()
    expect(findGodDef(godId!)).toBeDefined()
  })
})

describe('reducer: SUMMON_GOD card', () => {
  it('使用召唤神卡附身神明', () => {
    const state = baseState()
    const pid = state.players[0].id
    const withCard = {
      ...state,
      cardDeck: { ...state.cardDeck!, drawPile: state.cardDeck!.drawPile, discardPile: [] },
      players: state.players.map(p =>
        p.id === pid
          ? { ...p, hand: [{ definitionId: 'card-22', instanceId: 'test_summon' }], points: 100 }
          : p,
      ),
    }
    const next = reducer(withCard, { type: 'USE_CARD', cardInstanceId: 'test_summon' })
    expect(getPlayerById(next, pid).godId).toBeDefined()
    expect(getPlayerById(next, pid).godRemainingDays).toBeGreaterThan(0)
  })
})

describe('reducer: DISMISS_GOD card', () => {
  it('使用送神卡送走神明', () => {
    let state = setPlayerGod(baseState(), baseState().players[0].id, 'god-06')
    const pid = state.players[0].id
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === pid
          ? { ...p, hand: [{ definitionId: 'card-21', instanceId: 'test_dismiss' }], points: 100 }
          : p,
      ),
    }
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_dismiss' })
    expect(getPlayerById(next, pid).godId).toBeUndefined()
    expect(getPlayerById(next, pid).godRemainingDays).toBe(0)
  })

  it('送神卡对死神无效', () => {
    let state = setPlayerGod(baseState(), baseState().players[0].id, 'god-11')
    const pid = state.players[0].id
    state = {
      ...state,
      players: state.players.map(p =>
        p.id === pid
          ? { ...p, hand: [{ definitionId: 'card-21', instanceId: 'test_dismiss_death' }], points: 100 }
          : p,
      ),
    }
    const next = reducer(state, { type: 'USE_CARD', cardInstanceId: 'test_dismiss_death' })
    expect(getPlayerById(next, pid).godId).toBe('god-11')
  })
})

describe('reducer: GOD daily effects in ROLL_DICE', () => {
  it('掷骰时自动应用神明每日效果', () => {
    let state = setPlayerGod(baseState(), baseState().players[0].id, 'god-06')
    const cashBefore = getPlayerById(state, baseState().players[0].id).cash
    const next = reducer(state, { type: 'ROLL_DICE', dice: [1, 2] })
    expect(getPlayerById(next, baseState().players[0].id).cash).toBe(cashBefore - 500)
  })
})

describe('reducer: GOD duration tick in END_TURN', () => {
  it('回合结束时减少神明倒计时', () => {
    let state = setPlayerGod(baseState(), baseState().players[0].id, 'god-00', 3)
    const next = reducer(state, { type: 'END_TURN' })
    const p1 = getPlayerById(next, baseState().players[0].id)
    expect(p1.godRemainingDays).toBe(2)
  })

  it('到期神明在 END_TURN 后离开', () => {
    let state = setPlayerGod(baseState(), baseState().players[0].id, 'god-00', 1)
    const next = reducer(state, { type: 'END_TURN' })
    expect(getPlayerById(next, baseState().players[0].id).godId).toBeUndefined()
  })
})
