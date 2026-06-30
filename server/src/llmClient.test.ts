import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildRequestBody, listModels, embed, type ProviderConfig } from './llmClient'

// ===== 测试夹具 =====

const provider: ProviderConfig = { baseURL: 'https://api.example.com', apiKey: 'sk-test', model: 'test-model' }

function makeOkJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(''),
    json: () => Promise.resolve(body),
  } as Response
}

// ===== buildRequestBody =====

describe('buildRequestBody', () => {
  it('最小参数只含 model/messages/stream', () => {
    const body = buildRequestBody({ ...provider, messages: [{ role: 'user', content: 'hi' }] })
    expect(body.model).toBe('test-model')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.stream).toBe(true)
  })

  it('temperature / top_p / max_tokens 仅在传入时出现', () => {
    const body = buildRequestBody({
      ...provider,
      messages: [{ role: 'user', content: 'x' }],
      temperature: 0.7,
      max_tokens: 1024,
    })
    expect(body.temperature).toBe(0.7)
    expect(body.max_tokens).toBe(1024)
    expect(body).not.toHaveProperty('top_p')
  })

  it('缺失可选的 apiKey/model 不抛错', () => {
    const body = buildRequestBody({ baseURL: 'https://x.com', messages: [{ role: 'user', content: 'test' }] })
    expect(body.model).toBeUndefined()
    expect(body.messages).toHaveLength(1)
  })
})

// ===== listModels =====

describe('listModels', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('解析 models.data 数组返回模型 id 列表', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5' }] }),
    } as Response)

    const r = await listModels(provider)
    expect(r.ok).toBe(true)
    expect(r.models).toEqual(['gpt-4', 'gpt-3.5'])
  })

  it('返回空 models 列表时 ok=true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({ data: [] }),
    } as Response)

    const r = await listModels(provider)
    expect(r.ok).toBe(true)
    expect(r.models).toEqual([])
  })

  it('HTTP 非 200 返回 ok=false + error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('bad key'),
      json: () => { throw new Error('not json') },
    } as unknown as Response)

    const r = await listModels(provider)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('HTTP 401')
    expect(r.error).toContain('bad key')
  })

  it('网络错误返回 ok=false + error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await listModels(provider)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('ECONNREFUSED')
  })

  it('baseURL 自动补全 /v1 前缀', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({ data: [{ id: 'm1' }] }),
    } as Response)

    await listModels({ baseURL: 'https://openai.example.com/v1', apiKey: 'sk-x' })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://openai.example.com/v1/models',
      expect.anything(),
    )
  })
})

// ===== embed =====

describe('embed', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('返回维度正确的向量数组', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkJson({ data: [{ embedding: [0.1, 0.2, 0.3] }] }))
    const vectors = await embed(provider, ['hello'])
    expect(vectors).toHaveLength(1)
    expect(vectors[0]).toEqual([0.1, 0.2, 0.3])
  })

  it('空 embedding 抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkJson({ data: [{ embedding: [] }] }))
    await expect(embed(provider, [''])).rejects.toThrow('embedding')
  })

  it('HTTP 错误抛错含状态码', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('oops'),
      json: () => { throw new Error('no') },
    } as unknown as Response)

    await expect(embed(provider, ['x'])).rejects.toThrow('HTTP 500')
  })
})

// ===== chatStream（核心流式解析） =====

function makeStreamResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body: stream,
    text: () => { throw new Error('unused') },
    json: () => { throw new Error('unused') },
  } as unknown as Response
}

// 注：chatStream 导入在 describe 块内以避免它依赖 fetch mock 的时序问题
describe('chatStream', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('拼接 content delta 返回完整文本', async () => {
    const { chatStream } = await import('./llmClient')
    const resp = makeStreamResponse([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(resp)

    const deltas: string[] = []
    const full = await chatStream(
      { ...provider, messages: [{ role: 'user', content: 'hi' }] },
      (d) => { deltas.push(d) },
    )
    expect(deltas).toEqual(['Hello', ' World'])
    expect(full).toBe('Hello World')
  })

  it('忽略 non-JSON / keep-alive 行不抛错', async () => {
    const { chatStream } = await import('./llmClient')
    const resp = makeStreamResponse([
      ': keep-alive\n\n',
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(resp)

    const deltas: string[] = []
    const full = await chatStream({ ...provider, messages: [] }, (d) => { deltas.push(d) })
    expect(deltas).toEqual(['OK'])
    expect(full).toBe('OK')
  })

  it('HTTP 非 200 抛错', async () => {
    const { chatStream } = await import('./llmClient')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      body: null,
      text: () => Promise.resolve('nope'),
      json: () => { throw new Error('no') },
    } as unknown as Response)

    await expect(
      chatStream({ ...provider, messages: [] }, () => {}),
    ).rejects.toThrow('HTTP 403')
  })

  it('onRaw 回调透传每行 payload', async () => {
    const { chatStream } = await import('./llmClient')
    const resp = makeStreamResponse([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(resp)

    const raws: Array<{ line: string; json: unknown | null }> = []
    await chatStream(
      { ...provider, messages: [{ role: 'user', content: 'hi' }] },
      () => {},
      (r) => { raws.push(r) },
    )
    expect(raws).toHaveLength(2)
    expect(raws[0].json).toHaveProperty('choices')
    expect(raws[1].json).toBeNull() // [DONE]
  })

  it('signal 透传到 fetch', async () => {
    const { chatStream } = await import('./llmClient')
    const resp = makeStreamResponse(['data: [DONE]\n\n'])
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(resp)
    const controller = new AbortController()

    await chatStream(
      { ...provider, messages: [], signal: controller.signal },
      () => {},
    )
    expect(fetchSpy.mock.calls[0][1]?.signal).toBe(controller.signal)
  })
})
