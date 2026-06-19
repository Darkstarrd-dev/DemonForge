import type { FastifyInstance } from 'fastify'
import { readAll, syncAll, deleteEntities, clearAllBusinessData, ENTITY_KEYS } from '../store/db'
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

  // 全量同步业务数据（**仅 upsert，永不删除**——见 db.ts 安全契约）。要删走 DELETE。
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

  // 显式删除：按实体键 + id 列表精确删除（前端 deleteBook/deleteImage 等走此端点）。
  // 替代旧 syncAll 的"反推删除"——杜绝"前端内存空触发同步清库"事故。
  app.delete('/api/store', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' })
    }
    // 仅接受已知实体键；含 clearAll:true 时清空全部业务表（备份恢复前的"纯净恢复"）
    const wantsClearAll = body.clearAll === true
    if (wantsClearAll) {
      try {
        clearAllBusinessData()
        return reply.send({ ok: true, cleared: true })
      } catch (err) {
        app.log.error(err)
        return reply.status(500).send({ error: String(err) })
      }
    }
    const filtered: Record<string, unknown> = {}
    for (const key of ENTITY_KEYS) {
      if (Array.isArray(body[key])) filtered[key] = body[key]
    }
    if (Object.keys(filtered).length === 0) {
      return reply.status(400).send({ error: '未提供任何有效实体键的 id 列表' })
    }
    try {
      deleteEntities(filtered)
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
