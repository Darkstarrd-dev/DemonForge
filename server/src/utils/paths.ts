import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 获取应用数据目录
 * 开发模式：项目根目录下的 server/data
 * 生产模式：用户目录下的 .novelhelper
 */
export function getAppDataDir(): string {
  const isDev = process.env.NODE_ENV === 'development' || !process.env.ELECTRON_APP

  if (isDev) {
    // 开发模式：使用项目目录
    const __dirname = dirname(fileURLToPath(import.meta.url))
    return join(__dirname, '..', 'data')
  }

  // 生产模式：使用用户目录
  return join(homedir(), '.novelhelper')
}
