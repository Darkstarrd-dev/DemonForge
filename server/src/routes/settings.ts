import type { FastifyInstance } from 'fastify'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppDataDir } from '../utils/paths'
import { invalidateAssetDir } from '../store/db'

const DATA_DIR = getAppDataDir()
const SETTINGS_PATH = join(DATA_DIR, 'settings.json')
const SETTINGS_TMP = join(DATA_DIR, 'settings.json.tmp')
const SETTINGS_BAK = join(DATA_DIR, 'settings.json.bak')

/** 最近一次 readSettings 是否走了 .bak 回退（供启动日志诊断）。 */
let lastReadRecovered = false
export function wasLastReadRecovered(): boolean {
  return lastReadRecovered
}

/**
 * 读取 settings.json。损坏时回退 .bak；都失败返回 {}。
 *
 * 历史教训：旧版直接 `try { parse } catch { return {} }` 静默吞错——文件损坏（断电/崩溃导致
 * writeFileSync 截断）与"首次运行"无法区分，providers/API key/moduleMapping/storeInitialized
 * 全静默丢失，无任何告警。现改为：① 优先主文件；② 主文件损坏则尝试 .bak 并记 warn；
 * ③ 都失败才返回 {}（真正的首次运行），仍记 warn 供启动日志识别。
 */
export function readSettings(): Record<string, unknown> {
  lastReadRecovered = false
  if (existsSync(SETTINGS_PATH)) {
    try {
      return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'))
    } catch (err) {
      console.warn(`[settings] 主文件解析失败，尝试 .bak：${String(err)}`)
    }
  }
  if (existsSync(SETTINGS_BAK)) {
    try {
      const data = JSON.parse(readFileSync(SETTINGS_BAK, 'utf-8'))
      lastReadRecovered = true
      console.warn('[settings] 已从 settings.json.bak 恢复（主文件可能损坏）')
      return data
    } catch (err) {
      console.warn(`[settings] .bak 也解析失败：${String(err)}`)
    }
  }
  console.warn('[settings] 无可用 settings（首次运行或文件缺失），使用空配置')
  return {}
}

/**
 * 原子写入 settings.json：① 先备份当前文件为 .bak；② 写 .tmp；③ rename 覆盖（同分区原子）。
 *
 * 历史教训：旧版直接 writeFileSync(SETTINGS_PATH, ...) 非原子——崩溃/断电发生在写入中途会
 * 留下截断的 settings.json，下次启动 readSettings 拿到残缺 JSON 静默当空配置，所有设置丢失。
 * 现三步写入：备份 → 写临时文件 → rename。rename 在同文件系统内是原子操作，崩溃只会留下
 * 完整的旧文件（.bak 或原文件）或完整的新文件，不会出现截断的半成品。
 */
export function writeSettings(data: Record<string, unknown>): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  // 备份当前 settings.json（若存在）——每次写入都刷新 .bak，保证它总是"上一次完整状态"
  if (existsSync(SETTINGS_PATH)) {
    try {
      copyFileSync(SETTINGS_PATH, SETTINGS_BAK)
    } catch (err) {
      // 备份失败不应阻断主写入流程，仅记日志
      console.warn(`[settings] 备份 .bak 失败（继续写入）：${String(err)}`)
    }
  }
  // 写临时文件 → rename（原子）。崩溃点：tmp 写一半 → rename 不会执行 → 原文件/.bak 完好；
  //                  rename 执行中 → 同分区原子，要么旧要么新，无截断。
  writeFileSync(SETTINGS_TMP, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(SETTINGS_TMP, SETTINGS_PATH)
}

/** 后端内部合并写入设置（如 RAG 记录 embeddingDim）——不经过 HTTP。 */
export function updateSettings(patch: Record<string, unknown>): void {
  writeSettings({ ...readSettings(), ...patch })
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
    // 5.5a：providers/providerNodes/moduleMapping 已由 /api/providers、/api/nodes、
    // /api/module-mapping 独立管理，POST /api/settings 不再接受此三键。
    // 过渡期：静默剔除（不报错），向后兼容旧前端一次性整体写入。
    const { providers: _p, providerNodes: _pn, moduleMapping: _mm, ...rest } = body
    const cleanBody = rest
    // 资产目录变更时尝试创建，路径无效则报错让设置页提示
    if (typeof cleanBody.assetDir === 'string' && cleanBody.assetDir.trim()) {
      try {
        mkdirSync(cleanBody.assetDir.trim(), { recursive: true })
      } catch (err) {
        return reply.status(400).send({ error: `资产目录无法创建：${String(err)}` })
      }
    }
    const existing = readSettings()
    writeSettings({ ...existing, ...cleanBody })
    // 资产目录变更 → 让 db 层重算 assetDir 缓存（下次 getDb 关旧库开新库）
    if (typeof cleanBody.assetDir === 'string' && cleanBody.assetDir !== (typeof existing.assetDir === 'string' ? existing.assetDir : '')) {
      invalidateAssetDir()
    }
    return reply.send({ ok: true })
  })

  // 返回当前生效的实际绝对目录（资产 / 图片 / 数据），供设置页展示与「打开目录」。
  // 解析规则与 db.ts/imageArchive.ts 一致：设置项优先，留空回退默认 <dataDir>/assets 或 /images。
  app.get('/api/settings/resolved-paths', async (_req, reply) => {
    const s = readSettings()
    const asset = typeof s.assetDir === 'string' && s.assetDir.trim() ? s.assetDir.trim() : join(DATA_DIR, 'assets')
    const image = typeof s.imageArchiveDir === 'string' && s.imageArchiveDir.trim() ? s.imageArchiveDir.trim() : join(DATA_DIR, 'images')
    return reply.send({ assetDir: asset, imageDir: image, dataDir: DATA_DIR })
  })
}
