// 统一 SSE 解析层 —— 把"字节流 → 结构化事件"的样板从 9 个 real/*.ts 收敛到一处。
// 后端统一经 hijackSSE 发送：`event: <type>\ndata: <json>\n\n`（见 server/src/utils/sseHelper.ts）。
// parseSSE 按标准帧（\n\n）切分，帧内多 data: 行按 \n 拼接，event 缺省 'message'，
// JSON 解析失败兜底为原始字符串——不让坏帧炸断整个流。
//
// 设计边界：parseSSE 只负责"传输层"（字节 → {event,data}），不含任何业务语义。
// 各服务的 event 类型分发（delta/done/error/reasoning-delta/raw…）、中止信号（fetch 的
// AbortSignal）、res.ok 检查都留在调用方。

export interface SseEvent {
  /** SSE event 字段，缺省 'message' */
  event: string
  /** data 字段：能 JSON.parse 则为解析后对象，否则为原始字符串 */
  data: unknown
}

/** 把单个 SSE 帧（不含尾部 \n\n）解析为 {event,data}；无 data 行返回 null。 */
function parseFrame(frame: string): SseEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    // 其余行（注释 ':'、id:、retry: 等）忽略
  }
  if (dataLines.length === 0) return null
  const raw = dataLines.join('\n')
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    data = raw // 非 JSON：原样透传，由调用方决定如何处理
  }
  return { event, data }
}

/**
 * 消费 SSE 响应体，逐帧 yield 结构化事件。
 *
 * 中止：调用方在 fetch 时绑定 AbortSignal 即可——abort 时底层流报错，reader.read 抛错，
 * 经 finally 释放锁后冒泡给调用方的 for-await（调用方按需 try/catch）。
 *
 * @param body fetch 响应的 res.body（ReadableStream）
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += value ? decoder.decode(value, { stream: !done }) : ''
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? '' // 最后一截可能不完整，留到下次拼接
      for (const f of frames) {
        if (!f.trim()) continue
        const evt = parseFrame(f)
        if (evt) yield evt
      }
      if (done) break
    }
    // 流结束后若无尾部空行，buffer 里可能还压着最后一帧
    if (buffer.trim()) {
      const evt = parseFrame(buffer)
      if (evt) yield evt
    }
  } finally {
    reader.releaseLock()
  }
}
