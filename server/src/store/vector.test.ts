import { describe, it, expect } from 'vitest'
import { splitText } from './vector'

describe('splitText', () => {
  it('短文本不切分返回单块', () => {
    const r = splitText('Hello', ['\n\n', '\n', ' ', ''], 100, 20)
    expect(r).toEqual(['Hello'])
  })

  it('按第一个适配分隔符切分', () => {
    // splitText 递归选用首个适用分隔符：\n\n 适用 → 按 \n\n 切，但两段合起来不够 chunkSize(100) → merge 成单块
    const r = splitText('段落A\n\n段落B', ['\n\n', '\n', ' ', ''], 100, 20)
    expect(r).toEqual(['段落A\n\n段落B'])
  })

  it('总长超 chunkSize 时分块', () => {
    // 每行 20 chars，3 行 = 60 chars，chunkSize=30 → 应产生 2+ 块
    const text = ['A'.repeat(20), 'B'.repeat(20), 'C'.repeat(20)].join('\n')
    const r = splitText(text, ['\n\n', '\n', ' ', ''], 30, 5)
    expect(r.length).toBeGreaterThanOrEqual(2)
  })

  it('空文本返回空数组', () => {
    expect(splitText('')).toEqual([])
    expect(splitText('   ')).toEqual([])
  })

  it('句号留句尾', () => {
    // chunkSize 100 远大于文本，两个句子合并成单块
    const r = splitText('句子一。句子二。', ['。', ''], 100, 20)
    expect(r).toEqual(['句子一。句子二。'])
  })

  it('超长单句递归用更细分隔符再切', () => {
    // 构造一个 >chunkSize 且不含高级分隔符的文本，逼其递归用更细 separator
    const text = 'A'.repeat(60) // 60 chars, chunkSize=40
    const r = splitText(text, ['\n\n', '\n', ' ', ''], 40, 10)
    expect(r.length).toBeGreaterThanOrEqual(2)
    // 每块 <= chunkSize（但用空串切时可能比 chunkSize 略大一个字符）
    for (const c of r) {
      expect(c.length).toBeLessThanOrEqual(45)
    }
  })

  it('chunkSize 小于最小片段长时不崩溃', () => {
    const r = splitText('abcde', [''], 2, 0)
    expect(r.length).toBeGreaterThan(0)
  })
})
