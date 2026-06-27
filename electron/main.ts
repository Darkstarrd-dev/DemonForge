import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn, execSync, ChildProcess } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

// 在 Windows 上，父级 CMD 控制台默认使用 GBK(936) 代码页，
// 而 Node 以 UTF-8 输出字符串，导致中文乱码。
// 注意：chcp 65001 对 Electron 拉起的子控制台不一定生效，因此下方
// 所有会输出到控制台的字符串一律使用纯 ASCII，避免乱码。
if (process.platform === 'win32' && process.stdout) {
  try {
    if ('setEncoding' in process.stdout) (process.stdout as any).setEncoding?.('utf8')
    execSync('chcp 65001', { windowsHide: true, stdio: 'ignore' })
  } catch {
    /* 切换失败时忽略，不影响启动 */
  }
}

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
let frontendProcess: ChildProcess | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

const BACKEND_PORT = 8787
const FRONTEND_PORT = 5173

/**
 * 判断某个进程的命令行是否属于“本 app 的进程”。
 * 匹配条件：命令行中同时出现 node 运行时与项目相关路径/脚本标记。
 * 这样即便端口被占用，也只会清理属于本 app 的残留进程，
 * 而不会误杀其他恰好使用相同端口的应用。
 */
function isOurAppProcess(commandLine: string): boolean {
  const cmd = commandLine.toLowerCase()
  if (!cmd.includes('node') && !cmd.includes('tsx') && !cmd.includes('electron')) {
    return false
  }
  // 项目自身特征：server / frontend 入口、vite、tsx watch、novelhelper
  return (
    cmd.includes('novelhelper') ||
    cmd.includes('server\\src\\index') ||
    cmd.includes('server/src/index') ||
    cmd.includes('tsx watch') ||
    cmd.includes('vite') ||
    cmd.includes('dist-electron')
  )
}

/**
 * 找到占用指定端口的 PID（通过 netstat）。
 * 返回所有监听该端口的 PID 列表（可能有 IPv4/IPv6 多条）。
 */
function getPidsOnPort(port: number): number[] {
  const pids = new Set<number>()
  try {
    // -aono: 所有连接、不解析名字、显示 Owning PID
    const output = execSync(`netstat -aono`, {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 5000,
    })
    const portStr = `:${port}`
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim()
      // 监听态：proto LocalAddress ForeignAddress State PID
      if (!/\bLISTENING\b/i.test(trimmed)) continue
      if (!trimmed.includes(portStr)) continue
      const match = trimmed.match(/\s+(\d+)\s*$/)
      if (match) {
        const pid = Number(match[1])
        if (pid > 0 && pid !== process.pid) pids.add(pid)
      }
    }
  } catch {
    // netstat 不可用时直接放弃检测
  }
  return [...pids]
}

/**
 * 获取某个 PID 的完整命令行（Windows）。
 */
function getProcessCommandLine(pid: number): string {
  try {
    // 使用 WMIC 读取命令行（兼容性优于 PowerShell）
    const output = execSync(
      `wmic process where ProcessId=${pid} get CommandLine /value`,
      { windowsHide: true, encoding: 'utf8', timeout: 5000 }
    )
    const match = output.match(/CommandLine=(.*)/i)
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

/**
 * 若端口被“本 app 的残留进程”占用，则杀掉该进程树并等待端口释放。
 * 非本 app 进程占用时返回 false（不干预，留给后续 EADDRINUSE 报错）。
 */
function freePortIfHeldByOurApp(port: number, label: string): boolean {
  const pids = getPidsOnPort(port)
  if (pids.length === 0) return false

  const ourPids = pids.filter((pid) => {
    const cmdline = getProcessCommandLine(pid)
    return cmdline && isOurAppProcess(cmdline)
  })

  if (ourPids.length === 0) {
    console.warn(
      `[Port] ${label} port ${port} held by another process (PID: ${pids.join(',')}), skipping`
    )
    return false
  }

  console.log(
    `[Port] ${label} port ${port} held by stale app process (PID: ${ourPids.join(',')}), cleaning up...`
  )
  for (const pid of ourPids) {
    try {
      // /T 连同子进程一起杀，/F 强制结束
      execSync(`taskkill /PID ${pid} /T /F`, {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000,
      })
    } catch {
      /* 可能已被杀掉，忽略 */
    }
  }

  // 轮询等待端口真正释放（最多 ~5s）
  const start = Date.now()
  while (Date.now() - start < 5000) {
    if (getPidsOnPort(port).length === 0) {
      console.log(`[Port] ${label} port ${port} released`)
      return true
    }
    // 同步 sleep 200ms
    execSync('ping 127.0.0.1 -n 1 -w 200 > nul', { windowsHide: true, stdio: 'ignore' })
  }
  console.warn(`[Port] Timed out waiting for ${label} port ${port} to release`)
  return true
}

/**
 * 清理本 app 残留占用的端口（仅 Windows）。
 * 在启动后端/前端服务前调用，避免 EADDRINUSE。
 */
function cleanupStaleAppPorts(): void {
  if (process.platform !== 'win32') return
  freePortIfHeldByOurApp(BACKEND_PORT, 'backend')
  if (isDev) {
    freePortIfHeldByOurApp(FRONTEND_PORT, 'frontend')
  }
}

/**
 * 获取生产模式下 server/frontend 的物理目录。
 * 因 server/dist/** 被打包入 app.asar，子进程（node）无法透明读取 ASAR，
 * 故通过 asarUnpack 将 server/ 与 frontend/dist/ 解压到 app.asar.unpacked/；
 * 手动组装（非 electron-builder）场景则直接使用 resources/app/ 下的目录。
 */
function getProdResourceDir(subdir: string): string {
  const asarUnpacked = join(process.resourcesPath, 'app.asar.unpacked', subdir)
  // asarUnpacked 目录不存在时回退到 resources/app/<subdir>
  return existsSync(asarUnpacked) ? asarUnpacked : join(process.resourcesPath, 'app', subdir)
}

/**
 * 启动后端服务器（Fastify）
 */
function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverDir = isDev
      ? join(ROOT, 'server')
      : getProdResourceDir('server')

    // 开发模式：npm run dev（tsx watch），生产模式：node dist/index.js
    // 生产代码位于 app.asar.unpacked/server/dist/（子进程可读），
    // node_modules 由 extraResources 复制到 resources/node_modules/，
    // Node 沿目录树向上查找即可找到。
    const command = isDev ? 'npm' : 'node'
    const args = isDev
      ? ['run', 'dev']
      : [
          // tsx 处理 tsc 编译输出的 extensionless import 问题
          '--import', 'tsx/esm',
          join(serverDir, 'dist', 'index.js'),
        ]

    backendProcess = spawn(command, args, {
      cwd: serverDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        NODE_ENV: isDev ? 'development' : 'production',
        // 标记运行在 Electron 中
        ELECTRON_APP: '1',
        // 数据目录单一真相源
        NOVELHELPER_DATA_DIR: isDev
          ? join(ROOT, 'server', 'src', 'data')
          : join(homedir(), '.novelhelper'),
      },
      // 生产模式不依赖 shell（直接调用 node 二进制，避免 cmd.exe 依赖）
      shell: isDev,
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
function createWindow(showMenuBar = true) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // preload 用 CommonJS 版（preload.cjs）：Electron 20+ 默认 sandbox: true，
      // 沙箱内预加载脚本不支持 ESM import。详见 electron/preload.cjs 注释。
      preload: join(__dirname, 'preload.cjs'),
    },
    show: false, // 等待加载完成后再显示
    autoHideMenuBar: !showMenuBar,
  })

  // 加载前端页面
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`)
  } else {
    const frontendDir = getProdResourceDir('frontend')
    const indexPath = join(frontendDir, 'dist', 'index.html')
    if (existsSync(indexPath)) {
      mainWindow.loadFile(indexPath)
    } else {
      // Fallback：尝试 resourcesPath 直读（非 asarUnpack 场景）
      const fallbackPath = join(process.resourcesPath, 'frontend', 'dist', 'index.html')
      if (existsSync(fallbackPath)) {
        mainWindow.loadFile(fallbackPath)
      } else {
        mainWindow.loadFile(join(ROOT, 'frontend', 'dist', 'index.html'))
      }
    }
  }

  // 页面加载完成后显示窗口，并立即按当前设置同步菜单栏可见性
  // （构造期 autoHideMenuBar 仅控制隐藏策略，显式 setMenuBarVisibility 确保
  //   「显示」态下菜单栏确实渲染出来，避免某些情况下需手动按 Alt 才出现）
  mainWindow.once('ready-to-show', () => {
    mainWindow?.setMenuBarVisibility(showMenuBar)
    mainWindow?.setAutoHideMenuBar(!showMenuBar)
    mainWindow?.show()
  })

  // 窗口关闭时清理
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 同步清理所有子进程。
 *
 * 关键修复：原实现用 spawn(..., { shell:true }) 拉起后端/前端，捕获的 PID 其实是
 * cmd.exe（npm.cmd 的宿主）。taskkill /T 虽然能杀 cmd 树，但真正的服务进程
 * （npm→tsx watch→node、npm→vite→esbuild worker）常脱离 cmd 树成为孤儿，
 * 故原实现每次关窗都残留进程 → 下次启动总报 "stale app process"。
 *
 * 新策略：
 *  1. 先按已知 PID 同步树杀（execSync，不与 app.quit 抢跑）；
 *  2. 再按端口兜底扫杀（netstat 定位 + 命令行过滤为本 app + taskkill /T /F + 轮询等释放），
 *     专杀脱离 cmd 树的孙进程；
 *  3. 先杀前端，留 ~500ms 缓冲让后端处理完前端关窗前的最后一次 flush（见 appStore
 *     的 beforeunload 落库），再杀后端。
 * 整个流程同步阻塞，确保 app 真正退出前端口已释放。
 */
function cleanupProcessesSync(): void {
  console.log('[Cleanup] Stopping all processes (sync)...')

  // 1. 先杀前端进程树
  if (frontendProcess && frontendProcess.pid) {
    console.log('[Cleanup] Killing frontend process tree...')
    try {
      execSync(`taskkill /PID ${frontendProcess.pid} /T /F`, {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000,
      })
    } catch {
      /* 已退出，忽略 */
    }
    frontendProcess = null
  }

  // 2. 前端端口兜底扫杀（vite / esbuild worker 可能脱离 cmd 树）
  if (process.platform === 'win32' && isDev) {
    freePortIfHeldByOurApp(FRONTEND_PORT, 'frontend')
  }

  // 3. 短暂缓冲：让后端把前端关窗前的最后一次 flush（删除/编辑等）处理完再杀
  if (process.platform === 'win32') {
    try {
      execSync('ping 127.0.0.1 -n 1 -w 500 > nul', { windowsHide: true, stdio: 'ignore' })
    } catch {
      /* ignore */
    }
  }

  // 4. 再杀后端进程树
  if (backendProcess && backendProcess.pid) {
    console.log('[Cleanup] Killing backend process tree...')
    try {
      execSync(`taskkill /PID ${backendProcess.pid} /T /F`, {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000,
      })
    } catch {
      /* 已退出，忽略 */
    }
    backendProcess = null
  }

  // 5. 后端端口兜底扫杀（tsx watch 拉起的 node 子进程可能脱离 cmd 树）
  if (process.platform === 'win32') {
    freePortIfHeldByOurApp(BACKEND_PORT, 'backend')
  }
}

/**
 * 应用启动入口
 */
app.whenReady().then(async () => {
  try {
    // 启动前先清理上次未正常关闭而残留的本 app 进程所占用端口
    cleanupStaleAppPorts()

    console.log('[App] Starting backend...')
    await startBackend()

    if (isDev) {
      console.log('[App] Starting frontend dev server...')
      await startFrontend()
    }

    // 后端已就绪，读取 showMenuBar 设置（默认 true = 显示菜单栏）
    let showMenuBar = true
    try {
      const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/settings`)
      if (res.ok) {
        const d = await res.json() as { showMenuBar?: boolean }
        showMenuBar = d.showMenuBar !== false
      }
    } catch {
      /* 后端读取失败则沿用默认值 */
    }

    // 注册 IPC：前端可实时切换菜单栏可见性
    ipcMain.on('set-menu-bar', (_event, visible: boolean) => {
      mainWindow?.setMenuBarVisibility(visible)
      mainWindow?.setAutoHideMenuBar(!visible)
    })

    // 注册 IPC：前端设置 4K 基准缩放比例
    ipcMain.on('set-zoom-factor', (_event, factor: number) => {
      if (mainWindow && typeof factor === 'number' && factor > 0 && factor <= 5) {
        mainWindow.webContents.setZoomFactor(factor)
      }
    })

    // 注册 IPC：前端请求打开原生目录选择对话框（图片保存目录等），返回所选路径或 null
    ipcMain.handle('dialog:pick-directory', async () => {
      if (!mainWindow) return null
      const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
      if (r.canceled || !r.filePaths.length) return null
      return r.filePaths[0]
    })

    console.log('[App] Creating main window...')
    createWindow(showMenuBar)

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
    app.quit()
  }
})

/**
 * 应用退出前同步清理所有子进程。
 * before-quit 在窗口已关闭、程序即将退出时触发——是同步杀进程的可靠时机。
 */
app.on('before-quit', () => {
  cleanupProcessesSync()
})

// 开发模式下 Ctrl+C / 终端 kill 也走标准退出路径，确保触发 before-quit 清理
process.on('SIGINT', () => app.quit())
process.on('SIGTERM', () => app.quit())
