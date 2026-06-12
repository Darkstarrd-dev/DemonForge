// 编码检测与解码——M1 文档 §3.1 的浏览器端简化实现
// BOM 检测 + UTF-8/GBK 启发式评分；解码尝试链 + U+FFFD 占比验收

export interface EncodingResult {
  encoding: string
  source: 'bom' | 'heuristic' | 'fallback'
}

export const SUPPORTED_ENCODINGS = ['utf-8', 'gbk', 'gb18030', 'big5', 'utf-16le', 'utf-16be']

export function detectEncoding(buf: ArrayBuffer): EncodingResult {
  const bytes = new Uint8Array(buf)
  // BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { encoding: 'utf-8', source: 'bom' }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
    return { encoding: 'utf-16le', source: 'bom' }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff)
    return { encoding: 'utf-16be', source: 'bom' }

  // 启发式评分：前 10000 字节
  const sample = bytes.subarray(0, 10000)
  let utf8Score = 0
  let gbkScore = 0
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i]
    if (b < 0x80) continue
    // UTF-8 多字节序列
    if (b >= 0xe0 && b <= 0xef && i + 2 < sample.length) {
      if ((sample[i + 1] & 0xc0) === 0x80 && (sample[i + 2] & 0xc0) === 0x80) {
        utf8Score += 3
        i += 2
        continue
      }
    } else if (b >= 0xc2 && b <= 0xdf && i + 1 < sample.length) {
      if ((sample[i + 1] & 0xc0) === 0x80) {
        utf8Score += 2
        i += 1
        continue
      }
    }
    // GBK 双字节范围
    if (b >= 0x81 && b <= 0xfe && i + 1 < sample.length) {
      const b2 = sample[i + 1]
      if (b2 >= 0x40 && b2 <= 0xfe && b2 !== 0x7f) {
        gbkScore += 2
        i += 1
      }
    }
  }
  if (utf8Score > gbkScore * 1.5) return { encoding: 'utf-8', source: 'heuristic' }
  if (gbkScore > 0) return { encoding: 'gbk', source: 'heuristic' }
  return { encoding: 'utf-8', source: 'fallback' }
}

/** 按指定编码解码；失败或替换字符过多时沿尝试链降级 */
export function decodeBuffer(buf: ArrayBuffer, encoding: string): { text: string; used: string } {
  const chain = [encoding, 'utf-8', 'gbk', 'gb18030', 'big5'].filter(
    (e, i, arr) => arr.indexOf(e) === i,
  )
  for (const enc of chain) {
    try {
      const text = new TextDecoder(enc, { fatal: false }).decode(buf)
      const bad = (text.match(/�/g) ?? []).length
      if (text.length > 0 && bad / text.length < 0.01) return { text, used: enc }
    } catch {
      // 不支持的编码标签，试下一个
    }
  }
  return { text: new TextDecoder('utf-8').decode(buf), used: 'utf-8' }
}
