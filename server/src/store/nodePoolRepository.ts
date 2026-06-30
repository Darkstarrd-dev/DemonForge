/**
 * 节点池仓储层——接口 + SettingsJsonRepo 过渡实现 + SqliteRepo 终态实现。
 *
 * 路由层只依赖 NodePoolRepository 接口，禁止 import 具体 Repo 类。
 * 5.5a：注入 SettingsJsonRepo（读写 settings.json 三键，零迁移风险）。
 * 5.5b：新增 SqliteRepo，数据迁到独立 SQLite DB（<appDataDir>/nodepool.db），
 *        路由层零改动、只换注入实例。SettingsJsonRepo 保留为代码级 fallback。
 *
 * 前瞻约束：接口方法签名一旦定下，5.5b 不得修改（只新增实现类）。
 */

import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readSettings, updateSettings, writeSettings } from '../routes/settings'
import { getAppDataDir } from '../utils/paths'

// ===== 类型定义（后端侧，与前端 packages/node-pool/types.ts 对齐）=====

export interface ProviderApiKey {
  id: string
  key: string
  label?: string
  enabled: boolean
  state: 'ok' | 'exhausted' | 'disabled'
  lastUsedAt?: number
  consecFailures?: number
}

export interface Provider {
  id: string
  name: string
  baseURL: string
  apiKeys: ProviderApiKey[]
  rotationPolicy: 'round-robin' | 'failover'
  createdAt: number
}

export interface ProviderNode {
  id: string
  providerId: string
  nodeType: 'text' | 'image'
  protocol?: 'modelscope' | 'gpt' | 'xai'
  model: string
  enabled: boolean
  lastTestResult?: 'ok' | 'fail' | null
  maxConcurrency: number
  batchChars: number
  intervalSec: number
  usageLimitEnabled?: boolean
  usageLimit?: number
  usageLeft?: number
  usageResetDate?: string
  isMultimodal?: boolean
}

export interface ModuleModelMapping {
  nodeId: string | null
  model?: string
}

export type ModuleKey =
  | 'm0Arch'
  | 'm0Blueprint'
  | 'm1Clean'
  | 'm2Extract'
  | 'm2CardImage'
  | 'm3Simulate'
  | 'm4Generate'
  | 'm5Check'
  | 'm5Finalize'
  | 'batchGenerate'
  | 'roleChat'
  | 'embedding'

// ===== 仓储接口 =====

/** 节点池仓储接口——5.5a/5.5b 共用，路由层只依赖此接口。 */
export interface NodePoolRepository {
  listProviders(): Provider[]
  getProvider(id: string): Provider | null
  saveProvider(p: Provider): void
  deleteProvider(id: string): void

  listNodes(): ProviderNode[]
  getNode(id: string): ProviderNode | null
  saveNode(n: ProviderNode): void
  deleteNode(id: string): void

  getModuleMapping(): Record<ModuleKey, ModuleModelMapping>
  saveModuleMapping(mapping: Record<ModuleKey, ModuleModelMapping>): void
}

// ===== SettingsJsonRepo 实现（5.5a 过渡）=====

/** 5.5a 实现：读写 settings.json 的 providers/providerNodes/moduleMapping 三键。 */
export class SettingsJsonRepo implements NodePoolRepository {
  listProviders(): Provider[] {
    const s = readSettings()
    const providers = s.providers
    if (!Array.isArray(providers)) return []
    return providers as Provider[]
  }

  getProvider(id: string): Provider | null {
    return this.listProviders().find((p) => p.id === id) ?? null
  }

  saveProvider(p: Provider): void {
    const s = readSettings()
    const existing = (s.providers as Provider[] | undefined) ?? []
    const idx = existing.findIndex((x) => x.id === p.id)
    const updated = [...existing]
    if (idx >= 0) {
      updated[idx] = p
    } else {
      updated.push(p)
    }
    updateSettings({ providers: updated })
  }

  deleteProvider(id: string): void {
    const s = readSettings()
    const providers = ((s.providers as Provider[] | undefined) ?? []).filter((p) => p.id !== id)
    // 级联删除：同时过滤掉 providerId 匹配的节点
    const nodes = ((s.providerNodes as ProviderNode[] | undefined) ?? []).filter((n) => n.providerId !== id)
    updateSettings({ providers, providerNodes: nodes })
  }

  listNodes(): ProviderNode[] {
    const s = readSettings()
    const nodes = s.providerNodes
    if (!Array.isArray(nodes)) return []
    return nodes as ProviderNode[]
  }

  getNode(id: string): ProviderNode | null {
    return this.listNodes().find((n) => n.id === id) ?? null
  }

  saveNode(n: ProviderNode): void {
    const s = readSettings()
    const existing = (s.providerNodes as ProviderNode[] | undefined) ?? []
    const idx = existing.findIndex((x) => x.id === n.id)
    const updated = [...existing]
    if (idx >= 0) {
      updated[idx] = n
    } else {
      updated.push(n)
    }
    updateSettings({ providerNodes: updated })
  }

  deleteNode(id: string): void {
    const s = readSettings()
    const nodes = ((s.providerNodes as ProviderNode[] | undefined) ?? []).filter((n) => n.id !== id)
    updateSettings({ providerNodes: nodes })
  }

  getModuleMapping(): Record<ModuleKey, ModuleModelMapping> {
    const s = readSettings()
    return (s.moduleMapping as Record<ModuleKey, ModuleModelMapping> | undefined) ?? {} as Record<ModuleKey, ModuleModelMapping>
  }

  saveModuleMapping(mapping: Record<ModuleKey, ModuleModelMapping>): void {
    updateSettings({ moduleMapping: mapping })
  }
}

// ===== SqliteRepo 实现（5.5b 终态）=====
//
// 节点池数据存独立 SQLite DB（<appDataDir>/nodepool.db），全局行为——不随资产目录切换。
// 不加入 db.ts 的 ENTITIES（业务实体随资产目录切换；节点池是全局配置，独立 DB）。
// 表结构文档式（id TEXT PRIMARY KEY, data TEXT NOT NULL），与 db.ts 现有 11 张表一致。

/** 建三张表（幂等）。getNodePoolDb 与 SqliteRepo 注入式 DB 共用。 */
function ensureNodePoolTables(db: Database.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
  db.exec('CREATE TABLE IF NOT EXISTS provider_nodes (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
  db.exec('CREATE TABLE IF NOT EXISTS module_mapping (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
}

let cachedNodePoolDb: Database.Database | null = null

/** 取节点池独立 DB 句柄（缓存）。首次调用建表 + WAL。 */
function getNodePoolDb(): Database.Database {
  if (cachedNodePoolDb) return cachedNodePoolDb
  const dir = getAppDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const db = new Database(join(dir, 'nodepool.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  ensureNodePoolTables(db)
  cachedNodePoolDb = db
  return cachedNodePoolDb
}

/** 关闭节点池 DB 句柄（测试清理用；生产路径不调用，进程退出自然释放）。 */
export function closeNodePoolDb(): void {
  if (cachedNodePoolDb) {
    try { cachedNodePoolDb.close() } catch { /* ignore */ }
    cachedNodePoolDb = null
  }
}

/**
 * SqliteRepo——读写独立 SQLite DB。
 *
 * 构造可注入 DB（测试用 :memory:）；默认走 getNodePoolDb()（生产）。
 * 注入式 DB 在构造时 ensureNodePoolTables（确保 :memory: 也有表）；
 * 默认路径的表由 getNodePoolDb() 建，getDb 首次调用时触发。
 */
export class SqliteRepo implements NodePoolRepository {
  private dbInstance: Database.Database | null = null

  constructor(db?: Database.Database) {
    if (db) {
      ensureNodePoolTables(db)
      this.dbInstance = db
    }
  }

  private getDb(): Database.Database {
    if (!this.dbInstance) this.dbInstance = getNodePoolDb()
    return this.dbInstance
  }

  listProviders(): Provider[] {
    const rows = this.getDb().prepare('SELECT data FROM providers').all() as { data: string }[]
    const out: Provider[] = []
    for (const r of rows) {
      try { out.push(JSON.parse(r.data) as Provider) } catch { /* 单行损坏跳过 */ }
    }
    return out
  }

  getProvider(id: string): Provider | null {
    const row = this.getDb().prepare('SELECT data FROM providers WHERE id = ?').get(id) as { data: string } | undefined
    if (!row) return null
    try { return JSON.parse(row.data) as Provider } catch { return null }
  }

  saveProvider(p: Provider): void {
    this.getDb()
      .prepare('INSERT INTO providers (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(p.id, JSON.stringify(p))
  }

  deleteProvider(id: string): void {
    // 事务：删 provider + 级联删其下 nodes（JS 过滤 providerId，数据量小无需索引）
    const db = this.getDb()
    db.transaction(() => {
      db.prepare('DELETE FROM providers WHERE id = ?').run(id)
      const nodes = db.prepare('SELECT id, data FROM provider_nodes').all() as { id: string; data: string }[]
      for (const n of nodes) {
        try {
          if ((JSON.parse(n.data) as ProviderNode).providerId === id) {
            db.prepare('DELETE FROM provider_nodes WHERE id = ?').run(n.id)
          }
        } catch { /* 单行损坏跳过 */ }
      }
    })()
  }

  listNodes(): ProviderNode[] {
    const rows = this.getDb().prepare('SELECT data FROM provider_nodes').all() as { data: string }[]
    const out: ProviderNode[] = []
    for (const r of rows) {
      try { out.push(JSON.parse(r.data) as ProviderNode) } catch { /* 单行损坏跳过 */ }
    }
    return out
  }

  getNode(id: string): ProviderNode | null {
    const row = this.getDb().prepare('SELECT data FROM provider_nodes WHERE id = ?').get(id) as { data: string } | undefined
    if (!row) return null
    try { return JSON.parse(row.data) as ProviderNode } catch { return null }
  }

  saveNode(n: ProviderNode): void {
    this.getDb()
      .prepare('INSERT INTO provider_nodes (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(n.id, JSON.stringify(n))
  }

  deleteNode(id: string): void {
    this.getDb().prepare('DELETE FROM provider_nodes WHERE id = ?').run(id)
  }

  getModuleMapping(): Record<ModuleKey, ModuleModelMapping> {
    const row = this.getDb()
      .prepare("SELECT data FROM module_mapping WHERE id = 'singleton'")
      .get() as { data: string } | undefined
    if (!row) return {} as Record<ModuleKey, ModuleModelMapping>
    try {
      return JSON.parse(row.data) as Record<ModuleKey, ModuleModelMapping>
    } catch {
      return {} as Record<ModuleKey, ModuleModelMapping>
    }
  }

  saveModuleMapping(mapping: Record<ModuleKey, ModuleModelMapping>): void {
    this.getDb()
      .prepare("INSERT INTO module_mapping (id, data) VALUES ('singleton', ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data")
      .run(JSON.stringify(mapping))
  }
}

// ===== 一次性迁移：settings.json → nodepool.db =====
//
// 仿 migrateImageB64.ts 模式——settings.json 守卫 flag + 事务 + 备份。
// 失败处理：事务回滚不写 settings.json → 下次启动重试；.pre-migrate.bak 兜底。

/**
 * 把 settings.json 的 providers/providerNodes/moduleMapping 三键迁到 nodepool.db。
 * 守卫 nodePoolMigrated=true 确保仅执行一次。三者皆空（首次安装）直接标记。
 * 成功后从 settings.json 删除三键（writeSettings 整体写，非 merge）。
 */
export function migrateNodePoolToSqlite(): void {
  const s = readSettings()
  if (s.nodePoolMigrated === true) return // 守卫：仅执行一次

  const providers = s.providers as Provider[] | undefined
  const providerNodes = s.providerNodes as ProviderNode[] | undefined
  const moduleMapping = s.moduleMapping as Record<ModuleKey, ModuleModelMapping> | undefined

  const hasProviders = Array.isArray(providers) && providers.length > 0
  const hasNodes = Array.isArray(providerNodes) && providerNodes.length > 0
  const hasMapping = moduleMapping != null && typeof moduleMapping === 'object'

  // 三者皆空 → 首次安装，标记已迁移即可
  if (!hasProviders && !hasNodes && !hasMapping) {
    updateSettings({ nodePoolMigrated: true })
    return
  }

  const dataDir = getAppDataDir()
  const settingsPath = join(dataDir, 'settings.json')
  const bakPath = join(dataDir, 'settings.json.pre-migrate.bak')

  // 备份 settings.json（若存在）
  if (existsSync(settingsPath)) {
    try { copyFileSync(settingsPath, bakPath) } catch (err) {
      console.warn(`[migrate] 节点池：备份 settings.json 失败（继续迁移）：${String(err)}`)
    }
  }

  const db = getNodePoolDb()
  db.transaction(() => {
    const upsertProvider = db.prepare('INSERT INTO providers (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
    const upsertNode = db.prepare('INSERT INTO provider_nodes (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
    const upsertMapping = db.prepare("INSERT INTO module_mapping (id, data) VALUES ('singleton', ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data")

    for (const p of (providers ?? [])) upsertProvider.run(p.id, JSON.stringify(p))
    for (const n of (providerNodes ?? [])) upsertNode.run(n.id, JSON.stringify(n))
    if (hasMapping) upsertMapping.run(JSON.stringify(moduleMapping))
  })()

  // 从 settings.json 删除三键 + 标记已迁移（writeSettings 整体写，可删键）
  const { providers: _p, providerNodes: _pn, moduleMapping: _mm, ...rest } = s
  writeSettings({ ...rest, nodePoolMigrated: true })

  const nP = providers?.length ?? 0
  const nN = providerNodes?.length ?? 0
  console.log(`[migrate] 节点池迁移完成：${nP} providers + ${nN} nodes → nodepool.db`)
}
