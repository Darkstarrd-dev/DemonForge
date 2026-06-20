import type { ImageInputMode } from './types'

export interface ImageHost {
  name: string
  upload: (file: File) => Promise<string>
}

async function uploadToCatbox(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('reqtype', 'fileupload')
  formData.append('fileToUpload', file)

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) throw new Error('Catbox 上传失败')
  return await response.text()
}

async function uploadToLitterbox(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('reqtype', 'fileupload')
  formData.append('time', '24h')
  formData.append('fileToUpload', file)

  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) throw new Error('Litterbox 上传失败')
  return await response.text()
}

async function uploadTo0x0(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('https://0x0.st', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) throw new Error('0x0.st 上传失败')
  return await response.text()
}

async function uploadToTelegraph(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('https://telegra.ph/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) throw new Error('Telegraph 上传失败')
  const json = (await response.json()) as { src?: string }[]
  if (!json?.[0]?.src) throw new Error('Telegraph 返回格式异常')
  return `https://telegra.ph${json[0].src}`
}

export const imageHosts: Record<ImageInputMode, ImageHost> = {
  base64: { name: 'Base64 直传', upload: async () => '' },
  catbox: { name: 'Catbox', upload: uploadToCatbox },
  litterbox: { name: 'Litterbox', upload: uploadToLitterbox },
  '0x0': { name: '0x0.st', upload: uploadTo0x0 },
  telegraph: { name: 'Telegraph', upload: uploadToTelegraph },
}
