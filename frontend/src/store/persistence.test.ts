// appStore 持久化层 characterization 测试。
//
// 目的：黑盒锁定持久化引擎现状行为，作为 A-7「持久化抽离 + slice 切分」重构的安全网——
// 重构前后必须全绿。持久化是竞态/契约敏感逻辑（storeReady 时序、enqueueWrite 串行、
// 空库不回种、删光不复活、debounce），肉眼改易引入回归。
//
// 策略（复用 services/real/cleanScheduler.test.ts 的 mock fetch 范式）：
// - mock 全局 fetch（node 环境自带 fetch/Response/Blob）。
// - vi.resetModules() + 动态 import('./appStore') 隔离模块级单例（storeReady/timers/storeWriteChain）。
// - 仅通过公共导出（businessPayload/settingsPayload/pushStoreNow/pushDeleteNow/bootstrapStore）观测，
//   不触私有状态 → 重构把这些函数搬到 persistence.ts/bootstrap.ts 后，appStore 仍 re-export，
//   本测试 import 路径不变、无需改动即可复跑，证明行为一致。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Book } from '../services/types'

type Call = { url: string; method: string; body: unknown }

const jsonRes = (obj: unknown) =>
  new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } })

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 记录每次 fetch 的 url/method/body 到 calls；handler 可定制响应（返回 undefined 则默认空 JSON）。 */
function stubFetch(
  calls: Call[],
  handler?: (url: string, method: string, body: unknown) => Response | undefined,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, opts?: { method?: string; body?: unknown }) => {
      const u = String(url)
      const method = opts?.method ?? 'GET'
      calls.push({ url: u, method, body: opts?.body })
      return handler?.(u, method, opts?.body) ?? jsonRes({})
    }),
  )
}

const storePosts = (calls: Call[]) => calls.filter((c) => c.url.includes('/api/store') && c.method === 'POST')
const settingsPosts = (calls: Call[]) => calls.filter((c) => c.url.includes('/api/settings') && c.method === 'POST')
const parseBody = (b: unknown) => JSON.parse(String(b)) as Record<string, unknown>

beforeEach(() => {
  vi.resetModules() // 隔离 appStore 模块级单例
  vi.spyOn(console, 'log').mockImplementation(() => {}) // 静音 pushStore 体积日志
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('持久化 · payload 纯函数', () => {
  it('① businessPayload 含 12 键 / settingsPayload 含 21 键', async () => {
    const { businessPayload, settingsPayload, useAppStore } = await import('./appStore')
    const s = useAppStore.getState()
    expect(Object.keys(businessPayload(s)).sort()).toEqual([
      'architectures', 'books', 'cards', 'chapters', 'chatSessions', 'fragments',
      'issues', 'mergeCandidates', 'outline', 'scenes', 'stateEvents', 'testHistory',
    ])
    expect(Object.keys(settingsPayload(s)).sort()).toEqual([
      'assetDir', 'cleanNodeOverrides', 'currentBookId', 'enable4KScale', 'imageArchiveDir',
      'm1AutoRetry', 'm1SystemPrompt', 'm1TestText', 'm1TitleTemplate', 'moduleMapping',
      'nodeGroupExpanded', 'nodeTestFormPerNode', 'nodeTestGlobalForm', 'providers',
      'roleChatAutoConfig', 'scaleBaseWidth', 'showMenuBar', 'splitPatterns', 'systemPromptActiveId',
      'systemPromptPresets', 'theme',
    ])
  })
})

describe('持久化 · storeReady 门控', () => {
  it('② bootstrap 前 pushStoreNow 不发请求', async () => {
    const calls: Call[] = []
    stubFetch(calls)
    const { pushStoreNow } = await import('./appStore')
    await pushStoreNow()
    expect(calls).toHaveLength(0)
  })
})

describe('持久化 · bootstrapStore 引导', () => {
  it('③ 首次运行：空库 + 无 storeInitialized → 播种 POST + 标记 storeInitialized', async () => {
    const calls: Call[] = []
    stubFetch(calls, (url, method) => {
      if (url.includes('/api/settings') && method !== 'POST') return jsonRes({}) // 无 storeInitialized
      if (url.includes('/api/store') && method === 'GET') return jsonRes({}) // 空库
      return undefined
    })
    const { bootstrapStore } = await import('./appStore')
    await bootstrapStore()
    expect(storePosts(calls).length).toBeGreaterThanOrEqual(1) // 播种
    expect(settingsPosts(calls).some((c) => parseBody(c.body).storeInitialized === true)).toBe(true)
  })

  it('④ 删光不复活：空库 + storeInitialized → 内存清空、不回种', async () => {
    const calls: Call[] = []
    stubFetch(calls, (url, method) => {
      if (url.includes('/api/settings') && method !== 'POST') return jsonRes({ storeInitialized: true })
      if (url.includes('/api/store') && method === 'GET') return jsonRes({}) // 空库
      return undefined
    })
    const { bootstrapStore, useAppStore } = await import('./appStore')
    useAppStore.setState({ books: [{ id: 'ghost' }] as unknown as Book[] }) // 模拟内存残留
    await bootstrapStore()
    expect(useAppStore.getState().books).toEqual([]) // 被清空
    expect(storePosts(calls)).toHaveLength(0) // 不回种
  })

  it('⑤ 有数据：载入后端书 + 补 storeInitialized 标记', async () => {
    const calls: Call[] = []
    stubFetch(calls, (url, method) => {
      if (url.includes('/api/settings') && method !== 'POST') return jsonRes({}) // 无 storeInitialized
      if (url.includes('/api/store') && method === 'GET') return jsonRes({ books: [{ id: 'b1', type: 'project' }] })
      return undefined
    })
    const { bootstrapStore, useAppStore } = await import('./appStore')
    await bootstrapStore()
    expect(useAppStore.getState().books.map((b) => b.id)).toEqual(['b1'])
    expect(settingsPosts(calls).some((c) => parseBody(c.body).storeInitialized === true)).toBe(true)
  })
})

describe('持久化 · 写入串行与防抖', () => {
  it('⑥ enqueueWrite 串行：DELETE 在前序 POST 完成后才执行', async () => {
    // 先 bootstrap 让 storeReady=true（用普通 mock）
    const boot: Call[] = []
    stubFetch(boot)
    const { bootstrapStore, pushStoreNow, pushDeleteNow } = await import('./appStore')
    await bootstrapStore()

    // 换带门控的 fetch：第一个请求挂起，观测第二个是否串行等待
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((r) => { releaseFirst = r })
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, opts?: { method?: string }) => {
      const i = ++n
      const method = opts?.method ?? 'GET'
      if (i === 1) { order.push('first-start'); await firstGate; order.push('first-end') }
      else order.push(`call-${i}-${method}`)
      return jsonRes({})
    }))

    const p1 = pushStoreNow()
    pushDeleteNow({ books: ['x'] })
    await delay(30)
    expect(order).toEqual(['first-start']) // 第二个尚未执行（被串行队列阻塞）
    releaseFirst()
    await p1
    await delay(30)
    expect(order).toEqual(['first-start', 'first-end', 'call-2-DELETE'])
  })

  it('⑦ 业务变更 1s 防抖后 POST 恰一次', async () => {
    const calls: Call[] = []
    stubFetch(calls)
    const { bootstrapStore, useAppStore } = await import('./appStore')
    await bootstrapStore()

    vi.useFakeTimers()
    const before = storePosts(calls).length
    useAppStore.setState({ books: [{ id: 'new' }] as unknown as Book[] })
    expect(storePosts(calls).length).toBe(before) // 未到时间，未触发
    await vi.advanceTimersByTimeAsync(1000)
    expect(storePosts(calls).length).toBe(before + 1)
  })
})
