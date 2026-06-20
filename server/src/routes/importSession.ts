import type { FastifyInstance } from 'fastify'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppDataDir } from '../utils/paths'

const DATA_DIR = getAppDataDir()
const SESSION_PATH = join(DATA_DIR, 'import-session.json')
const SESSION_TMP = join(DATA_DIR, 'import-session.json.tmp')
const SESSION_BAK = join(DATA_DIR, 'import-session.json.bak')

function readSession(): Record<string, unknown> | null {
  if (existsSync(SESSION_PATH)) {
    try {
      return JSON.parse(readFileSync(SESSION_PATH, 'utf-8'))
    } catch (err) {
      console.warn(`[importSession] 主文件解析失败，尝试 .bak：${String(err)}`)
    }
  }
  if (existsSync(SESSION_BAK)) {
    try {
      return JSON.parse(readFileSync(SESSION_BAK, 'utf-8'))
    } catch (err) {
      console.warn(`[importSession] .bak 也解析失败：${String(err)}`)
    }
  }
  return null
}

function writeSession(data: Record<string, unknown>): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (existsSync(SESSION_PATH)) {
    try {
      copyFileSync(SESSION_PATH, SESSION_BAK)
    } catch (err) {
      console.warn(`[importSession] 备份 .bak 失败（继续写入）：${String(err)}`)
    }
  }
  writeFileSync(SESSION_TMP, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(SESSION_TMP, SESSION_PATH)
}

function deleteSession(): void {
  try { if (existsSync(SESSION_PATH)) unlinkSync(SESSION_PATH) } catch {}
  try { if (existsSync(SESSION_BAK)) unlinkSync(SESSION_BAK) } catch {}
  try { if (existsSync(SESSION_TMP)) unlinkSync(SESSION_TMP) } catch {}
}

export async function importSessionRoutes(app: FastifyInstance) {
  app.get('/api/import-session', async (_req, reply) => {
    const data = readSession()
    return reply.send({ session: data ?? null })
  })

  app.post('/api/import-session', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' })
    }
    writeSession(body)
    return reply.send({ ok: true })
  })

  app.delete('/api/import-session', async (_req, reply) => {
    deleteSession()
    return reply.send({ ok: true })
  })
}
