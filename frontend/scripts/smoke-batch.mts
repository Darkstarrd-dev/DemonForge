// 批处理调度回归测试：node --experimental-strip-types 运行。
// 守护 "100 章发了 100 次请求" 的回归——当 batchSize>1 时，应合并为 ⌈章数/batchSize⌉ 个请求。
//
// 策略：桩 globalThis.fetch，返回 SSE 流（done 事件带按 ===CHAPTER_ID=== 头拆分的清理文本），
// 计数实际发起的 /api/llm/clean 请求数，并与理论 batch 数对比。

import { startCleanQueue, CHAPTER_SEP, type CleanNode, type CleanQueueCallbacks } from '../src/services/real/llm.ts'

let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failed++
}

/** 构造一个 mock node：只读 batchSize/maxConcurrency/intervalSec */
const mkNode = (id: string, batchSize: number, maxConcurrency = 1, intervalSec = 0): CleanNode => ({
  id,
  name: id,
  baseURL: 'http://stub',
  apiKey: 'k',
  model: 'stub-model',
  maxConcurrency,
  batchSize,
  intervalSec,
})

/** 桩 fetch：根据请求体解析出本次打包的真实章节 id（跳过指令里的示例 ===CHAPTER_ID:X===），
 *  为每章产出足够长的清理文本，用 CHAPTER_SEP 分隔。返回 request 计数与章节产出顺序。
 *
 *  注意：buildBatchContent 的指令前缀含字面量 ===CHAPTER_ID:X=== 作为示例，必须排除，
 *  否则会被误当成一章产出（曾导致测试误报 done 多出一章）。 */
function stubFetch(expectedIds: Set<string>) {
  let requestCount = 0
  const seenChapters: string[] = []
  const enc = new TextEncoder()
  globalThis.fetch = async (_url: string, init: RequestInit) => {
    requestCount++
    const body = JSON.parse(String(init.body))
    // 仅取真实章节 id（在预期集合里的），排除指令示例 X
    const ids = [...String(body.content).matchAll(/===CHAPTER_ID:([^=]+)===/g)]
      .map((m) => m[1])
      .filter((id) => expectedIds.has(id))
    ids.forEach((id) => seenChapters.push(id))
    // 构造每章足够长的输出，用 CHAPTER_SEP 分隔
    const out = ids.map((id) => `===CHAPTER_ID:${id}===\n这是节点为章节 ${id} 产出的清理正文，长度足够超过十个字符以通过过短校验。`).join(`\n\n${CHAPTER_SEP}\n\n`)
    const chunks = [
      enc.encode(`event: delta\ndata: ${JSON.stringify({ delta: out })}\n\n`),
      enc.encode(`event: done\ndata: ${JSON.stringify({ text: out })}\n\n`),
    ]
    const stream = new ReadableStream({
      start(controller) {
        chunks.forEach((c) => controller.enqueue(c))
        controller.close()
      },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  return {
    getCount: () => requestCount,
    reset: () => { requestCount = 0; seenChapters.length = 0 },
    seen: () => [...seenChapters],
  }
}

/** 跑一次队列并等待结束 */
function runQueue(
  chapters: { id: string; content: string }[],
  nodes: CleanNode[],
  opts: { systemPrompt?: string; onNodeDisabled?: (nodeId: string, nodeName: string, reason: string) => void } = {},
): Promise<{ done: string[]; errored: string[] }> {
  return new Promise((resolve) => {
    const done: string[] = []
    const errored: string[] = []
    const cb: CleanQueueCallbacks = {
      onStart: () => {},
      onChunk: () => {},
      onDone: (id) => done.push(id),
      onError: (id) => errored.push(id),
      onFinish: () => resolve({ done, errored }),
      onDebug: () => {},
      onNodeDisabled: opts.onNodeDisabled,
    }
    startCleanQueue(chapters, nodes, cb, { systemPrompt: opts.systemPrompt })
  })
}

const mkChapters = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, content: `章节 ${i + 1} 的正文内容，足够描述一段剧情。` }))

// ── 场景 1：100 章 / 1 节点 batchSize=20 → 应 5 个请求（而非 100） ──
{
  const chapters = mkChapters(100)
  const stub = stubFetch(new Set(chapters.map((c) => c.id)))
  const { done, errored } = await runQueue(chapters, [mkNode('A', 20)])
  check('batchSize=20：100 章发出 5 个请求（非 100）', stub.getCount() === 5, `实际 ${stub.getCount()}`)
  check('batchSize=20：100 章全部完成', done.length === 100, `完成 ${done.length}，错误 ${errored.length}`)
  check('batchSize=20：无错误章节', errored.length === 0, `错误 ${errored.length}`)
}

// ── 场景 2：10 节点各 batchSize=20 / 100 章 → 仍应 5 个请求（跨节点共享队列） ──
{
  const chapters = mkChapters(100)
  const stub = stubFetch(new Set(chapters.map((c) => c.id)))
  const nodes = Array.from({ length: 10 }, (_, i) => mkNode(`N${i + 1}`, 20))
  const { done, errored } = await runQueue(chapters, nodes)
  check('10 节点×batchSize=20：100 章共 5 个请求', stub.getCount() === 5, `实际 ${stub.getCount()}`)
  check('10 节点：100 章全部完成', done.length === 100, `完成 ${done.length}，错误 ${errored.length}`)
}

// ── 场景 3：batchSize=1（默认/单章）→ 每章一个请求 ──
{
  const chapters = mkChapters(7)
  const stub = stubFetch(new Set(chapters.map((c) => c.id)))
  const { done } = await runQueue(chapters, [mkNode('A', 1)])
  check('batchSize=1：7 章 = 7 个请求', stub.getCount() === 7, `实际 ${stub.getCount()}`)
  check('batchSize=1：7 章全部完成', done.length === 7)
}

// ── 场景 4：章数不能整除 batchSize（13 章 / batchSize=5 → ⌈13/5⌉=3 个请求） ──
{
  const chapters = mkChapters(13)
  const stub = stubFetch(new Set(chapters.map((c) => c.id)))
  const { done } = await runQueue(chapters, [mkNode('A', 5)])
  check('batchSize=5 / 13 章 → 3 个请求（10+3）', stub.getCount() === 3, `实际 ${stub.getCount()}`)
  check('batchSize=5 / 13 章全部完成', done.length === 13)
}

// ── 场景 5：节点熔断——某节点连续 3 次 502 后自动关闭，其章节由健康节点接管 ──
// 模拟：坏节点（badBaseURL）恒返 502；好节点正常。熔断后坏节点不再被分配，全部章由好节点完成。
{
  const chapters = mkChapters(10)
  const expectedIds = new Set(chapters.map((c) => c.id))
  const goodBase = 'http://good'
  const badBase = 'http://bad-502'
  let badReqs = 0
  let goodReqs = 0
  const enc = new TextEncoder()
  globalThis.fetch = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (body.baseURL === badBase) {
      badReqs++
      return new Response('Bad Gateway', { status: 502 })
    }
    goodReqs++
    const ids = [...String(body.content).matchAll(/===CHAPTER_ID:([^=]+)===/g)].map((m) => m[1]).filter((id) => expectedIds.has(id))
    const out = ids.map((id) => `===CHAPTER_ID:${id}===\n这是好节点为章节 ${id} 产出的清理正文，足够超过十个字符。`).join(`\n\n${CHAPTER_SEP}\n\n`)
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(`event: delta\ndata: ${JSON.stringify({ delta: out })}\n\n`))
        c.enqueue(enc.encode(`event: done\ndata: ${JSON.stringify({ text: out })}\n\n`))
        c.close()
      },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const badNode: CleanNode = { id: 'BAD', name: '坏节点', baseURL: badBase, apiKey: 'k', model: 'm', maxConcurrency: 1, batchSize: 1, intervalSec: 0 }
  const goodNode: CleanNode = { id: 'GOOD', name: '好节点', baseURL: goodBase, apiKey: 'k', model: 'm', maxConcurrency: 1, batchSize: 1, intervalSec: 0 }
  let disabledNodeId: string | null = null
  const { done, errored } = await runQueue(chapters, [badNode, goodNode], {
    onNodeDisabled: (nid) => { disabledNodeId = nid },
  })
  check('熔断：坏节点被 onNodeDisabled 通知', disabledNodeId === 'BAD', `实际 ${disabledNodeId}`)
  check('熔断：坏节点连续 502 恰好 3 次后停止分配', badReqs === 3, `坏节点请求数 ${badReqs}（应=3）`)
  check('熔断：全部 10 章最终由好节点完成', done.length === 10, `完成 ${done.length}，失败 ${errored.length}`)
  check('熔断：好节点接管所有成功请求', goodReqs >= 10, `好节点请求数 ${goodReqs}`)
}

// ── 场景 6：单坏节点（无健康节点兜底）→ 熔断后章节判失败（重试耗尽），不死循环 ──
{
  const chapters = mkChapters(4)
  globalThis.fetch = async () => new Response('Bad Gateway', { status: 502 })
  let disabledNodeId: string | null = null
  const { done, errored } = await runQueue(chapters, [mkNode('SOLO', 1)], {
    onNodeDisabled: (nid) => { disabledNodeId = nid },
  })
  check('单坏节点：3 次 502 后熔断', disabledNodeId === 'SOLO', `实际 ${disabledNodeId}`)
  check('单坏节点：无完成章节', done.length === 0, `意外完成 ${done.length}`)
  check('单坏节点：所有章节最终判失败（不死循环）', errored.length === 4, `失败 ${errored.length}`)
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
