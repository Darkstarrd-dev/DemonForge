/**
 * 节点池 CRUD 路由：/api/providers + /api/nodes + /api/module-mapping。
 *
 * 路由层只依赖 NodePoolRepository 接口，repo 实例由 index.ts 注入。
 * 5.5a 注入 SettingsJsonRepo，5.5b 换 SqliteRepo 时路由层零改动。
 */
import type { FastifyInstance } from 'fastify'
import type { NodePoolRepository } from '../store/nodePoolRepository'

export async function nodesRoutes(app: FastifyInstance, repo: NodePoolRepository): Promise<void> {
  // ===== /api/providers =====

  app.get('/api/providers', async (_req, reply) => {
    return reply.send(repo.listProviders())
  })

  app.post('/api/providers', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object' || !body.id) {
      return reply.status(400).send({ error: 'Missing provider id' })
    }
    repo.saveProvider(body as unknown as import('../store/nodePoolRepository').Provider)
    return reply.send({ ok: true })
  })

  app.put('/api/providers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' })
    }
    // 确保 body.id 与 path param 一致
    const provider = { ...body, id } as unknown as import('../store/nodePoolRepository').Provider
    repo.saveProvider(provider)
    return reply.send({ ok: true })
  })

  app.delete('/api/providers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    repo.deleteProvider(id)
    return reply.send({ ok: true })
  })

  // ===== /api/nodes =====

  app.get('/api/nodes', async (_req, reply) => {
    return reply.send(repo.listNodes())
  })

  app.post('/api/nodes', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object' || !body.id) {
      return reply.status(400).send({ error: 'Missing node id' })
    }
    repo.saveNode(body as unknown as import('../store/nodePoolRepository').ProviderNode)
    return reply.send({ ok: true })
  })

  app.put('/api/nodes/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' })
    }
    const node = { ...body, id } as unknown as import('../store/nodePoolRepository').ProviderNode
    repo.saveNode(node)
    return reply.send({ ok: true })
  })

  app.delete('/api/nodes/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    repo.deleteNode(id)
    return reply.send({ ok: true })
  })

  // ===== /api/module-mapping =====

  app.get('/api/module-mapping', async (_req, reply) => {
    return reply.send(repo.getModuleMapping())
  })

  app.post('/api/module-mapping', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' })
    }
    repo.saveModuleMapping(
      body as Record<import('../store/nodePoolRepository').ModuleKey, import('../store/nodePoolRepository').ModuleModelMapping>,
    )
    return reply.send({ ok: true })
  })
}
