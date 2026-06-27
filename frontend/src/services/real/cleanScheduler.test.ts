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
import { startCleanQueue, type CleanNode, type CleanQueueCallbacks } from './llm'

const SEP = '<<<|||CHAPTER_SEP|||>>>'

/** 每个用例的失败节点集合（beforeEach 重置） */
let failingBaseURLs: Set<string>

/** 某章节的清理产出（>=10 字符以满足 streamBatch.finalizeBatch 的长度校验） */
const cleaned = (id: string) => `cleaned-content-${id}`

/** 构造 SSE Response：把 events 依次编码为标准帧后关闭流 */
function sseResponse(events: { event: string; data: unknown }[], status = 200): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) {
        controller.enqueue(enc.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

/** 从批量请求 content 解析章节 id（单章请求无 CHAPTER_ID 头 → 返回 null）
 *  注：buildBatchContent 的指令文案里字面含示例 `"===CHAPTER_ID:X==="`（被引号前导），
 *  真实章节头则总在行首（`\n` 前导）。故只匹配 `\n` 前导者，排除指令示例的 'X'。 */
function parseBatchIds(content: string): string[] | null {
  const matches = [...content.matchAll(/(?:^|\n)===CHAPTER_ID:([^=]+)===/g)]
  if (matches.length === 0) return null
  return matches.map((m) => m[1].trim())
}

/** mock fetch：依据请求体 baseURL/content 构造成功或失败响应 */
function mockFetch(_url: unknown, opts: { body: string }): Promise<Response> {
  const body = JSON.parse(opts.body) as { baseURL: string; content: string }
  if (failingBaseURLs.has(body.baseURL)) {
    return Promise.resolve(new Response('injected failure', { status: 500 }))
  }
  const ids = parseBatchIds(body.content)
  if (ids) {
    // 批量：按 header 顺序重建 SEP 拼接的清理结果（位置对齐 finalizeBatch 的 parts[i]）
    const text = ids.map((id) => `===CHAPTER_ID:${id}===\n${cleaned(id)}`).join(`\n\n${SEP}\n\n`)
    return Promise.resolve(sseResponse([{ event: 'done', data: { text } }]))
  }
  // 单章：content 形如 `${id}::<text>`，取 id 前缀作为清理键
  const id = body.content.split('::')[0]
  return Promise.resolve(sseResponse([{ event: 'done', data: { text: cleaned(id) } }]))
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
})
