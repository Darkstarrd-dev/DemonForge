// startCleanQueue（M1 清理调度器）characterization 测试。
//
// 目的：黑盒锁定现状行为，作为 A-6「调度器类化」重构的安全网——重构前后必须全绿。
// 调度器是 350 行竞态敏感闭包，肉眼改易引入并发 bug，故先建测试网再动结构。
//
// 策略：
// - mock 全局 fetch 返回构造的 SSE 流（node 环境自带 fetch/Response/ReadableStream/TextEncoder）。
// - 以 onFinish resolve 的 promise 等待调度结束。
// - intervalSec:0 关闭节点级间隔，real timers 快速收敛。
// - 多节点/重试用聚合断言（每章 onDone 恰一次）规避 worker 并发时序的 flaky。
// - 失败注入按节点 baseURL：failingBaseURLs 中的节点返回 HTTP 500 → streamSingleChapter/
//   streamBatch 抛 connect 阶段 CleanError，executeBatch 据此 markNodeFail（连续 3 次熔断）。
//
// 注：单章请求 body.content 为原始章节正文（不含 CHAPTER_ID 头），批量请求经 buildBatchContent
//   注入 `===CHAPTER_ID:X===` 头 + CHAPTER_SEP。mock 据此区分两路并各自重建成功响应。
//   batchChars 无法强制单章路径（dequeueBatch 首章无条件取出 → 第二次调用总会再抓一章），
//   故 mock 必须同时覆盖单/批两路。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startCleanQueue } from './cleanScheduler'
import type { CleanNode, CleanQueueCallbacks } from './llm'

const SEP = '<<<|||CHAPTER_SEP|||>>>'

/** 每个用例的失败节点集合（beforeEach 重置） */
let failingBaseURLs: Set<string>

/** 某章节的清理产出（>=10 字符以满足 streamBatch.finalizeBatch 的长度校验） */
const cleaned = (id: string) => `cleaned-content-${id}`

/** SSE 帧编码 */
function frame(e: { event: string; data: unknown }): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`
}

/** 从批量请求 content 解析章节 id（单章请求无 CHAPTER_ID 头 → 返回 null）
 *  注：buildBatchContent 的指令文案里字面含示例 `"===CHAPTER_ID:X==="`（被引号前导），
 *  真实章节头则总在行首（`\n` 前导）。故只匹配 `\n` 前导者，排除指令示例的 'X'。 */
function parseBatchIds(content: string): string[] | null {
  const matches = [...content.matchAll(/(?:^|\n)===CHAPTER_ID:([^=]+)===/g)]
  if (matches.length === 0) return null
  return matches.map((m) => m[1].trim())
}

/** 成功响应的 SSE 事件（批量按 SEP 拼接重建；单章取 content 的 id 前缀） */
function buildSuccessEvents(content: string): { event: string; data: unknown }[] {
  const ids = parseBatchIds(content)
  if (ids) {
    // 位置对齐 finalizeBatch 的 parts[i]
    const text = ids.map((id) => `===CHAPTER_ID:${id}===\n${cleaned(id)}`).join(`\n\n${SEP}\n\n`)
    return [{ event: 'done', data: { text } }]
  }
  const id = content.split('::')[0]
  return [{ event: 'done', data: { text: cleaned(id) } }]
}

/** 可选全局闸门：非 null 时成功响应在 gate resolve 后才发 done，
 *  用于让 batch 停在途以测 pause/stop（beforeEach 重置为 null） */
let gate: Promise<void> | null = null
function makeGate() {
  let release: () => void = () => {}
  const g = new Promise<void>((r) => {
    release = r
  })
  return { gate: g, release }
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

/** mock fetch：失败节点→HTTP 500；否则构造成功 SSE 流（受 gate 延迟 / abort 中断控制） */
function mockFetch(_url: unknown, opts: { body: string; signal?: AbortSignal }): Promise<Response> {
  const body = JSON.parse(opts.body) as { baseURL: string; content: string }
  if (failingBaseURLs.has(body.baseURL)) {
    return Promise.resolve(new Response('injected failure', { status: 500 }))
  }
  const events = buildSuccessEvents(body.content)
  const signal = opts.signal
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false
      const fail = () => {
        if (settled) return
        settled = true
        controller.error(abortError())
      }
      const emit = () => {
        if (settled) return
        settled = true
        for (const e of events) controller.enqueue(enc.encode(frame(e)))
        controller.close()
      }
      if (signal?.aborted) return fail()
      signal?.addEventListener('abort', fail, { once: true })
      if (gate) void gate.then(emit)
      else emit()
    },
  })
  return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
}

function makeChapters(n: number): { id: string; content: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `c${i}`
    return { id, content: `${id}::${'x'.repeat(40)}` }
  })
}

function makeNode(over: Partial<CleanNode> & { id: string; baseURL: string }): CleanNode {
  return {
    name: over.id,
    apiKey: 'k',
    model: 'm',
    maxConcurrency: 1,
    batchChars: 80,
    intervalSec: 0,
    ...over,
  }
}

/** 回调收集器 + 一个在 onFinish 时 resolve 的 promise */
function makeCallbacks() {
  let resolveFinish: () => void = () => {}
  const finished = new Promise<void>((r) => {
    resolveFinish = r
  })
  const doneIds: string[] = []
  const errorIds: string[] = []
  const disabledNodeIds: string[] = []
  const cb: CleanQueueCallbacks = {
    onStart: vi.fn(),
    onChunk: vi.fn(),
    onDone: vi.fn((id: string) => {
      doneIds.push(id)
    }),
    onError: vi.fn((id: string) => {
      errorIds.push(id)
    }),
    onFinish: vi.fn(() => {
      resolveFinish()
    }),
    onNodeDisabled: vi.fn((id: string) => {
      disabledNodeIds.push(id)
    }),
  }
  return { cb, finished, doneIds, errorIds, disabledNodeIds }
}

beforeEach(() => {
  failingBaseURLs = new Set()
  gate = null
  vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('startCleanQueue · characterization', () => {
  it('① 单节点串行：全部章节恰好各 onDone 一次', async () => {
    const chapters = makeChapters(3)
    const nodes = [makeNode({ id: 'A', baseURL: 'http://good' })]
    const { cb, finished, doneIds, errorIds } = makeCallbacks()

    startCleanQueue(chapters, nodes, cb)
    await finished

    expect([...doneIds].sort()).toEqual(['c0', 'c1', 'c2'])
    expect(errorIds).toEqual([])
    chapters.forEach((c) => expect(cb.onDone).toHaveBeenCalledWith(c.id, cleaned(c.id)))
    expect(cb.onFinish).toHaveBeenCalledTimes(1)
  })

  it('② 多节点并发：6 章在 3 节点间分配，全部各 onDone 一次', async () => {
    const chapters = makeChapters(6)
    const nodes = [
      makeNode({ id: 'A', baseURL: 'http://a' }),
      makeNode({ id: 'B', baseURL: 'http://b' }),
      makeNode({ id: 'C', baseURL: 'http://c' }),
    ]
    const { cb, finished, doneIds, errorIds } = makeCallbacks()

    startCleanQueue(chapters, nodes, cb)
    await finished

    expect([...doneIds].sort()).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'])
    expect(errorIds).toEqual([])
    expect(cb.onFinish).toHaveBeenCalledTimes(1)
  })

  it('③ 节点失败 + autoRetry：失败章回流由健康节点接管，最终全部 onDone', async () => {
    const chapters = makeChapters(4)
    const nodes = [
      makeNode({ id: 'GOOD', baseURL: 'http://good' }),
      makeNode({ id: 'FAIL', baseURL: 'http://fail' }),
    ]
    failingBaseURLs.add('http://fail')
    const { cb, finished, doneIds, errorIds } = makeCallbacks()

    startCleanQueue(chapters, nodes, cb, { autoRetry: true })
    await finished

    // 健康节点始终可用 → 每章最终成功，无终态失败（不断言"在哪个节点重试"，因重试回共享队列）
    expect([...new Set(doneIds)].sort()).toEqual(['c0', 'c1', 'c2', 'c3'])
    expect(errorIds).toEqual([])
    expect(cb.onFinish).toHaveBeenCalledTimes(1)
  })

  it('④ 连续失败触发熔断：onNodeDisabled + 章节终态失败', async () => {
    const chapters = makeChapters(1)
    const nodes = [makeNode({ id: 'BAD', baseURL: 'http://fail' })]
    failingBaseURLs.add('http://fail')
    const { cb, finished, doneIds, errorIds, disabledNodeIds } = makeCallbacks()

    startCleanQueue(chapters, nodes, cb, { autoRetry: false })
    await finished

    expect(cb.onNodeDisabled).toHaveBeenCalledTimes(1)
    expect(disabledNodeIds).toEqual(['BAD'])
    expect(doneIds).toEqual([])
    expect(errorIds).toEqual(['c0'])
    expect(cb.onFinish).toHaveBeenCalledTimes(1)
  })

  it('⑤ pause 期间不启动新 batch，resume 后跑完', async () => {
    const chapters = makeChapters(3)
    const nodes = [makeNode({ id: 'A', baseURL: 'http://a' })]
    const { cb, finished, doneIds } = makeCallbacks()
    const g = makeGate()
    gate = g.gate // 首个 batch 停在途

    const handle = startCleanQueue(chapters, nodes, cb)
    handle.pause()
    gate = null // 之后的请求立即放行
    g.release() // 放行首个在途 batch → 其章节完成
    await delay(250)

    // pause 中：首个 batch 已完成，但 worker 不应再启动后续 batch
    expect(doneIds.length).toBeLessThan(3)
    expect(cb.onFinish).not.toHaveBeenCalled()

    handle.resume()
    await finished
    expect([...new Set(doneIds)].sort()).toEqual(['c0', 'c1', 'c2'])
    expect(cb.onFinish).toHaveBeenCalledTimes(1)
  })

  it('⑥ stop：中止在途 batch + 清空队列，剩余章节不再处理且收口', async () => {
    const chapters = makeChapters(3)
    const nodes = [makeNode({ id: 'A', baseURL: 'http://a' })]
    const { cb, finished, doneIds } = makeCallbacks()
    const g = makeGate()
    gate = g.gate // 所有请求挂起（不放行）

    const handle = startCleanQueue(chapters, nodes, cb)
    await delay(50) // 确保首个 batch 已在途
    handle.stop()
    await finished

    expect(doneIds).toEqual([]) // 在途 batch 被 abort，无完成
    expect(cb.onFinish).toHaveBeenCalledTimes(1)
    g.release() // 清理（已 abort，无副作用）
  })

  it('⑦ updateNodes 热增并发：动态 spawn worker 后全部完成', async () => {
    const chapters = makeChapters(6)
    const nodes = [makeNode({ id: 'A', baseURL: 'http://a', maxConcurrency: 1 })]
    const { cb, finished, doneIds } = makeCallbacks()

    const handle = startCleanQueue(chapters, nodes, cb)
    // 立即把并发 1→3：热增 2 个 slot → 动态 spawn 新 worker
    handle.updateNodes([makeNode({ id: 'A', baseURL: 'http://a', maxConcurrency: 3 })])
    await finished

    expect([...new Set(doneIds)].sort()).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'])
    expect(cb.onFinish).toHaveBeenCalledTimes(1)
  })
})
