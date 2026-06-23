import type { FastifyInstance } from 'fastify'
import { listModels, chatStream, embed, buildRequestBody, type ProviderConfig } from '../llmClient'
import { M1_CLEAN_SYSTEM_PROMPT } from '../prompts'

type TestBody = ProviderConfig
type CleanBody = ProviderConfig & { content?: string; systemPrompt?: string }
type EmbedBody = ProviderConfig & { input?: string[] }
type ChatBody = ProviderConfig & {
  messages?: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>
  }>
  temperature?: number
  top_p?: number
  max_tokens?: number
  /** 节点测试 Debug Info：true 时回传 actual request body + 透传上游 raw chunks */
  includeRaw?: boolean
}

export async function llmRoutes(app: FastifyInstance) {
  // 连通性测试：转发 GET /v1/models
  app.post('/api/llm/test', async (req, reply) => {
    const { baseURL, apiKey } = (req.body ?? {}) as TestBody
    if (!baseURL) return reply.code(400).send({ ok: false, models: [], error: '缺少 baseURL' })
    return listModels({ baseURL, apiKey })
  })

  // 返回内置默认清理提示词（供前端「载入默认 / 显示默认」）
  app.get('/api/llm/prompt', async (_req, reply) => reply.send({ prompt: M1_CLEAN_SYSTEM_PROMPT }))

  // M1 清理：单章单请求，SSE 把上游流式增量转发给前端
  // 注意客户端断连检测：必须监听 **响应**（reply.raw）的 close，而非 req.raw——
  // req.raw 在请求体读取完毕后即触发 close（这是 HTTP 正常行为，不代表客户端断开），
  // 若据此 abort 会在 chatStream 收到首个 delta 前就取消上游请求，导致空响应。
  app.post('/api/llm/clean', async (req, reply) => {
    const { baseURL, apiKey, model, content, systemPrompt } = (req.body ?? {}) as CleanBody
    if (!baseURL || !model || !content) {
      reply.status(400).send({ error: '缺少 baseURL / model / content' })
      return
    }
    // 优先用前端传入的 systemPrompt（本次覆盖/设置页默认），为空则回退内置默认
    const systemContent = systemPrompt?.trim() || M1_CLEAN_SYSTEM_PROMPT

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    const send = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const ac = new AbortController()
    raw.on('close', () => ac.abort())

    chatStream(
      {
        baseURL,
        apiKey,
        model,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content },
        ],
        signal: ac.signal,
      },
      (delta) => send('delta', { delta }),
    )
      .then((full) => {
        if (full.trim().length < 10) send('error', { message: `输出过短（${full.trim().length} 字符），判为失败` })
        else send('done', { text: full })
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        send('error', { message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => raw.end())
  })

  // embedding：批量文本 → 向量（普通 JSON，非 SSE）。返回向量与维度。
  app.post('/api/llm/embed', async (req, reply) => {
    const { baseURL, apiKey, model, input } = (req.body ?? {}) as EmbedBody
    if (!baseURL || !model || !Array.isArray(input) || input.length === 0) {
      return reply.code(400).send({ error: '缺少 baseURL / model / input[]' })
    }
    try {
      const embeddings = await embed({ baseURL, apiKey, model }, input)
      return reply.send({ embeddings, dim: embeddings[0].length })
    } catch (e) {
      return reply.code(502).send({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  // 通用对话：支持纯文本推理和多模态理解（OpenAI 兼容格式），SSE 流式返回
  app.post('/api/llm/chat', async (req, reply) => {
    const { baseURL, apiKey, model, messages, temperature, top_p, max_tokens, includeRaw } = (req.body ?? {}) as ChatBody
    if (!baseURL || !model || !Array.isArray(messages) || messages.length === 0) {
      reply.status(400).send({ error: '缺少 baseURL / model / messages' })
      return
    }

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    const send = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const ac = new AbortController()
    raw.on('close', () => ac.abort())

    // 构造传给 llmClient 的参数（支持额外参数）
    const options: any = {
      baseURL,
      apiKey,
      model,
      messages,
      signal: ac.signal,
    }
    if (typeof temperature === 'number') options.temperature = temperature
    if (typeof top_p === 'number') options.top_p = top_p
    if (typeof max_tokens === 'number') options.max_tokens = max_tokens

    // includeRaw=true 时（节点测试 Debug Info）：回传实际发给上游的 request body + 透传每个 raw chunk
    if (includeRaw) {
      send('request-body', buildRequestBody(options))
    }

    chatStream(
      options,
      (delta) => send('delta', { delta }),
      includeRaw ? (r) => send('raw', r) : undefined,
    )
      .then((full) => send('done', { text: full }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        send('error', { message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => raw.end())
  })
}
