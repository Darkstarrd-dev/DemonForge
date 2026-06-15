import Fastify from 'fastify'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { llmRoutes } from './routes/llm.ts'

const PORT = Number(process.env.PORT ?? 8787)
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const app = Fastify({ logger: true })

await app.register(llmRoutes)
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
  killByPidFile('frontend.pid')
  killByPidFile('server.pid')
  killByTitle('novelhelper-server')
  killByTitle('novelhelper-frontend')
  killFrontendNode()
  process.exit(0)
})

try {
  await app.listen({ port: PORT, host: '127.0.0.1' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
