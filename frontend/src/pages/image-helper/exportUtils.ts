import JSZip from 'jszip'

// ZIP序列帧导出
export async function exportZip(
  frames: Array<{ canvas: HTMLCanvasElement; delay: number }>,
  width: number,
  height: number,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const zip = new JSZip()

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height
    const ctx = tempCanvas.getContext('2d')!
    ctx.drawImage(frame.canvas, 0, 0, width, height)

    const blob = await new Promise<Blob>((resolve) => {
      tempCanvas.toBlob((b) => resolve(b!), 'image/png')
    })

    const fileName = `frame_${String(i + 1).padStart(3, '0')}.png`
    zip.file(fileName, blob)

    if (onProgress) {
      onProgress(i + 1, frames.length)
    }
  }

  return await zip.generateAsync({ type: 'blob' })
}

// Sprite Sheet导出
export function exportSpriteSheet(
  frames: Array<{ canvas: HTMLCanvasElement; delay: number }>,
  rows: number,
  cols: number,
  itemW: number,
  itemH: number
): string {
  const canvas = document.createElement('canvas')
  canvas.width = cols * itemW
  canvas.height = rows * itemH
  const ctx = canvas.getContext('2d')!

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c
      if (index >= frames.length) break

      const frame = frames[index]
      ctx.drawImage(
        frame.canvas,
        0, 0, frame.canvas.width, frame.canvas.height,
        c * itemW, r * itemH, itemW, itemH
      )
    }
  }

  return canvas.toDataURL('image/png')
}
