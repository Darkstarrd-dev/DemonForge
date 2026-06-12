// mock 基建：模拟延迟与流式输出（一切 LLM 介入点共用）

export function mockDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface StreamHandle {
  promise: Promise<string>
  cancel: () => void
}

/**
 * 假流式：将 fullText 按 2–6 字符小块、每块 15–40ms 吐给 onChunk。
 * 返回完整文本的 promise 与取消句柄（取消后 promise resolve 已吐出部分）。
 */
export function mockStream(
  fullText: string,
  onChunk: (acc: string) => void,
  opts: { chunkMs?: number; chunkSize?: number } = {},
): StreamHandle {
  let cancelled = false
  const promise = new Promise<string>((resolve) => {
    let pos = 0
    let acc = ''
    const tick = () => {
      if (cancelled || pos >= fullText.length) {
        resolve(acc)
        return
      }
      const base = opts.chunkSize ?? 2
      const size = base + Math.floor((pos * 7) % 5)
      acc = fullText.slice(0, pos + size)
      pos += size
      onChunk(acc)
      setTimeout(tick, opts.chunkMs ?? 15 + ((pos * 13) % 25))
    }
    tick()
  })
  return { promise, cancel: () => (cancelled = true) }
}
