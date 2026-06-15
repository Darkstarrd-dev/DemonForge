import type { FastifyInstance } from 'fastify'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DATA_DIR = join(ROOT, 'data')
const SETTINGS_PATH = join(DATA_DIR, 'settings.json')

function readSettings(): Record<string, unknown> {
  if (!existsSync(SETTINGS_PATH)) return {}
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async (_req, reply) => {
    const data = readSettings()
    return reply.send(data)
  })

  app.post('/api/settings', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' })
    }
    const existing = readSettings()
    writeSettings({ ...existing, ...body })
    return reply.send({ ok: true })
  })
}
