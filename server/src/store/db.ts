// 资产库（SQLite）数据层——业务数据持久化到 <资产目录>/novelhelper.db。
// 设计：每个实体一张表，统一 (id TEXT PRIMARY KEY, data TEXT) 整实体存 JSON（文档式，
// 契合 types.ts 灵活字段；字段演进无需迁移）。资产目录可在运行中切换：getDb() 比对路径，
// 变更即关旧库、按新路径开库建表。设置与 API key 不在此库，仍存用户数据目录的 settings.json。
//
// ========== 持久化安全契约（2026-06-20 加固） ==========
// 历史教训：syncAll 曾采用"全量删除策略"——payload 中未出现的 id 一律删除。前端内存为空时
// 触发同步会把整库清空（曾因此丢失一本 106 章的书）。现契约如下：
//   1. syncAll 只做 upsert（INSERT … ON CONFLICT DO UPDATE），**永不删除**。
//   2. 删除必须显式调用 deleteEntities（按表名 + id 列表精确删除）。
//   3. readAll 逐行容错：单行 JSON 损坏不拖垮整库（跳过 + warn）。
//   4. assetDir 启动期缓存一次（readSettings 不在每次 DB 访问的热路径上反复执行，
//      避免 settings.json 损坏级联成 db 路径漂移）；变更经 invalidateAssetDir 重算。
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readSettings } from '../routes/settings'
import { getAppDataDir } from '../utils/paths'

const DEFAULT_ASSET_DIR = join(getAppDataDir(), 'assets')

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
  { key: 'architectures', table: 'architectures' },
  { key: 'mergeCandidates', table: 'merge_candidates' },
  // 节点测试历史（文本/多模态/图片三种测试类型，dataUrl/textResponse 等 JSON 整存）
  { key: 'testHistory', table: 'test_history' },
  // 向后兼容：旧的 imageGallery 字段映射到同一张表
  { key: 'imageGallery', table: 'test_history' },
  // 节点测试对话记录（多轮对话流，AI Studio 样式）
  { key: 'chatSessions', table: 'chat_sessions' },
] as const

/** 业务实体键集合（供前端 DELETE 端点做白名单校验）。 */
export const ENTITY_KEYS = ENTITIES.map((e) => e.key) as readonly string[]

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const img = join(dir, 'images')
  if (!existsSync(img)) mkdirSync(img, { recursive: true })
}

/** 解析当前资产目录：settings.assetDir 优先，否则回退默认 <appDataDir>/assets。不建目录。 */
function resolveAssetDir(): string {
  const s = readSettings()
  const raw = typeof s.assetDir === 'string' ? s.assetDir.trim() : ''
  return raw || DEFAULT_ASSET_DIR
}

/**
 * 当前资产目录（启动期缓存一次，避免每次 DB 访问都 readSettings 解析——
 * 历史上 settings.json 损坏会让 getAssetDir 回退到默认空目录，导致 db 路径漂移）。
 * 资产目录在设置页变更时经 invalidateAssetDir() 重算。
 */
let cachedAssetDir: string | null = null

export function getAssetDir(): string {
  if (cachedAssetDir === null) {
    cachedAssetDir = resolveAssetDir()
    ensureDir(cachedAssetDir)
  }
  return cachedAssetDir
}

/** 资产目录变更后调用：清缓存，下次 getAssetDir/getDb 重新解析并重开 db。 */
export function invalidateAssetDir(): void {
  cachedAssetDir = null
}

let cached: { db: Database.Database; dir: string } | null = null

/**
 * 取当前资产目录的 SQLite 句柄（已加载 sqlite-vec 扩展）。资产目录切换即关旧库重开。
 * 业务实体走文档式 (id,data)；RAG 的 chunk_meta 在此建，向量虚拟表 vec_chunks 因维度
 * 未知延迟到 vector.ts:ensureVecTable 建。
 */
export function getDb(): Database.Database {
  const dir = getAssetDir()
  if (cached && cached.dir === dir) return cached.db
  if (cached) {
    try { cached.db.close() } catch { /* ignore */ }
    cached = null
  }
  const db = new Database(join(dir, 'novelhelper.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  sqliteVec.load(db)
  for (const { table } of ENTITIES) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
  }
  // RAG chunk 元数据（向量行 rowid ↔ 来源/文本）。vec_chunks 虚拟表见 vector.ts。
  db.exec(
    `CREATE TABLE IF NOT EXISTS chunk_meta (rowid INTEGER PRIMARY KEY, source TEXT, bookId TEXT, chapterId TEXT, text TEXT NOT NULL)`,
  )
  cached = { db, dir }
  return db
}

/** 读取全部业务数据，按前端键返回各实体数组（逐行容错：单行坏不拖垮整库）。 */
export function readAll(): Record<string, unknown[]> {
  const db = getDb()
  const out: Record<string, unknown[]> = {}
  for (const { key, table } of ENTITIES) {
    const rows = db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[]
    const items: unknown[] = []
    for (let i = 0; i < rows.length; i++) {
      try {
        items.push(JSON.parse(rows[i].data))
      } catch (err) {
        // 单行 JSON 损坏：跳过该行而非让整个 readAll 抛错（避免前端误判为空 → 触发空同步）。
        // 注：此分支在 syncAll 已改为纯 upsert 后危害大幅降低，但仍保留以防数据污染扩散。
        console.warn(`[db] ${table} 第 ${i} 行 JSON 解析失败，已跳过：${String(err)}`)
      }
    }
    out[key] = items
  }
  return out
}

/**
 * 用前端传入的数据同步各表：**仅 upsert（INSERT … ON CONFLICT DO UPDATE），永不删除**。
 *
 * 安全契约：传入什么就存什么。payload 中未出现的 id **不会被删除**——要删必须显式调
 * deleteEntities。这从根上杜绝"前端内存为空时触发同步把整库清空"类事故。
 * 若某个实体键未提供（非数组）→ 跳过该表（不动）。
 */
export function syncAll(payload: Record<string, unknown>): void {
  const db = getDb()
  const tx = db.transaction(() => {
    for (const { key, table } of ENTITIES) {
      const arr = payload[key]
      if (!Array.isArray(arr)) continue // 未提供该实体则不动该表
      const upsert = db.prepare(
        `INSERT INTO ${table} (id, data) VALUES (@id, @data) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      for (const item of arr as { id?: unknown }[]) {
        const id = typeof item?.id === 'string' ? item.id : String(item?.id ?? '')
        if (!id) continue // 无 id 的项无法 upsert，跳过
        try {
          upsert.run({ id, data: JSON.stringify(item) })
        } catch (err) {
          // 单条 stringify 失败（如循环引用）不拖垮整批；记日志跳过。
          console.warn(`[db] ${table} id=${id} 写入失败，已跳过：${String(err)}`)
        }
      }
    }
  })
  tx()
}

/**
 * 按表名 + id 列表精确删除（显式删除的唯一入口）。事务包裹保证原子性。
 * 仅接受白名单内的实体键，避免任意表名注入。
 */
export function deleteEntities(deletes: Record<string, unknown>): void {
  const db = getDb()
  // 显式标注 Map< string, string> —— ENTITIES.key 是字面量联合，直接 new Map 会收窄类型
  // 导致 .get(普通 string) 报错。这里放宽为 string 索引以接受任意前端传来的键（白名单过滤）。
  const allowedTables = new Map<string, string>(ENTITIES.map((e) => [e.key, e.table]))
  const tx = db.transaction(() => {
    for (const [key, ids] of Object.entries(deletes)) {
      const table = allowedTables.get(key)
      if (!table) continue // 未知实体键：忽略（白名单）
      if (!Array.isArray(ids)) continue
      const del = db.prepare(`DELETE FROM ${table} WHERE id = ?`)
      for (const id of ids) {
        if (typeof id === 'string' && id) {
          try { del.run(id) } catch (err) {
            console.warn(`[db] 删除 ${table} id=${id} 失败：${String(err)}`)
          }
        }
      }
    }
  })
  tx()
}

/** 清空全部业务实体表（用于"先清空再恢复备份"场景）。RAG 向量表不在清理范围。 */
export function clearAllBusinessData(): void {
  const db = getDb()
  const tx = db.transaction(() => {
    for (const { table } of ENTITIES) {
      db.exec(`DELETE FROM ${table}`)
    }
  })
  tx()
}
