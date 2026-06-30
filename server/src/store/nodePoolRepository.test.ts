// 5.5b 单测：SqliteRepo CRUD + 级联删除 + 迁移脚本 + 接口契约。
// CRUD 用 :memory: SQLite（注入构造）；迁移用临时目录 + env var + resetModules
//   （settings.ts 的 DATA_DIR 在 import 时计算，需 resetModules 取新实例）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping } from './nodePoolRepository'

// 顶层 import（默认 env）：仅 SqliteRepo 类型 + CRUD 用（CRUD 注入 :memory:，不触达 getNodePoolDb）
import { SqliteRepo } from './nodePoolRepository'

// ===== 测试夹具 =====

function makeProvider(id: string, name: string = id): Provider {
  return {
    id,
    name,
    baseURL: `https://${id}.example.com`,
    apiKeys: [{ id: `${id}-k1`, key: 'sk-test', enabled: true, state: 'ok' }],
    rotationPolicy: 'round-robin',
    createdAt: 1700000000000,
  }
}

function makeNode(id: string, providerId: string, model: string = 'm-' + id): ProviderNode {
  return {
    id,
    providerId,
    nodeType: 'text',
    model,
    enabled: true,
    maxConcurrency: 2,
    batchChars: 8000,
    intervalSec: 0,
  }
}

const SAMPLE_MAPPING: Record<ModuleKey, ModuleModelMapping> = {
  m0Arch: { nodeId: 'n1' },
  m0Blueprint: { nodeId: 'n1' },
  m1Clean: { nodeId: 'n2' },
  m2Extract: { nodeId: 'n2' },
  m2CardImage: { nodeId: null },
  m3Simulate: { nodeId: 'n2' },
  m4Generate: { nodeId: 'n1' },
  m5Check: { nodeId: 'n1' },
  m5Finalize: { nodeId: 'n1' },
  batchGenerate: { nodeId: 'n1' },
  roleChat: { nodeId: 'n2' },
  embedding: { nodeId: 'n2' },
}

// ===== 1. SqliteRepo CRUD（:memory:）=====

describe('SqliteRepo CRUD', () => {
  let db: Database.Database
  let repo: SqliteRepo

  beforeEach(() => {
    db = new Database(':memory:')
    repo = new SqliteRepo(db)
  })

  afterEach(() => {
    db.close()
  })

  it('listProviders 空库返回 []', () => {
    expect(repo.listProviders()).toEqual([])
  })

  it('saveProvider + getProvider + listProviders', () => {
    const p = makeProvider('p1', '供应商一')
    repo.saveProvider(p)
    expect(repo.getProvider('p1')).toEqual(p)
    expect(repo.listProviders()).toHaveLength(1)
  })

  it('saveProvider 同 id 覆盖（upsert）', () => {
    repo.saveProvider(makeProvider('p1', '旧'))
    repo.saveProvider(makeProvider('p1', '新名'))
    const got = repo.getProvider('p1')
    expect(got?.name).toBe('新名')
    expect(repo.listProviders()).toHaveLength(1)
  })

  it('getProvider 不存在返回 null', () => {
    expect(repo.getProvider('nope')).toBeNull()
  })

  it('deleteProvider 删自身', () => {
    repo.saveProvider(makeProvider('p1'))
    repo.deleteProvider('p1')
    expect(repo.listProviders()).toHaveLength(0)
    expect(repo.getProvider('p1')).toBeNull()
  })

  it('deleteProvider 级联删其下 nodes（保留他 provider 的 nodes）', () => {
    repo.saveProvider(makeProvider('p1'))
    repo.saveProvider(makeProvider('p2'))
    repo.saveNode(makeNode('n1', 'p1'))
    repo.saveNode(makeNode('n2', 'p1'))
    repo.saveNode(makeNode('n3', 'p2'))
    repo.deleteProvider('p1')
    // p1 的 n1/n2 被级联删
    expect(repo.listNodes()).toHaveLength(1)
    expect(repo.getNode('n1')).toBeNull()
    expect(repo.getNode('n2')).toBeNull()
    // p2 的 n3 保留
    expect(repo.getNode('n3')?.providerId).toBe('p2')
    expect(repo.listProviders()).toHaveLength(1)
  })

  it('saveNode + getNode + listNodes', () => {
    const n = makeNode('n1', 'p1')
    repo.saveNode(n)
    expect(repo.getNode('n1')).toEqual(n)
    expect(repo.listNodes()).toHaveLength(1)
  })

  it('saveNode 同 id 覆盖', () => {
    repo.saveNode(makeNode('n1', 'p1', 'old'))
    repo.saveNode(makeNode('n1', 'p1', 'new'))
    expect(repo.getNode('n1')?.model).toBe('new')
    expect(repo.listNodes()).toHaveLength(1)
  })

  it('deleteNode 只删自身', () => {
    repo.saveNode(makeNode('n1', 'p1'))
    repo.saveNode(makeNode('n2', 'p1'))
    repo.deleteNode('n1')
    expect(repo.listNodes()).toHaveLength(1)
    expect(repo.getNode('n1')).toBeNull()
    expect(repo.getNode('n2')?.id).toBe('n2')
  })

  it('getModuleMapping 空库返回 {}', () => {
    expect(repo.getModuleMapping()).toEqual({})
  })

  it('saveModuleMapping + getModuleMapping（singleton 行：覆盖非追加）', () => {
    repo.saveModuleMapping(SAMPLE_MAPPING)
    expect(repo.getModuleMapping()).toEqual(SAMPLE_MAPPING)
    // 再写一次：仍是单行（singleton），应覆盖而非新增第二行
    const next = { ...SAMPLE_MAPPING, m1Clean: { nodeId: 'n9' } }
    repo.saveModuleMapping(next)
    expect(repo.getModuleMapping().m1Clean.nodeId).toBe('n9')
    // 确认 module_mapping 表只有一行
    const cnt = db.prepare('SELECT COUNT(*) as c FROM module_mapping').get() as { c: number }
    expect(cnt.c).toBe(1)
  })

  it('单行 JSON 损坏不拖垮整批（listProviders 跳过坏行）', () => {
    repo.saveProvider(makeProvider('p1'))
    // 手动塞一行坏 JSON
    db.prepare('INSERT INTO providers (id, data) VALUES (?, ?)').run('bad', '{not json')
    const list = repo.listProviders()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('p1')
    expect(repo.getProvider('bad')).toBeNull()
  })
})

// ===== 2. 迁移脚本（临时目录 + env var + resetModules）=====

describe('migrateNodePoolToSqlite', () => {
  let tmpDir: string
  let origDataDir: string | undefined

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'np-mig-'))
    origDataDir = process.env.NOVELHELPER_DATA_DIR
    process.env.NOVELHELPER_DATA_DIR = tmpDir
    vi.resetModules()
  })

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.NOVELHELPER_DATA_DIR
    else process.env.NOVELHELPER_DATA_DIR = origDataDir
    vi.resetModules()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('含 providers/nodes/mapping 的 settings.json → 迁入 nodepool.db + 删三键 + 置守卫', async () => {
    const providers = [makeProvider('p1'), makeProvider('p2')]
    const providerNodes = [makeNode('n1', 'p1'), makeNode('n2', 'p2')]
    writeFileSync(
      join(tmpDir, 'settings.json'),
      JSON.stringify({
        providers,
        providerNodes,
        moduleMapping: SAMPLE_MAPPING,
        otherSetting: 'keep-me',
        assetDir: '/some/asset',
      }),
    )

    const { migrateNodePoolToSqlite, closeNodePoolDb } = await import('./nodePoolRepository')
    try {
      migrateNodePoolToSqlite()
      // 验证 nodepool.db 有数据
      const dbPath = join(tmpDir, 'nodepool.db')
      expect(existsSync(dbPath)).toBe(true)
      const verify = new Database(dbPath)
      const pRows = verify.prepare('SELECT data FROM providers').all() as { data: string }[]
      expect(pRows).toHaveLength(2)
      const nRows = verify.prepare('SELECT data FROM provider_nodes').all() as { data: string }[]
      expect(nRows).toHaveLength(2)
      const mRow = verify.prepare("SELECT data FROM module_mapping WHERE id='singleton'").get() as { data: string }
      expect(JSON.parse(mRow.data)).toEqual(SAMPLE_MAPPING)
      verify.close()
      // 验证 settings.json：三键已删 + 守卫 + 其它设置保留
      const after = JSON.parse(readFileSync(join(tmpDir, 'settings.json'), 'utf-8'))
      expect(after.providers).toBeUndefined()
      expect(after.providerNodes).toBeUndefined()
      expect(after.moduleMapping).toBeUndefined()
      expect(after.nodePoolMigrated).toBe(true)
      expect(after.otherSetting).toBe('keep-me')
      expect(after.assetDir).toBe('/some/asset')
      // 备份文件存在
      expect(existsSync(join(tmpDir, 'settings.json.pre-migrate.bak'))).toBe(true)
    } finally {
      closeNodePoolDb()
    }
  })

  it('守卫已置则不重复迁移（idempotent）', async () => {
    writeFileSync(
      join(tmpDir, 'settings.json'),
      JSON.stringify({ nodePoolMigrated: true, providers: [makeProvider('p1')] }),
    )
    const { migrateNodePoolToSqlite, closeNodePoolDb } = await import('./nodePoolRepository')
    try {
      migrateNodePoolToSqlite()
      // 不应创建 nodepool.db（守卫短路）
      expect(existsSync(join(tmpDir, 'nodepool.db'))).toBe(false)
      // settings.json 保持原样（含 providers，因为没迁移）
      const after = JSON.parse(readFileSync(join(tmpDir, 'settings.json'), 'utf-8'))
      expect(after.nodePoolMigrated).toBe(true)
      expect(after.providers).toHaveLength(1)
    } finally {
      closeNodePoolDb()
    }
  })

  it('首次安装（三键皆空）→ 标记守卫，不建 nodepool.db', async () => {
    writeFileSync(join(tmpDir, 'settings.json'), JSON.stringify({ assetDir: '/x' }))
    const { migrateNodePoolToSqlite, closeNodePoolDb } = await import('./nodePoolRepository')
    try {
      migrateNodePoolToSqlite()
      expect(existsSync(join(tmpDir, 'nodepool.db'))).toBe(false)
      const after = JSON.parse(readFileSync(join(tmpDir, 'settings.json'), 'utf-8'))
      expect(after.nodePoolMigrated).toBe(true)
    } finally {
      closeNodePoolDb()
    }
  })
})

// ===== 3. 接口契约：SqliteRepo 与 SettingsJsonRepo 行为一致 =====
//
// 同一组操作序列分别跑在两个 repo 上，断言关键输出一致。SettingsJsonRepo 走
// settings.json（临时目录 + resetModules），SqliteRepo 走 :memory:。

describe('接口契约：SettingsJsonRepo 与 SqliteRepo 行为一致', () => {
  let tmpDir: string
  let origDataDir: string | undefined

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'np-contract-'))
    origDataDir = process.env.NOVELHELPER_DATA_DIR
    process.env.NOVELHELPER_DATA_DIR = tmpDir
    vi.resetModules()
  })

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.NOVELHELPER_DATA_DIR
    else process.env.NOVELHELPER_DATA_DIR = origDataDir
    vi.resetModules()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('save/get/list/delete + 级联 两 repo 输出一致', async () => {
    // SettingsJsonRepo：临时 settings.json
    writeFileSync(join(tmpDir, 'settings.json'), JSON.stringify({}))
    const jsonMod = await import('./nodePoolRepository')
    const SettingsJsonRepo = (jsonMod as unknown as { SettingsJsonRepo: new () => import('./nodePoolRepository').NodePoolRepository }).SettingsJsonRepo
    const jsonRepo = new SettingsJsonRepo()

    // SqliteRepo：:memory:
    const memDb = new Database(':memory:')
    const sqliteRepo = new SqliteRepo(memDb)

    try {
      const p1 = makeProvider('p1')
      const p2 = makeProvider('p2')
      const n1 = makeNode('n1', 'p1')
      const n2 = makeNode('n2', 'p1')
      const n3 = makeNode('n3', 'p2')

      for (const repo of [jsonRepo, sqliteRepo]) {
        repo.saveProvider(p1)
        repo.saveProvider(p2)
        repo.saveNode(n1)
        repo.saveNode(n2)
        repo.saveNode(n3)
        repo.saveModuleMapping(SAMPLE_MAPPING)
      }

      // get 一致
      expect(jsonRepo.getProvider('p1')).toEqual(sqliteRepo.getProvider('p1'))
      expect(jsonRepo.getNode('n1')).toEqual(sqliteRepo.getNode('n1'))
      expect(jsonRepo.getModuleMapping()).toEqual(sqliteRepo.getModuleMapping())
      // list 长度一致
      expect(jsonRepo.listProviders()).toHaveLength(sqliteRepo.listProviders().length)
      expect(jsonRepo.listNodes()).toHaveLength(sqliteRepo.listNodes().length)
      // 不存在一致返回 null
      expect(jsonRepo.getProvider('nope')).toBeNull()
      expect(sqliteRepo.getProvider('nope')).toBeNull()

      // 级联删 p1（n1/n2 应一起删，n3 保留）
      jsonRepo.deleteProvider('p1')
      sqliteRepo.deleteProvider('p1')
      expect(jsonRepo.listProviders()).toHaveLength(sqliteRepo.listProviders().length)
      expect(jsonRepo.listNodes()).toHaveLength(sqliteRepo.listNodes().length)
      expect(jsonRepo.listNodes().every((n) => n.providerId !== 'p1')).toBe(true)
      expect(sqliteRepo.listNodes().every((n) => n.providerId !== 'p1')).toBe(true)
      // n3 保留
      expect(jsonRepo.getNode('n3')?.id).toBe('n3')
      expect(sqliteRepo.getNode('n3')?.id).toBe('n3')

      // 删单 node 一致
      jsonRepo.deleteNode('n3')
      sqliteRepo.deleteNode('n3')
      expect(jsonRepo.listNodes()).toHaveLength(sqliteRepo.listNodes().length)
      expect(jsonRepo.getNode('n3')).toBeNull()
      expect(sqliteRepo.getNode('n3')).toBeNull()

      // moduleMapping 覆盖一致
      const next = { ...SAMPLE_MAPPING, m1Clean: { nodeId: 'nX' } }
      jsonRepo.saveModuleMapping(next)
      sqliteRepo.saveModuleMapping(next)
      expect(jsonRepo.getModuleMapping().m1Clean.nodeId).toBe('nX')
      expect(sqliteRepo.getModuleMapping().m1Clean.nodeId).toBe('nX')
    } finally {
      memDb.close()
    }
  })
})
