import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tmpDir = mkdtempSync(join(tmpdir(), 'nh-db-test-'))
const assetDir = join(tmpDir, 'assets')

type DbMod = typeof import('./db')
let db: DbMod

beforeAll(async () => {
  if (!existsSync(assetDir)) mkdirSync(assetDir, { recursive: true })
  process.env.NOVELHELPER_DATA_DIR = tmpDir
  writeFileSync(join(tmpDir, 'settings.json'), JSON.stringify({ assetDir }), 'utf-8')

  vi.resetModules()
  db = await import('./db')
  db.invalidateAssetDir()
})

afterAll(() => {
  try { db?.getDb().close() } catch { /* ignore */ }
  delete process.env.NOVELHELPER_DATA_DIR
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('syncAll + readAll', () => {
  it('upsert 一本书后 readAll 可读出', () => {
    db.clearAllBusinessData()
    db.syncAll({ books: [{ id: 'b1', title: '测试书' }] })
    const all = db.readAll()
    expect(all.books).toHaveLength(1)
    expect(all.books[0]).toMatchObject({ id: 'b1', title: '测试书' })
  })

  it('syncAll 是 upsert，重复写入不丢数据、不增加行', () => {
    db.clearAllBusinessData()
    db.syncAll({ books: [{ id: 'b1', title: '第一版' }] })
    db.syncAll({ books: [{ id: 'b1', title: '第二版' }] })
    const all = db.readAll()
    expect(all.books).toHaveLength(1)
    expect(all.books[0]).toMatchObject({ title: '第二版' })
  })

  it('syncAll 不删除 payload 中未出现的 id', () => {
    db.clearAllBusinessData()
    db.syncAll({ books: [{ id: 'b1' }, { id: 'b2' }] })
    db.syncAll({ books: [{ id: 'b1' }] })
    const all = db.readAll()
    expect(all.books).toHaveLength(2)
  })

  it('未提供实体 key 时不动该表', () => {
    db.clearAllBusinessData()
    db.syncAll({ books: [{ id: 'b1' }] })
    db.syncAll({ cards: [{ id: 'c1' }] })
    const all = db.readAll()
    expect(all.books).toHaveLength(1)
    expect(all.cards).toHaveLength(1)
  })
})

describe('deleteEntities', () => {
  it('删除指定 id', () => {
    db.clearAllBusinessData()
    db.syncAll({ books: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }] })
    db.deleteEntities({ books: ['b1', 'b3'] })
    const all = db.readAll()
    expect(all.books).toHaveLength(1)
    expect(all.books[0]).toMatchObject({ id: 'b2' })
  })

  it('未知实体 key 被白名单过滤不抛错', () => {
    db.clearAllBusinessData()
    db.syncAll({ books: [{ id: 'b1' }] })
    db.deleteEntities({ unknown_table: ['x'] })
    const all = db.readAll()
    expect(all.books).toHaveLength(1)
  })
})

describe('clearAllBusinessData', () => {
  it('清空所有业务实体表', () => {
    db.syncAll({ books: [{ id: 'b1' }], cards: [{ id: 'c1' }] })
    db.clearAllBusinessData()
    const all = db.readAll()
    expect(all.books).toEqual([])
    expect(all.cards).toEqual([])
  })
})
