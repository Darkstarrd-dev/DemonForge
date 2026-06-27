import { describe, it, expect } from 'vitest'
import { NodeCircuitBreaker } from './circuitBreaker'

describe('NodeCircuitBreaker', () => {
  it('达阈值才熔断：limit=3 时第 3 次失败触发', () => {
    const b = new NodeCircuitBreaker(3)
    expect(b.recordFailure('n')).toBe(false)
    expect(b.recordFailure('n')).toBe(false)
    expect(b.isDisabled('n')).toBe(false)
    expect(b.recordFailure('n')).toBe(true) // 第 3 次触发
    expect(b.isDisabled('n')).toBe(true)
  })

  it('成功归零连续失败计数：success 后重新累计', () => {
    const b = new NodeCircuitBreaker(3)
    b.recordFailure('n')
    b.recordFailure('n')
    b.recordSuccess('n') // 计数清零
    expect(b.recordFailure('n')).toBe(false) // 第 1 次（重新计）
    expect(b.recordFailure('n')).toBe(false) // 第 2 次
    expect(b.isDisabled('n')).toBe(false)
    expect(b.recordFailure('n')).toBe(true) // 第 3 次才触发
  })

  it('已熔断后再次失败返回 false（不重复触发），仍保持熔断', () => {
    const b = new NodeCircuitBreaker(2)
    b.recordFailure('n')
    expect(b.recordFailure('n')).toBe(true) // 触发
    expect(b.recordFailure('n')).toBe(false) // 已熔断，不重复触发
    expect(b.isDisabled('n')).toBe(true)
  })

  it('手动恢复：reset 清熔断 + 计数归零，可重新累计至再次熔断', () => {
    const b = new NodeCircuitBreaker(2)
    b.recordFailure('n')
    b.recordFailure('n') // 触发熔断
    expect(b.isDisabled('n')).toBe(true)
    b.reset('n')
    expect(b.isDisabled('n')).toBe(false)
    expect(b.recordFailure('n')).toBe(false) // 计数从 0 重新开始
    expect(b.recordFailure('n')).toBe(true) // 再次触发
  })

  it('availableNodes 过滤掉已熔断节点，保持原顺序', () => {
    const b = new NodeCircuitBreaker(1)
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    b.recordFailure('b') // limit=1，一次即熔断
    expect(b.availableNodes(nodes)).toEqual([{ id: 'a' }, { id: 'c' }])
  })

  it('不同节点独立计数，互不影响', () => {
    const b = new NodeCircuitBreaker(3)
    b.recordFailure('a')
    b.recordFailure('a')
    b.recordFailure('b') // b 仅 1 次
    expect(b.recordFailure('a')).toBe(true) // a 第 3 次熔断
    expect(b.isDisabled('b')).toBe(false) // b 不受影响
  })
})
