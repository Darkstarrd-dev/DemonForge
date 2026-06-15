// 资产库（SQLite）数据层——业务数据持久化到 <资产目录>/novelhelper.db。
// 设计：每个实体一张表，统一 (id TEXT PRIMARY KEY, data TEXT) 整实体存 JSON（文档式，
// 契合 types.ts 灵活字段；字段演进无需迁移）。资产目录可在运行中切换：getDb() 比对路径，
// 变更即关旧库、按新路径开库建表。设置与 API key 不在此库，仍存 server/src/data/settings.json。
import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSettings } from '../routes/settings.ts'

const HERE = dirname(fileURLToPath(import.meta.url)) // server/src/store
const REPO_ROOT = dirname(dirname(dirname(HERE)))    // store → src → server → repo
const DEFAULT_ASSET_DIR = join(REPO_ROOT, 'assets')

// 前端 AppState 键 ↔ SQLite 表名
const ENTITIES = [
  { key: 'books', table: 'books' },
  { key: 'chapters', table: 'chapters' },
  { key: 'cards', table: 'cards' },
  { key: 'outline', table: 'outline' },
  { key: 'scenes', table: 'scenes' },
  { key: 'fragments', table: 'fragments' },
  { key: 'stateEvents', table: 'state_events' },
  { key: 'issues', table: 'issues' },
  { key: 'mergeCandidates', table: 'merge_candidates' },
] as const

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const img = join(dir, 'images')
  if (!existsSync(img)) mkdirSync(img, { recursive: true })
}

/** 当前资产目录：settings.assetDir 优先，否则回退 <repo>/assets；并确保目录与 images/ 存在。 */
export function getAssetDir(): string {
  const s = readSettings()
  const raw = typeof s.assetDir === 'string' ? s.assetDir.trim() : ''
  const dir = raw || DEFAULT_ASSET_DIR
  ensureDir(dir)
  return dir
}

let cached: { db: Database.Database; dir: string } | null = null

function getDb(): Database.Database {
  const dir = getAssetDir()
  if (cached && cached.dir === dir) return cached.db
  if (cached) {
    try { cached.db.close() } catch { /* ignore */ }
    cached = null
  }
  const db = new Database(join(dir, 'novelhelper.db'))
  db.pragma('journal_mode = WAL')
  for (const { table } of ENTITIES) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
  }
  cached = { db, dir }
  return db
}

/** 读取全部业务数据，按前端键返回 9 个数组。 */
export function readAll(): Record<string, unknown[]> {
  const db = getDb()
  const out: Record<string, unknown[]> = {}
  for (const { key, table } of ENTITIES) {
    const rows = db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[]
    out[key] = rows.map((r) => JSON.parse(r.data))
  }
  return out
}

/** 用前端传入的全量数据同步各表：upsert 现有 id + 删除不在传入集合中的行（增量写）。 */
export function syncAll(payload: Record<string, unknown>): void {
  const db = getDb()
  const tx = db.transaction(() => {
    for (const { key, table } of ENTITIES) {
      const arr = payload[key]
      if (!Array.isArray(arr)) continue // 未提供该实体则不动该表
      const upsert = db.prepare(
        `INSERT INTO ${table} (id, data) VALUES (@id, @data) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      const ids = new Set<string>()
      for (const item of arr as { id?: unknown }[]) {
        const id = String(item?.id ?? '')
        if (!id) continue
        ids.add(id)
        upsert.run({ id, data: JSON.stringify(item) })
      }
      const existing = db.prepare(`SELECT id FROM ${table}`).all() as { id: string }[]
      const del = db.prepare(`DELETE FROM ${table} WHERE id = ?`)
      for (const row of existing) {
        if (!ids.has(row.id)) del.run(row.id)
      }
    }
  })
  tx()
}
