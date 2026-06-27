// 从 ref/asset/Logo.png 生成应用图标资产：
//   - build/icon.ico（多尺寸，PNG 内嵌，Vista+ ICO 格式）
//   - frontend/public/favicon.png（256×256）
// sharp 取自 server/node_modules（根目录未安装）。
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const require = createRequire(join(root, 'server', 'package.json'))
const sharp = require('sharp')

const SRC = join(root, 'ref', 'asset', 'Logo.png')
const ICO_SIZES = [16, 32, 48, 64, 128, 256]

async function pngBuffer(size) {
  return sharp(SRC).resize(size, size, { fit: 'cover' }).png().toBuffer()
}

function buildIco(images) {
  // images: [{ size, buf }]
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(count, 4)

  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  const bodies = []
  images.forEach((img, i) => {
    const b = 16 * i
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 0) // width (0 => 256)
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 1) // height
    dir.writeUInt8(0, b + 2) // color palette
    dir.writeUInt8(0, b + 3) // reserved
    dir.writeUInt16LE(1, b + 4) // color planes
    dir.writeUInt16LE(32, b + 6) // bits per pixel
    dir.writeUInt32LE(img.buf.length, b + 8) // size in bytes
    dir.writeUInt32LE(offset, b + 12) // offset
    offset += img.buf.length
    bodies.push(img.buf)
  })

  return Buffer.concat([header, dir, ...bodies])
}

const images = []
for (const size of ICO_SIZES) {
  images.push({ size, buf: await pngBuffer(size) })
}
const ico = buildIco(images)
writeFileSync(join(root, 'build', 'icon.ico'), ico)
console.log('wrote build/icon.ico', ico.length, 'bytes,', ICO_SIZES.length, 'sizes')

// 512 PNG 给 electron-builder 作 png 后备 / Linux 等场景
const png512 = await sharp(SRC).resize(512, 512, { fit: 'cover' }).png().toBuffer()
writeFileSync(join(root, 'build', 'icon.png'), png512)
console.log('wrote build/icon.png', png512.length, 'bytes')

// favicon
const fav = await sharp(SRC).resize(256, 256, { fit: 'cover' }).png().toBuffer()
writeFileSync(join(root, 'frontend', 'public', 'favicon.png'), fav)
console.log('wrote frontend/public/favicon.png', fav.length, 'bytes')
