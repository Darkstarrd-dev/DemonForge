import { describe, it, expect } from 'vitest'
import { localDateKey } from './date'

describe('localDateKey', () => {
  it('格式化为本地 YYYY-MM-DD，月/日补零', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(localDateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('用本地自然日，不受 UTC 偏移影响（回归：额度凌晨不重置 bug）', () => {
    // 本地凌晨时段：旧实现 new Date().toISOString().slice(0,10) 在 UTC+ 时区会回退到前一天，
    // localDateKey 始终取本地日期。构造与读取都用本地时区 → 断言与运行环境时区无关。
    expect(localDateKey(new Date(2026, 0, 5, 1, 30))).toBe('2026-01-05')
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
