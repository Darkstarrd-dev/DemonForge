import type { FastifyInstance } from 'fastify'
import { readAll, syncAll } from '../store/db'
import { addToVectorStore, queryVectorStore, type ChunkMeta } from '../store/vector'
import type { ProviderConfig } from '../llmClient'

type VectorAddBody = ProviderConfig & { texts?: string[]; meta?: ChunkMeta }
type VectorQueryBody = ProviderConfig & { queryText?: string; k?: number; bookId?: string }

export async function storeRoutes(app: FastifyInstance) {
  // 读取全部业务数据（books/chapters/cards/outline/scenes/fragments/stateEvents/issues/mergeCandidates）
  app.get('/api/store', async (_req, reply) => {
    try {
      return reply.send(readAll())
    } catch (err) {
      app.log.error(err)
      return reply.status(500).send({ error: String(err) })
    }
  })

  // 全量同步业务数据（增量 upsert + 删除缺失行）
  app.post('/api/store', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' })
    }
    try {
      syncAll(body)
      return reply.send({ ok: true })
    } catch (err) {
      app.log.error(err)
      return reply.status(500).send({ error: String(err) })
    }
  })

  // RAG 入库：文本分块 → embedding → 写向量库
  app.post('/api/store/vector/add', async (req, reply) => {
    const { texts, meta, baseURL, apiKey, model } = (req.body ?? {}) as VectorAddBody
    if (!Array.isArray(texts) || !texts.length || !meta?.source || !baseURL || !model) {
      return reply.status(400).send({ error: '缺少 texts[] / meta.source / baseURL / model' })
    }
    try {
      const result = await addToVectorStore({ texts, meta, provider: { baseURL, apiKey, model } })
      return reply.send(result)
    } catch (err) {
      app.log.error(err)
      return reply.status(502).send({ error: String(err) })
    }
  })

  // RAG 检索：query → embedding → KNN 召回
  app.post('/api/store/vector/query', async (req, reply) => {
    const { queryText, k, bookId, baseURL, apiKey, model } = (req.body ?? {}) as VectorQueryBody
    if (!queryText || !baseURL || !model) {
      return reply.status(400).send({ error: '缺少 queryText / baseURL / model' })
    }
    try {
      const chunks = await queryVectorStore({ queryText, k, bookId, provider: { baseURL, apiKey, model } })
      return reply.send({ chunks })
    } catch (err) {
      app.log.error(err)
      return reply.status(502).send({ error: String(err) })
    }
  })
}
