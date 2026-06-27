// 图片归档：把生成结果落盘为文件（替代数据库 b64），返回可访问的 /api/image/file/<name> URL。
// 规则：带 alpha 通道 → PNG（保透明）；否则 → WebP（省体积）。文件名 YYYYMMDD（同日重名追加 -2/-3…）。
import sharp from 'sharp'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppDataDir } from './paths'
import { readSettings } from '../routes/settings'

/** 解析归档目录（设置优先，缺省 <dataDir>/images），确保存在。 */
export function getImageArchiveDir(): string {
  const configured = readSettings().imageArchiveDir
  const dir = (typeof configured === 'string' && configured.trim()) ? configured : join(getAppDataDir(), 'images')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 本地日期 YYYYMMDD。 */
function ymd(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

// 取名 + 写入串行化，避免两个并发 done 抢到同一文件名而覆盖。
let writeChain: Promise<unknown> = Promise.resolve()

/** 同日递增取一个不存在的文件名（在串行步骤内调用，无并发竞争）。 */
function pickName(dir: string, ext: string): string {
  const base = ymd()
  let name = `${base}.${ext}`
  let i = 2
  while (existsSync(join(dir, name))) {
    name = `${base}-${i}.${ext}`
    i++
  }
  return name
}

/**
 * 归档一张图片。入参为图片原始字节（Buffer）。
 * 返回 { url, file, format }，url 形如 /api/image/file/20260627.webp，供前端 <img src> 与历史记录加载。
 */
export async function archiveImage(buf: Buffer): Promise<{ url: string; file: string; format: 'png' | 'webp' }> {
  const meta = await sharp(buf).metadata()
  const hasAlpha = meta.hasAlpha === true || meta.channels === 4
  const format: 'png' | 'webp' = hasAlpha ? 'png' : 'webp'
  const out = hasAlpha
    ? await sharp(buf).png().toBuffer()
    : await sharp(buf).webp({ quality: 90 }).toBuffer()

  const result = await (writeChain = writeChain.then(async () => {
    const dir = getImageArchiveDir()
    const name = pickName(dir, format)
    const file = join(dir, name)
    writeFileSync(file, out)
    return { url: `/api/image/file/${encodeURIComponent(name)}`, file, format }
  }))
  return result as { url: string; file: string; format: 'png' | 'webp' }
}

/** 便捷：从 base64（可含 data: 前缀）归档。 */
export async function archiveImageFromB64(b64OrDataUrl: string): Promise<{ url: string; file: string; format: 'png' | 'webp' }> {
  const comma = b64OrDataUrl.indexOf(',')
  const pure = b64OrDataUrl.startsWith('data:') && comma >= 0 ? b64OrDataUrl.slice(comma + 1) : b64OrDataUrl
  return archiveImage(Buffer.from(pure, 'base64'))
}
