import Fastify from 'fastify'
import { llmRoutes } from './routes/llm.ts'

const PORT = Number(process.env.PORT ?? 8787)

const app = Fastify({ logger: true })

await app.register(llmRoutes)
app.get('/api/health', async () => ({ ok: true }))

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
