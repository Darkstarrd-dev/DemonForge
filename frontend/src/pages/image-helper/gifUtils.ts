import GIF from 'gif.js'
import { GifReader } from 'omggif'

export interface GifFrame {
  canvas: HTMLCanvasElement
  delay: number
}

// GIF解析
export async function parseGifFile(file: File): Promise<GifFrame[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const buffer = new Uint8Array(evt.target?.result as ArrayBuffer)
        const gr = new GifReader(buffer)
        const w = gr.width
        const h = gr.height

        const frameCanvas = document.createElement('canvas')
        frameCanvas.width = w
        frameCanvas.height = h
        const frameCtx = frameCanvas.getContext('2d')!
        const frameData = frameCtx.createImageData(w, h)

        const frames: GifFrame[] = []
        let prevDisposal = 0

        for (let i = 0; i < gr.numFrames(); i++) {
          const info = gr.frameInfo(i)

          if (prevDisposal === 2) {
            // Simple disposal handling
          }

          gr.decodeAndBlitFrameRGBA(i, frameData.data)

          const tempCvs = document.createElement('canvas')
          tempCvs.width = w
          tempCvs.height = h
          const tempCtx = tempCvs.getContext('2d')!
          tempCtx.putImageData(frameData, 0, 0)

          if (i === 0) {
            frameCtx.clearRect(0, 0, w, h)
          } else if (info.disposal === 2) {
            frameCtx.clearRect(info.x, info.y, info.width, info.height)
          }

          frameCtx.drawImage(tempCvs, 0, 0, w, h, 0, 0, w, h)

          const finalCvs = document.createElement('canvas')
          finalCvs.width = w
          finalCvs.height = h
          finalCvs.getContext('2d')!.drawImage(frameCanvas, 0, 0)

          frames.push({
            canvas: finalCvs,
            delay: info.delay * 10 || 100
          })
          prevDisposal = info.disposal
        }

        resolve(frames)
      } catch (err: any) {
        reject(new Error('GIF 解析失败: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

// GIF导出
export async function exportGif(
  frames: Array<{ canvas: HTMLCanvasElement; delay: number }>,
  width: number,
  height: number,
  quality: number,
  transparent: boolean,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  return new Promise((resolve, _reject) => {
    // Create worker blob inline to avoid path issues
    const workerBlob = new Blob(
      [`importScripts('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');`],
      { type: 'application/javascript' }
    )
    const workerUrl = URL.createObjectURL(workerBlob)

    const gifOptions: any = {
      workers: 4,
      quality: quality,
      width: width,
      height: height,
      workerScript: workerUrl
    }

    if (transparent) {
      gifOptions.transparent = 0xFF00FF
    }

    const gif = new GIF(gifOptions)

    frames.forEach((frame) => {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = width
      tempCanvas.height = height
      const ctx = tempCanvas.getContext('2d')!

      if (transparent) {
        ctx.fillStyle = '#FF00FF'
        ctx.fillRect(0, 0, width, height)
      }

      ctx.drawImage(frame.canvas, 0, 0, width, height)
      gif.addFrame(tempCanvas, { delay: frame.delay })
    })

    if (onProgress) {
      gif.on('progress', onProgress)
    }

    gif.on('finished', (blob) => {
      URL.revokeObjectURL(workerUrl)
      resolve(blob)
    })

    gif.render()
  })
}
