// creation.shared.ts 单元测试 —— stripJsonFence、collectText、streamChat
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PassThrough } from 'node:stream'
import { stripJsonFence, collectText, streamChat } from './creation.shared'

// 顶层 mock：通过 vi.mock 让 creation.shared 内部的 chatStream 引用被替换
vi.mock('../llmClient', async () => {
  const actual = await vi.importActual<typeof import('../llmClient')>('../llmClient')
  return {
    ...actual,
    chatStream: vi.fn(),
  }
})
import * as llmClient from '../llmClient'
const mockChatStream = llmClient.chatStream as unknown as ReturnType<typeof vi.fn>

// 自定义 raw 替身：直接收集所有 write 输出，无需 stream.end() 事件
function makeReply() {
  const writes: string[] = []
  const raw = {
    statusCode: 200,
    setHeader: () => {},
    writeHead: (code: number, headers?: Record<string, string>) => {
      ;(raw as unknown as { statusCode: number }).statusCode = code
      void headers
    },
    write: (chunk: string | Buffer) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'))
      return true
    },
    end: () => {
      ;(raw as unknown as { ended: boolean }).ended = true
    },
    on: () => {},
    once: () => {},
    emit: () => {},
  }
  ;(raw as unknown as { ended: boolean }).ended = false
  ;(raw as unknown as { writes: string[] }).writes = writes

  const reply = {
    hijack: () => {},
    raw: raw as unknown as PassThrough,
    request: { headers: {} as Record<string, string | undefined> },
  }
  return { reply: reply as unknown as import('fastify').FastifyReply, writes }
}

interface CollectedSse { event: string; data: string }
function parseSse(writes: string[]): CollectedSse[] {
  const events: CollectedSse[] = []
  const text = writes.join('')
  let buffer = text
  let idx: number
  while ((idx = buffer.indexOf('\n\n')) >= 0) {
    const block = buffer.slice(0, idx)
    buffer = buffer.slice(idx + 2)
    const lines = block.split('\n')
    let event = ''
    let data = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7).trim()
      else if (line.startsWith('data: ')) data = line.slice(6).trim()
    }
    if (event) events.push({ event, data })
  }
  return events
}

// ===== stripJsonFence =====

describe('stripJsonFence', () => {
  it('剥 ```json``` 围栏', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('剥 ``` 围栏（无语言标签）', () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('剥围栏（保留前/后空格）', () => {
    expect(stripJsonFence('   ```json\nfoo\n```  ')).toBe('foo')
  })
  it('无围栏直接 trim', () => {
    expect(stripJsonFence('  {"a":1}  ')).toBe('{"a":1}')
  })
  it('不以 ``` 开头时不动内容（仅 trim）', () => {
    expect(stripJsonFence('hello world')).toBe('hello world')
  })
})

// ===== collectText =====

describe('collectText', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('空字符串输出 → 仍然返回（不抛错）', async () => {
    mockChatStream.mockResolvedValue('')
    const out = await collectText(
      { baseURL: 'https://x.com', apiKey: 'k', model: 'm' },
      'sys',
      'user',
    )
    expect(out).toBe('')
  })

  it('长输出原样返回', async () => {
    const long = 'x'.repeat(5000)
    mockChatStream.mockResolvedValue(long)
    const out = await collectText(
      { baseURL: 'https://x.com', apiKey: 'k', model: 'm' },
      'sys',
      'user',
    )
    expect(out).toBe(long)
  })
})

// ===== streamChat =====

describe('streamChat', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('正常流式：发送多个 delta 事件 + done 事件 + raw.end()', async () => {
    mockChatStream.mockImplementation(async (_cfg: unknown, onDelta?: (d: string) => void) => {
      onDelta?.('Hello')
      onDelta?.(' ')
      onDelta?.('World')
      return 'Hello World'
    })

    const { reply, writes } = makeReply()
    await streamChat(reply, { baseURL: 'https://x.com', apiKey: 'k', model: 'm' }, [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
    ])
    const events = parseSse(writes)
    const deltas = events.filter((e) => e.event === 'delta').map((e) => JSON.parse(e.data).delta)
    expect(deltas.join('')).toBe('Hello World')
    const done = events.find((e) => e.event === 'done')
    expect(done).toBeTruthy()
    expect(JSON.parse(done!.data).text).toBe('Hello World')
  })

  it('输出过短（< 10 字符）→ 发 error 事件', async () => {
    mockChatStream.mockResolvedValue('短')

    const { reply, writes } = makeReply()
    await streamChat(reply, { baseURL: 'https://x.com', apiKey: 'k', model: 'm' }, [])
    const events = parseSse(writes)
    const error = events.find((e) => e.event === 'error')
    expect(error).toBeTruthy()
    expect(JSON.parse(error!.data).message).toContain('输出过短')
  })

  it('chatStream 抛错 → 发 error 事件（abort 不影响）', async () => {
    mockChatStream.mockRejectedValue(new Error('network fail'))

    const { reply, writes } = makeReply()
    // streamChat 不 await 内部 chain，需要让出微任务让 catch/finally 跑完
    await streamChat(reply, { baseURL: 'https://x.com', apiKey: 'k', model: 'm' }, [])
    // 等待至少两个微任务周期确保 chain 跑完
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    const events = parseSse(writes)
    const error = events.find((e) => e.event === 'error')
    expect(error).toBeTruthy()
    expect(JSON.parse(error!.data).message).toBe('network fail')
  })
})
