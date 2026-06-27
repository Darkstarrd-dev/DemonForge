import { describe, it, expect } from 'vitest'
import { stripChapterMarker, applyTitleTemplate, retentionRate } from './split'

describe('stripChapterMarker', () => {
  it('剥除常见章号标记，返回纯章名', () => {
    expect(stripChapterMarker('第3章 接受现实')).toBe('接受现实')
    expect(stripChapterMarker('001：开端')).toBe('开端')
    expect(stripChapterMarker('3、旧案重提')).toBe('旧案重提')
  })
  it('无标记时返回原标题', () => {
    expect(stripChapterMarker('楔子')).toBe('楔子')
  })
  it('空串安全', () => {
    expect(stripChapterMarker('')).toBe('')
  })
})

describe('retentionRate', () => {
  it('忽略空白后按字符数计算保留率', () => {
    expect(retentionRate('a b c', 'abc')).toBe(1)
    expect(retentionRate('abcde', 'ab')).toBe(0.4)
  })
  it('清理前为空时返回 1（避免除零）', () => {
    expect(retentionRate('   ', 'x')).toBe(1)
  })
})

describe('applyTitleTemplate', () => {
  it('按模板编号，{0n} 自动补零（最少 2 位）', () => {
    const input = [{ title: '第一章 起' }, { title: '第二章 承' }, { title: '第三章 转' }]
    const out = applyTitleTemplate(input, '第{0n}章 {title}')
    expect(out.map((c) => c.title)).toEqual(['第01章 起', '第02章 承', '第03章 转'])
  })
  it('卷章跳过编号与替换，正文从 1 起编', () => {
    const input = [
      { title: '第一卷 风起', isVolume: true },
      { title: '第1章 开端' },
    ]
    const out = applyTitleTemplate(input, '第{0n}章 {title}')
    expect(out[0].title).toBe('第一卷 风起') // 卷章原样
    expect(out[1].title).toBe('第01章 开端')
  })
  it('空模板时原样返回', () => {
    const input = [{ title: '第1章 开端' }]
    expect(applyTitleTemplate(input, '')).toEqual(input)
  })
})
