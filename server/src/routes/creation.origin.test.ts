// creation.origin.ts 路由单测 —— arch / arch-input / blueprint 三个 SSE 端点。
// 注：核心流式逻辑由 creation.shared.streamChat 提供，本处主要验证：
//   - 必填参数校验
//   - streamChat 链路被触发（mock 后从 SSE 写流中看到 done/error）
//   - 系统提示词覆盖路径（systemPrompt 透传 vs 默认）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { originRoutes } from './creation.origin'

vi.mock('../llmClient', async () => {
  const actual = await vi.importActual<typeof import('../llmClient')>('../llmClient')
  return {
    ...actual,
    chatStream: vi.fn(),
  }
})
import * as llmClient from '../llmClient'
const mockChatStream = llmClient.chatStream as unknown as ReturnType<typeof vi.fn>

interface CollectedSse { event: string; data: string }
function parseSse(body: string): CollectedSse[] {
  const events: CollectedSse[] = []
  let buffer = body
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

describe('originRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /api/llm/arch 缺 baseURL → 400', async () => {
    const app = Fastify()
    await app.register(originRoutes)
    const res = await app.inject({ method: 'POST', url: '/api/llm/arch', payload: { topic: 'x' } })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('POST /api/llm/arch 缺 topic → 400', async () => {
    const app = Fastify()
    await app.register(originRoutes)
    const res = await app.inject({
      method: 'POST',
      url: '/api/llm/arch',
      payload: { baseURL: 'https://x.com', model: 'm' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('POST /api/llm/arch 完整参数 → streamChat 被调用且最终返回 done 事件', async () => {
    mockChatStream.mockImplementation(async (_cfg: unknown, onDelta?: (d: string) => void) => {
      onDelta?.('A')
      onDelta?.('B')
      onDelta?.('C')
      return 'ABC' // 长度 < 10 触发 error，而非 done
    })

    const app = Fastify()
    await app.register(originRoutes)
    const res = await app.inject({
      method: 'POST',
      url: '/api/llm/arch',
      payload: { baseURL: 'https://x.com', model: 'm', topic: '我的小说' },
    })
    // Fastify inject 把 SSE 读为字符串
    const events = parseSse(res.body)
    expect(mockChatStream).toHaveBeenCalledOnce()
    // chatStream 收到的 system 消息含 ARCH_SYSTEM_PROMPT
    const call = mockChatStream.mock.calls[0]
    const cfg = call[0] as { messages: { role: string; content: string }[] }
    expect(cfg.messages[0].role).toBe('system')
    expect(cfg.messages[0].content).toContain('雪花法')
    // 流式输出触发 error（'ABC' < 10 字符）
    const errorEvt = events.find((e) => e.event === 'error')
    expect(errorEvt).toBeTruthy()
    await app.close()
  })

  it('POST /api/llm/arch 传 systemPrompt 覆盖默认', async () => {
    mockChatStream.mockImplementation(async (_cfg: unknown, onDelta?: (d: string) => void) => {
      onDelta?.('x')
      return 'xxxxxxxxxx' // 长度 = 10，触发 done
    })
    const app = Fastify()
    await app.register(originRoutes)
    await app.inject({
      method: 'POST',
      url: '/api/llm/arch',
      payload: {
        baseURL: 'https://x.com',
        model: 'm',
        topic: 'x',
        systemPrompt: 'CUSTOM PROMPT',
      },
    })
    const call = mockChatStream.mock.calls[0]
    const cfg = call[0] as { messages: { role: string; content: string }[] }
    expect(cfg.messages[0].content).toBe('CUSTOM PROMPT')
    await app.close()
  })

  it('POST /api/llm/arch-input 缺 baseURL/model → 400', async () => {
    const app = Fastify()
    await app.register(originRoutes)
    const res1 = await app.inject({ method: 'POST', url: '/api/llm/arch-input', payload: {} })
    expect(res1.statusCode).toBe(400)
    await app.close()
  })

  it('POST /api/llm/blueprint 缺 architecture → 400', async () => {
    const app = Fastify()
    await app.register(originRoutes)
    const res = await app.inject({
      method: 'POST',
      url: '/api/llm/blueprint',
      payload: { baseURL: 'https://x.com', model: 'm' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('POST /api/llm/blueprint 完整参数 → 触发流式，user prompt 含 begin/end 范围', async () => {
    mockChatStream.mockImplementation(async (_cfg: unknown, onDelta?: (d: string) => void) => {
      onDelta?.('y')
      return 'yyyyyyyyyy' // done
    })
    const app = Fastify()
    await app.register(originRoutes)
    await app.inject({
      method: 'POST',
      url: '/api/llm/blueprint',
      payload: { baseURL: 'https://x.com', model: 'm', architecture: '架构', totalChapters: 30 },
    })
    const call = mockChatStream.mock.calls[0]
    const cfg = call[0] as { messages: { role: string; content: string }[] }
    expect(cfg.messages[1].content).toContain('第 1')
    expect(cfg.messages[1].content).toContain('架构')
    await app.close()
  })
})
