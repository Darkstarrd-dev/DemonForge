// 图片工具：解析元信息、复制到剪贴板、保存为不同格式
// 注意：本文件内凡需 DOM 图片对象一律用 window.Image，杜绝与 antd Image 命名冲突

export async function parseImageMeta(dataUrl: string): Promise<{
  format: string
  width: number
  height: number
  hasAlpha?: boolean
}> {
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  const format = match ? match[1].toUpperCase() : 'UNKNOWN'

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const result: { format: string; width: number; height: number; hasAlpha?: boolean } = {
        format,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }

      if (format === 'PNG' && match) {
        try {
          const binary = atob(match[2].slice(0, 64))
          if (binary.length >= 26) {
            const colorType = binary.charCodeAt(25)
            result.hasAlpha = colorType === 4 || colorType === 6
          }
        } catch {
          /* 无法解析 alpha，忽略 */
        }
      }

      resolve(result)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

export async function copyImageToClipboard(dataUrl: string): Promise<boolean> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

export async function saveImageAs(
  dataUrl: string,
  format: 'png' | 'jpeg' | 'webp',
): Promise<void> {
  const ext = format === 'jpeg' ? 'jpg' : format
  const mime = `image/${format}`

  if (format === 'png') {
    const blob = await (await fetch(dataUrl)).blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `image-${Date.now()}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
    return
  }

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      if (format === 'jpeg') {
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, c.width, c.height)
      }
      ctx.drawImage(img, 0, 0)
      c.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'))
            return
          }
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `image-${Date.now()}.${ext}`
          a.click()
          URL.revokeObjectURL(a.href)
          resolve()
        },
        mime,
        0.92,
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}