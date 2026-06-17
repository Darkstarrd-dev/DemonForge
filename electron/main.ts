import { app, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
let frontendProcess: ChildProcess | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

const BACKEND_PORT = 8787
const FRONTEND_PORT = 5173

/**
 * 启动后端服务器（Fastify）
 */
function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverDir = isDev
      ? join(ROOT, 'server')
      : join(process.resourcesPath, 'server')

    // 开发模式：npm run dev（tsx watch）
    // 生产模式：node dist/index.js
    const command = isDev ? 'npm' : 'node'
    const args = isDev
      ? ['run', 'dev']
      : [join(serverDir, 'dist', 'index.js')]

    backendProcess = spawn(command, args, {
      cwd: serverDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        NODE_ENV: isDev ? 'development' : 'production',
        ELECTRON_APP: '1', // 标记运行在 Electron 中
      },
      shell: true,
    })

    backendProcess.stdout?.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`)
    })

    backendProcess.stderr?.on('data', (data) => {
      console.error(`[Backend Error] ${data.toString().trim()}`)
    })

    backendProcess.on('error', (err) => {
      console.error('[Backend] Process error:', err)
      reject(err)
    })

    backendProcess.on('exit', (code) => {
      console.log(`[Backend] Process exited with code ${code}`)
      backendProcess = null
    })

    // 轮询检测后端启动（health endpoint）
    const checkBackend = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/health`)
        if (res.ok) {
          clearInterval(checkBackend)
          console.log('[Backend] Ready')
          resolve()
        }
      } catch {
        // 继续等待
      }
    }, 500)

    // 超时保护（30s）
    setTimeout(() => {
      clearInterval(checkBackend)
      reject(new Error('Backend startup timeout'))
    }, 30000)
  })
}

/**
 * 启动前端开发服务器（仅开发模式）
 */
function startFrontend(): Promise<void> {
  if (!isDev) {
    // 生产模式直接加载构建产物，无需启动开发服务器
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const frontendDir = join(ROOT, 'frontend')

    frontendProcess = spawn('npm', ['run', 'dev'], {
      cwd: frontendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    frontendProcess.stdout?.on('data', (data) => {
      console.log(`[Frontend] ${data.toString().trim()}`)
    })

    frontendProcess.stderr?.on('data', (data) => {
      console.error(`[Frontend Error] ${data.toString().trim()}`)
    })

    frontendProcess.on('error', (err) => {
      console.error('[Frontend] Process error:', err)
      reject(err)
    })

    frontendProcess.on('exit', (code) => {
      console.log(`[Frontend] Process exited with code ${code}`)
      frontendProcess = null
    })

    // 轮询检测前端启动
    const checkFrontend = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${FRONTEND_PORT}`)
        if (res.ok) {
          clearInterval(checkFrontend)
          console.log('[Frontend] Ready')
          resolve()
        }
      } catch {
        // 继续等待
      }
    }, 500)

    // 超时保护（30s）
    setTimeout(() => {
      clearInterval(checkFrontend)
      reject(new Error('Frontend startup timeout'))
    }, 30000)
  })
}

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false, // 等待加载完成后再显示
    autoHideMenuBar: true,
  })

  // 加载前端页面
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`)
    mainWindow.webContents.openDevTools() // 开发模式打开 DevTools
  } else {
    const indexPath = join(process.resourcesPath, 'frontend', 'dist', 'index.html')
    if (existsSync(indexPath)) {
      mainWindow.loadFile(indexPath)
    } else {
      // Fallback：开发构建
      mainWindow.loadFile(join(ROOT, 'frontend', 'dist', 'index.html'))
    }
  }

  // 页面加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 窗口关闭时清理
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 清理所有子进程
 */
function cleanupProcesses() {
  console.log('[Cleanup] Stopping all processes...')

  if (backendProcess && !backendProcess.killed) {
    console.log('[Cleanup] Killing backend process...')
    backendProcess.kill('SIGTERM')
    // 强制杀死（Windows 需要 taskkill）
    if (process.platform === 'win32' && backendProcess.pid) {
      try {
        spawn('taskkill', ['/PID', String(backendProcess.pid), '/T', '/F'], { shell: true })
      } catch (err) {
        console.error('[Cleanup] Failed to kill backend:', err)
      }
    }
  }

  if (frontendProcess && !frontendProcess.killed) {
    console.log('[Cleanup] Killing frontend process...')
    frontendProcess.kill('SIGTERM')
    if (process.platform === 'win32' && frontendProcess.pid) {
      try {
        spawn('taskkill', ['/PID', String(frontendProcess.pid), '/T', '/F'], { shell: true })
      } catch (err) {
        console.error('[Cleanup] Failed to kill frontend:', err)
      }
    }
  }
}

/**
 * 应用启动入口
 */
app.whenReady().then(async () => {
  try {
    console.log('[App] Starting backend...')
    await startBackend()

    if (isDev) {
      console.log('[App] Starting frontend dev server...')
      await startFrontend()
    }

    console.log('[App] Creating main window...')
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (err) {
    console.error('[App] Startup failed:', err)
    app.quit()
  }
})

/**
 * 所有窗口关闭时退出应用（macOS 除外）
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupProcesses()
    app.quit()
  }
})

/**
 * 应用退出前清理
 */
app.on('before-quit', () => {
  cleanupProcesses()
})

/**
 * 应用即将退出时的最后清理
 */
app.on('will-quit', (event) => {
  // 确保所有进程都已停止
  if ((backendProcess && !backendProcess.killed) || (frontendProcess && !frontendProcess.killed)) {
    event.preventDefault()
    cleanupProcesses()
    setTimeout(() => {
      app.quit()
    }, 1000)
  }
})
