import { describe, it, expect } from 'vitest'
import { ruleClean } from './ruleClean'

describe('ruleClean — 不可见字符', () => {
  it('剥离零宽/控制符并记入 deletions', () => {
    const r = ruleClean('Hello​World')
    expect(r.cleaned).toBe('HelloWorld')
    expect(r.deletions.some((d) => d.reason === 'invisible')).toBe(true)
  })
})

describe('ruleClean — 空行折叠', () => {
  it('默认折叠 3+ 连续空行为单个空行', () => {
    expect(ruleClean('a\n\n\n\nb').cleaned).toBe('a\n\nb')
  })
  it('collapseBlankLines=false 时保留原空行', () => {
    expect(ruleClean('a\n\n\n\nb', { collapseBlankLines: false }).cleaned).toBe('a\n\n\n\nb')
  })
})

describe('ruleClean — 正常正文', () => {
  it('无广告特征的正文整行保留', () => {
    const r = ruleClean('门外传来一阵急促的脚步声。')
    expect(r.cleaned).toContain('门外传来一阵急促的脚步声')
  })
})
