import { describe, it, expect } from 'vitest'
import { isNodeAvailableNow, pickLeastLoadedNode } from './policy'
import type { NodeRuntimeMap } from './runtime'

type TestCfg = { id: string; maxConcurrency: number; intervalSec: number }

function cfg(over: Partial<TestCfg> & { id: string }): TestCfg {
  return { maxConcurrency: 2, intervalSec: 0, ...over }
}

function state(activeCount: number, lastRequestTime: number) {
  return { activeCount, lastRequestTime }
}

describe('isNodeAvailableNow', () => {
  it('无运行态 → 不可用', () => {
    expect(isNodeAvailableNow(cfg({ id: 'a' }), undefined, { now: 1000 })).toBe(false)
  })

  it('并发未满且间隔为 0 → 可用', () => {
    expect(isNodeAvailableNow(cfg({ id: 'a' }), state(0, 0), { now: 1000 })).toBe(true)
  })

  it('并发已满 → 不可用', () => {
    expect(isNodeAvailableNow(cfg({ id: 'a', maxConcurrency: 1 }), state(1, 0), { now: 1000 })).toBe(false)
  })

  it('间隔未到 → 不可用', () => {
    expect(isNodeAvailableNow(cfg({ id: 'a', intervalSec: 1 }), state(0, 900), { now: 1000 })).toBe(false)
  })

  it('间隔刚好到达 → 可用', () => {
    expect(isNodeAvailableNow(cfg({ id: 'a', intervalSec: 1 }), state(0, 0), { now: 1000 })).toBe(true)
  })

  it('外部可用性回调返回 false → 不可用', () => {
    expect(isNodeAvailableNow(cfg({ id: 'a' }), state(0, 0), { now: 1000, isExternalAvailable: () => false })).toBe(false)
  })

  it('外部可用性回调返回 true → 可用', () => {
    expect(isNodeAvailableNow(cfg({ id: 'a' }), state(0, 0), { now: 1000, isExternalAvailable: () => true })).toBe(true)
  })
})

describe('pickLeastLoadedNode', () => {
  it('无可用节点 → null', () => {
    const states: NodeRuntimeMap = new Map()
    expect(pickLeastLoadedNode([cfg({ id: 'a' })], states, { now: 1000 })).toBeNull()
  })

  it('只有 1 个可用节点 → 返回它', () => {
    const states: NodeRuntimeMap = new Map([['a', state(0, 0)]])
    const picked = pickLeastLoadedNode([cfg({ id: 'a' })], states, { now: 1000 })
    expect(picked?.cfg.id).toBe('a')
  })

  it('并发已满的节点被跳过', () => {
    const states: NodeRuntimeMap = new Map([
      ['full', state(2, 0)],
      ['free', state(0, 0)],
    ])
    const picked = pickLeastLoadedNode(
      [cfg({ id: 'full', maxConcurrency: 2 }), cfg({ id: 'free' })],
      states,
      { now: 1000 },
    )
    expect(picked?.cfg.id).toBe('free')
  })

  it('按最久未用排序', () => {
    const states: NodeRuntimeMap = new Map([
      ['recent', state(0, 800)],
      ['old', state(0, 100)],
    ])
    const picked = pickLeastLoadedNode([cfg({ id: 'recent' }), cfg({ id: 'old' })], states, { now: 1000 })
    expect(picked?.cfg.id).toBe('old')
  })

  it('时间相同时按最少连接排序', () => {
    const states: NodeRuntimeMap = new Map([
      ['busy', state(2, 100)],
      ['idle', state(0, 100)],
    ])
    const picked = pickLeastLoadedNode(
      [cfg({ id: 'busy', maxConcurrency: 2 }), cfg({ id: 'idle' })],
      states,
      { now: 1000 },
    )
    expect(picked?.cfg.id).toBe('idle')
  })

  it('返回的运行态对象与 map 中是同一引用', () => {
    const s = state(0, 0)
    const states: NodeRuntimeMap = new Map([['a', s]])
    const picked = pickLeastLoadedNode([cfg({ id: 'a' })], states, { now: 1000 })
    expect(picked?.state).toBe(s)
  })
})
