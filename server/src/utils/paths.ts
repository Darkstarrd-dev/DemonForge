import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 获取应用数据目录
 * 优先级：① Electron 主进程经 NOVELHELPER_DATA_DIR 明确指定（单一真相源）→
 *        ② 回退到环境判断（向后兼容，非 Electron 直跑时）。
 *
 * 历史教训：此前仅靠 import.meta.url 相对解析，tsx(跑 src) 与 node(跑 dist) 会解析到
 * 不同子目录（server/src/data vs server/dist/data），早期版本甚至解析到项目根 assets/，
 * 导致 db 文件分裂散落、入库数据"重启消失"。改由主进程经环境变量统一锚定，杜绝漂移。
 */
export function getAppDataDir(): string {
  if (process.env.NOVELHELPER_DATA_DIR) return process.env.NOVELHELPER_DATA_DIR

  const isDev = process.env.NODE_ENV === 'development' || !process.env.ELECTRON_APP

  if (isDev) {
    // 开发模式：使用项目目录
    const __dirname = dirname(fileURLToPath(import.meta.url))
    return join(__dirname, '..', 'data')
  }

  // 生产模式：使用用户目录
  return join(homedir(), '.novelhelper')
}
