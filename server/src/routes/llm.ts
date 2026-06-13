import type { FastifyInstance } from 'fastify'
import { listModels, chatStream, type ProviderConfig } from '../llmClient.ts'
import { M1_CLEAN_SYSTEM_PROMPT } from '../prompts.ts'

type TestBody = ProviderConfig
type CleanBody = ProviderConfig & { content?: string }

export async function llmRoutes(app: FastifyInstance) {
  // 连通性测试：转发 GET /v1/models
  app.post('/api/llm/test', async (req, reply) => {
    const { baseURL, apiKey } = (req.body ?? {}) as TestBody
    if (!baseURL) return reply.code(400).send({ ok: false, models: [], error: '缺少 baseURL' })
    return listModels({ baseURL, apiKey })
  })

  // M1 清理：单章单请求，SSE 把上游流式增量转发给前端
  app.post('/api/llm/clean', (req, reply) => {
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

    const { baseURL, apiKey, model, content } = (req.body ?? {}) as CleanBody
    if (!baseURL || !model || !content) {
      send('error', { message: '缺少 baseURL / model / content' })
      raw.end()
      return
    }

    const ac = new AbortController()
    req.raw.on('close', () => ac.abort())

    chatStream(
      {
        baseURL,
        apiKey,
        model,
        messages: [
          { role: 'system', content: M1_CLEAN_SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        signal: ac.signal,
      },
      (delta) => send('delta', { delta }),
    )
      .then((full) => {
        // §3.8 护栏：输出过短判失败（防模型回解释文字替代正文）
        if (full.trim().length < 10) send('error', { message: `输出过短（${full.trim().length} 字符），判为失败` })
        else send('done', { text: full })
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return // 客户端主动断开，不再回写
        send('error', { message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => raw.end())
  })

  // 预留：embedding（本轮不实现）
  app.post('/api/llm/embed', async (_req, reply) => reply.code(501).send({ error: 'embedding 未实现（本轮预留）' }))
}
