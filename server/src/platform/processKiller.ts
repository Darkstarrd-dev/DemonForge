// 进程清理（Windows）—— 从 index.ts 抽出（A-14）。
// 退出时按「先前端、后后端」顺序杀进程树：隐藏启动（start.vbs / launch.ps1）下 server.pid
// 指向本进程的 cmd 树根，taskkill /T 会连带杀死正在执行 shutdown handler 的 node，
// 故后端自身（server.pid）必须放最后，确保前端清理已完成。
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const killByPidFile = (root: string, filename: string) => {
  const pidPath = join(root, filename)
  if (!existsSync(pidPath)) return
  try {
    const pid = readFileSync(pidPath, 'utf-8').trim()
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
  } catch { /* already dead */ }
  try { unlinkSync(pidPath) } catch { /* ignore */ }
}

const killByTitle = (title: string) => {
  try { execSync(`taskkill /FI "WINDOWTITLE eq ${title}" /T /F`, { stdio: 'ignore' }) } catch { /* ignore */ }
}

const killFrontendNode = () => {
  const ps1 = join(tmpdir(), 'novelhelper-shutdown.ps1')
  writeFileSync(ps1, 'Get-CimInstance Win32_Process -Filter "name=\'node.exe\'" | Where-Object { $_.CommandLine -like \'*novelhelper*frontend*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }')
  try { execSync(`powershell -ExecutionPolicy Bypass -File "${ps1}"`, { stdio: 'ignore' }) } catch { /* ignore */ }
  try { unlinkSync(ps1) } catch { /* ignore */ }
}

/** 退出清理：先彻底清前端进程树，最后杀后端自身（含本进程树根，故放最后）。root = 项目根（用于定位 pid 文件）。 */
export const killProcessTree = (root: string) => {
  killByPidFile(root, 'frontend.pid')
  killByTitle('novelhelper-frontend')
  killFrontendNode()
  killByTitle('novelhelper-server')
  killByPidFile(root, 'server.pid')
}
