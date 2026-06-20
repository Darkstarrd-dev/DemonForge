import Fastify from 'fastify'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { llmRoutes } from './routes/llm'
import { creationRoutes } from './routes/creation'
import { settingsRoutes, wasLastReadRecovered } from './routes/settings'
import { storeRoutes } from './routes/store'
import { imageRoutes } from './routes/image'
import { importSessionRoutes } from './routes/importSession'
import { getAppDataDir } from './utils/paths'
import { getAssetDir, readAll } from './store/db'

const PORT = Number(process.env.PORT ?? 8787)
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// bodyLimit 提至 50MB：业务数据整本 POST（syncAll 一次性提交全部 books + chapters 含完整正文）。
// Fastify 默认仅 1MB，入库一本真书（章节正文大）会超限 → 413 被拒 → 前端 pushStoreNow 的
// .catch(() => {}) 吞掉错误、message.success 误报「已入库」→ 书只活内存 → 重启后消失。
// 50MB 足够任何规模小说（百万字 UTF-8 ≈ 3MB），同时不至于被滥用。
const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 })

await app.register(llmRoutes)
await app.register(creationRoutes)
await app.register(settingsRoutes)
await app.register(storeRoutes)
await app.register(imageRoutes)
await app.register(importSessionRoutes)
app.get('/api/health', async () => ({ ok: true }))

const killByPidFile = (filename: string) => {
  const pidPath = join(ROOT, filename)
  if (!existsSync(pidPath)) return
  try {
    const pid = readFileSync(pidPath, 'utf-8').trim()
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
  } catch { /* already dead */ }
  try { unlinkSync(pidPath) } catch { /* ignore */ }
}

const killByTitle = (title: string) => {
  try { execSync(`taskkill /FI "WINDOWTITLE eq ${title}" /T /F`, { stdio: 'ignore' }) } catch { }
}

const killFrontendNode = () => {
  const ps1 = join(tmpdir(), 'novelhelper-shutdown.ps1')
  writeFileSync(ps1, 'Get-CimInstance Win32_Process -Filter "name=\'node.exe\'" | Where-Object { $_.CommandLine -like \'*novelhelper*frontend*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }')
  try { execSync(`powershell -ExecutionPolicy Bypass -File "${ps1}"`, { stdio: 'ignore' }) } catch { }
  try { unlinkSync(ps1) } catch { }
}

app.post('/api/shutdown', async (_req, reply) => {
  await reply.send({ ok: true })
  // 先彻底清理前端进程树,最后再杀后端自身进程树 —— 隐藏启动(start.vbs / launch.ps1)下
  // server.pid 指向本进程的 cmd 树根,taskkill /T 会连带杀死正在执行此 handler 的 node,
  // 故必须放在最后,确保前端清理已完成。
  killByPidFile('frontend.pid')
  killByTitle('novelhelper-frontend')
  killFrontendNode()
  killByTitle('novelhelper-server')
  killByPidFile('server.pid')
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
