import { describe, it, expect } from 'vitest'
import { dequeueBatch } from './dequeue'

type Task = { id: string; content: string }
const t = (id: string, len: number): Task => ({ id, content: 'x'.repeat(len) })

describe('dequeueBatch', () => {
  it('空队列 → 返回 []，不改动队列', () => {
    const retry: Task[] = []
    const pending: Task[] = []
    expect(dequeueBatch(retry, pending, 100)).toEqual([])
    expect(retry).toEqual([])
    expect(pending).toEqual([])
  })

  it('首章无条件取出（即便单章字数超 maxChars）', () => {
    const pending = [t('a', 100)]
    const batch = dequeueBatch([], pending, 10)
    expect(batch.map((x) => x.id)).toEqual(['a'])
    expect(pending).toEqual([]) // 已被 shift 取出
  })

  it('重试队列优先于 pending，且保持顺序', () => {
    const retry = [t('r0', 5), t('r1', 5)]
    const pending = [t('p0', 5)]
    const batch = dequeueBatch(retry, pending, 1000)
    expect(batch.map((x) => x.id)).toEqual(['r0', 'r1', 'p0'])
    expect(retry).toEqual([])
    expect(pending).toEqual([])
  })

  it('按字数累积：达到 maxChars 后停止继续取（下一章会超界）', () => {
    const pending = [t('a', 30), t('b', 30), t('c', 30)]
    const batch = dequeueBatch([], pending, 70)
    // a(30)→acc30；b：30+30=60≤70 取→acc60；c：60+30=90>70 停
    expect(batch.map((x) => x.id)).toEqual(['a', 'b'])
    expect(pending.map((x) => x.id)).toEqual(['c'])
  })

  it('取出后累计 >= maxChars 立即停（首章已超阈值）', () => {
    const pending = [t('a', 60), t('b', 10)]
    const batch = dequeueBatch([], pending, 50)
    // a 无条件取→acc60，60>=50 立即停
    expect(batch.map((x) => x.id)).toEqual(['a'])
    expect(pending.map((x) => x.id)).toEqual(['b'])
  })

  it('跨队列边界：retry 取一章后，pending 首章超界则不取', () => {
    const retry = [t('r', 40)]
    const pending = [t('p', 40)]
    const batch = dequeueBatch(retry, pending, 50)
    // r 无条件取→acc40，40>=50 否，继续；pending p：40+40=80>50 停
    expect(batch.map((x) => x.id)).toEqual(['r'])
    expect(retry).toEqual([])
    expect(pending.map((x) => x.id)).toEqual(['p']) // p 未被取出
  })
})
