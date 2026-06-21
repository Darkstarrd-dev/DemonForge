/**
 * UI 自动化测试脚本 - 截图并评估布局
 * 通过 Electron 应用自动调整窗口大小、导航到各个页面并截图
 */

import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

// 测试配置
const TEST_CONFIGS = [
  { width: 1920, height: 1080, label: 'desktop-large' },
  { width: 1366, height: 768, label: 'laptop-medium' },
  { width: 1280, height: 720, label: 'laptop-small' },
]

const TEST_ROUTES = [
  { path: '/', name: 'home' },
  { path: '/m0', name: 'm0-architecture' },
  { path: '/m1', name: 'm1-import' },
  { path: '/m4', name: 'm4-generate' },
  { path: '/m5', name: 'm5-chapters' },
  { path: '/batch', name: 'batch-generate' },
  { path: '/role-chat', name: 'role-chat' },
  { path: '/settings', name: 'settings' },
]

const SCREENSHOTS_DIR = join(ROOT, 'screenshots')

// 确保截图目录存在
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true })
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 通过 Chrome DevTools Protocol 连接到 Electron 应用
 */
async function connectToElectron(debugPort = 9222) {
  // 等待调试端口就绪
  let retries = 20
  while (retries > 0) {
    try {
      const res = await fetch(`http://localhost:${debugPort}/json/version`)
      if (res.ok) {
        console.log('[CDP] Connected to Electron debugger')
        break
      }
    } catch (e) {
      retries--
      if (retries === 0) throw new Error('Failed to connect to Electron debugger')
      await sleep(500)
    }
  }

  // 获取页面列表
  const listRes = await fetch(`http://localhost:${debugPort}/json/list`)
  const pages = await listRes.json()
  const mainPage = pages.find(p => p.type === 'page')

  if (!mainPage) {
    throw new Error('No page found in Electron')
  }

  return mainPage.webSocketDebuggerUrl
}

/**
 * WebSocket 客户端封装
 */
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.messageId = 1
    this.callbacks = new Map()
  }

  async connect() {
    return new Promise(async (resolve, reject) => {
      const { default: WebSocket } = await import('ws')
      this.ws = new WebSocket(this.wsUrl)

      this.ws.on('open', () => {
        console.log('[CDP] WebSocket connected')
        resolve()
      })

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id)
          this.callbacks.delete(msg.id)
          if (msg.error) {
            reject(new Error(msg.error.message))
          } else {
            resolve(msg.result)
          }
        }
      })

      this.ws.on('error', reject)
    })
  }

  async send(method, params = {}) {
    const id = this.messageId++
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))

      // 超时保护
      setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id)
          reject(new Error(`Timeout waiting for ${method}`))
        }
      }, 30000)
    })
  }

  close() {
    if (this.ws) {
      this.ws.close()
    }
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  console.log('[Test] Starting UI test suite...')

  // 启动 Electron 应用（开发模式，带远程调试）
  const electronProcess = spawn('npx', ['electron', '.', '--remote-debugging-port=9222'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  })

  try {
    // 等待应用启动
    console.log('[Test] Waiting for Electron to start...')
    await sleep(8000) // 等待前后端服务器启动

    // 连接到调试端口
    const wsUrl = await connectToElectron(9222)
    const client = new CDPClient(wsUrl)
    await client.connect()

    // 启用必要的 domains
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    })

    const results = []

    // 遍历所有测试配置
    for (const config of TEST_CONFIGS) {
      console.log(`\n[Test] Testing ${config.label} (${config.width}x${config.height})`)

      // 调整窗口大小
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: config.width,
        height: config.height,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await sleep(500)

      // 遍历所有路由
      for (const route of TEST_ROUTES) {
        console.log(`  [Route] ${route.name} (${route.path})`)

        // 导航到路由
        await client.send('Runtime.evaluate', {
          expression: `window.location.hash = '${route.path}'`,
        })
        await sleep(2000) // 等待页面渲染

        // 截图
        const screenshot = await client.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
        })

        const filename = `${config.label}-${route.name}.png`
        const filepath = join(SCREENSHOTS_DIR, filename)
        writeFileSync(filepath, Buffer.from(screenshot.data, 'base64'))
        console.log(`    ✓ Screenshot saved: ${filename}`)

        results.push({
          viewport: config.label,
          route: route.name,
          path: route.path,
          screenshot: filename,
        })
      }
    }

    // 保存测试结果清单
    const manifest = {
      timestamp: new Date().toISOString(),
      configs: TEST_CONFIGS,
      routes: TEST_ROUTES,
      results,
    }
    writeFileSync(
      join(SCREENSHOTS_DIR, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    )

    console.log('\n[Test] All screenshots captured successfully!')
    console.log(`[Test] Results saved to: ${SCREENSHOTS_DIR}`)

    client.close()
  } catch (error) {
    console.error('[Test] Error during test:', error)
  } finally {
    // 关闭 Electron
    electronProcess.kill()
  }
}

// 运行测试
runTests().catch(console.error)
