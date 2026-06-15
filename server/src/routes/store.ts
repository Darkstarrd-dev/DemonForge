import type { FastifyInstance } from 'fastify'
import { readAll, syncAll } from '../store/db.ts'

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
}
