import { describe, it, expect } from 'vitest'
import { parseSSE, type SseEvent } from './sse'

/** 把字符串数组转成 ReadableStream，每个元素模拟一个网络分片。 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]))
      else controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
  const out: SseEvent[] = []
  for await (const e of parseSSE(stream)) out.push(e)
  return out
}

describe('parseSSE', () => {
  it('解析标准 event+data 帧', async () => {
    const evts = await collect(streamOf(['event: delta\ndata: {"delta":"hi"}\n\n']))
    expect(evts).toEqual([{ event: 'delta', data: { delta: 'hi' } }])
  })

  it('跨网络分片重组被拆开的帧', async () => {
    const evts = await collect(
      streamOf(['event: delta\ndata: {"de', 'lta":"hi"}\n\nevent: done\ndata: {"text":"hi"}\n\n']),
    )
    expect(evts.map((e) => e.event)).toEqual(['delta', 'done'])
    expect((evts[1].data as { text: string }).text).toBe('hi')
  })

  it('event 缺省为 message', async () => {
    const evts = await collect(streamOf(['data: {"x":1}\n\n']))
    expect(evts[0].event).toBe('message')
  })

  it('坏 JSON 兜底为原始字符串，不中断后续帧', async () => {
    const evts = await collect(streamOf(['event: a\ndata: not-json\n\nevent: b\ndata: {"ok":true}\n\n']))
    expect(evts[0].data).toBe('not-json')
    expect((evts[1].data as { ok: boolean }).ok).toBe(true)
  })

  it('忽略空帧与注释行', async () => {
    const evts = await collect(streamOf([': comment\n\nevent: delta\ndata: {"d":1}\n\n']))
    expect(evts).toHaveLength(1)
    expect(evts[0].event).toBe('delta')
  })

  it('流结束无尾部空行时仍输出最后一帧', async () => {
    const evts = await collect(streamOf(['event: done\ndata: {"text":"end"}']))
    expect(evts).toEqual([{ event: 'done', data: { text: 'end' } }])
  })

  it('多行 data 按 \\n 拼接', async () => {
    const evts = await collect(streamOf(['data: line1\ndata: line2\n\n']))
    expect(evts[0].data).toBe('line1\nline2')
  })
})
