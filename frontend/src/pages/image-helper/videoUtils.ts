// 视频帧提取
export async function extractVideoFrames(
  video: HTMLVideoElement,
  fps: number,
  onProgress?: (current: number, total: number) => void
): Promise<Array<{ canvas: HTMLCanvasElement; delay: number }>> {
  const duration = video.duration
  if (!duration || duration === Infinity) {
    throw new Error('视频格式不支持或无法获取时长')
  }

  const frameInterval = 1 / fps
  const frames: Array<{ canvas: HTMLCanvasElement; delay: number }> = []
  const totalFrames = Math.floor(duration * fps)
  let currentFrame = 0

  for (let t = 0; t < duration; t += frameInterval) {
    await new Promise<void>((resolve) => {
      video.currentTime = t
      const onSeek = () => {
        video.removeEventListener('seeked', onSeek)
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d')!.drawImage(video, 0, 0)

        frames.push({
          canvas,
          delay: Math.floor(1000 / fps)
        })

        currentFrame++
        if (onProgress) {
          onProgress(currentFrame, totalFrames)
        }

        resolve()
      }
      video.addEventListener('seeked', onSeek)
    })
  }

  return frames
}

// 加载视频文件
export function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true

    video.onloadedmetadata = () => {
      resolve(video)
    }

    video.onerror = () => {
      reject(new Error('视频加载失败'))
    }
  })
}
