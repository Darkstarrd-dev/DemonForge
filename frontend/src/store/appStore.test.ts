// appStore slice 组合后的结构契约测试（A-7 阶段2 安全网）。
// 验证：6 slice 的字段/action 全部可见 + 向后兼容 getter 别名（imageGallery 等）映射正确。
// getter 别名是 slice 化最易破的点——对象 spread 会求值 getter，故必须放最外层 create（非 slice 内）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('appStore · slice 组合完整性', () => {
  it('6 slice 的关键字段与 action 全部可见', async () => {
    const { useAppStore } = await import('./appStore')
    const s = useAppStore.getState()
    // 各域字段
    expect(Array.isArray(s.books)).toBe(true) // booksSlice
    expect(Array.isArray(s.testHistory)).toBe(true) // nodeTestSlice
    expect(typeof s.m1TitleTemplate).toBe('string') // m1ImportSlice
    expect(s.roleChatActiveSessionId).toBe('main') // roleChatSlice
    expect(Array.isArray(s.providers)).toBe(true) // providerSlice
    expect(s.theme).toBe('light') // uiPrefsSlice
    // 各域 action
    for (const fn of ['deleteBook', 'addTestHistory', 'setCleanRun', 'consumeProviderUsage', 'saveSystemPromptPreset', 'resetDemo', 'setState'] as const) {
      expect(typeof s[fn]).toBe('function')
    }
  })

  it('向后兼容 getter 别名映射到对应真实字段（初始 state）', async () => {
    const { useAppStore } = await import('./appStore')
    const s = useAppStore.getState()
    // 初始 state 上别名为 accessor，求值即得对应真实字段的同一引用。
    // 注：zustand setState 内部 Object.assign 会求值 getter 使其固化为快照——此为
    // 原最外层 getter 的固有行为（slice 化前后一致），故此处只验初始映射契约。
    expect(s.imageGallery).toBe(s.testHistory)
    expect(s.imageDemoGlobalForm).toBe(s.nodeTestGlobalForm)
    expect(s.imageDemoFormPerNode).toBe(s.nodeTestFormPerNode)
  })
})
