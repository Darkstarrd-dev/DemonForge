import Fastify from 'fastify'
import cors from '@fastify/cors'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { llmRoutes } from './routes/llm'
import { creationRoutes } from './routes/creation'
import { settingsRoutes, wasLastReadRecovered } from './routes/settings'
import { storeRoutes } from './routes/store'
import { imageRoutes } from './routes/image'
import { gptImageRoutes } from './routes/gptImage'
import { xaiImageRoutes } from './routes/xaiImage'
import { importSessionRoutes } from './routes/importSession'
import { chatRoutes } from './routes/chat'
import { getAppDataDir } from './utils/paths'
import { getAssetDir, readAll } from './store/db'
import { migrateImageB64Purge } from './store/migrateImageB64'
import { killProcessTree } from './platform/processKiller'

const PORT = Number(process.env.PORT ?? 8787)
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// bodyLimit 提至 50MB：业务数据整本 POST（syncAll 一次性提交全部 books + chapters 含完整正文）。
// Fastify 默认仅 1MB，入库一本真书（章节正文大）会超限 → 413 被拒 → 前端 pushStoreNow 的
// .catch(() => {}) 吞掉错误、message.success 误报「已入库」→ 书只活内存 → 重启后消失。
// 50MB 足够任何规模小说（百万字 UTF-8 ≈ 3MB），同时不至于被滥用。
const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 })

// CORS：本机单用户应用，后端仅绑定 127.0.0.1（外网不可达）。
// ⚠️ 必须显式列出 methods：@fastify/cors 默认仅 'GET,HEAD,POST'，不含 DELETE。
//   Electron 下 main.tsx 把 /api/* 改写为直连 127.0.0.1:8787（跨域）→ DELETE 走预检，
//   默认白名单无 DELETE → 浏览器拦截真正的 DELETE（fetch 静默 reject）→ 删除永不落库、重启复活。
// origin 放行三类：① 开发服务器（loadURL http://localhost:5173）；② 打包版 file://（跨域 fetch
//   的 Origin 为字符串 'null'）；③ 无 Origin 的请求（同源/非浏览器）。其余（任意网站）一律拒绝，
//   避免本机后端被用户浏览器里的恶意页面访问。
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || origin === 'null' || ALLOWED_ORIGINS.has(origin)) cb(null, true)
    else cb(null, false)
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
})

await app.register(llmRoutes)
await app.register(creationRoutes)
await app.register(settingsRoutes)
await app.register(storeRoutes)
await app.register(imageRoutes)
await app.register(gptImageRoutes)
await app.register(xaiImageRoutes)
await app.register(importSessionRoutes)
await app.register(chatRoutes)
app.get('/api/health', async () => ({ ok: true }))

app.post('/api/shutdown', async (_req, reply) => {
  await reply.send({ ok: true })
  // 杀进程树（先前端、后后端自身）逻辑见 platform/processKiller.ts。
  killProcessTree(ROOT)
  process.exit(0)
})

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
  // 启动即打印实际数据目录与状态，便于诊断"入库数据丢失"类问题。
  // 数据目录漂移曾导致 db 分裂散落；settings.json 损坏曾导致全配置静默丢失。
  const assetDir = getAssetDir()
  app.log.info(`[data-dir] settings/json at: ${getAppDataDir()}`)
  app.log.info(`[data-dir] asset db dir:   ${assetDir}`)
  app.log.info(`[data-dir] settings from .bak: ${wasLastReadRecovered() ? 'YES (主文件可能损坏)' : 'no'}`)
  // 一次性迁移：清除 DB 内既有 b64 图片（图片已改落盘归档）。守卫确保仅执行一次。
  try {
    migrateImageB64Purge()
  } catch (err) {
    app.log.warn(`[migrate] b64 清除异常：${String(err)}`)
  }
  // 各业务表行数概览——排查"书库又空了"的第一手信息
  let summary: string
  try {
    const all = readAll()
    summary = Object.entries(all)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : '?'}`)
      .join(' / ')
  } catch (err) {
    summary = `readAll 失败：${String(err)}`
  }
  app.log.info(`[data-dir] tables: ${summary}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
