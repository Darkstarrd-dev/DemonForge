// GPT Image 文生图客户端 — OpenAI Images API 同步协议。
// 与 imageClient.ts（ModelScope 异步任务协议）完全独立。
// 后端无状态：每次调用由前端传入 {baseURL, apiKey, model, prompt}。
// 无输入图 → POST /v1/images/generations（JSON，文生图）
// 1+ 输入图 → POST /v1/images/edits（multipart，多图推理/图生图，gpt-image 支持 ≤16 张）
import { archiveImage } from './utils/imageArchive'

export interface GptImageConfig {
  baseURL: string
  apiKey?: string
  model: string
  prompt: string
  size?: string
  quality?: string
  background?: string
  moderation?: string
  /** 输入图片（data URL），1+ 张时走 /images/edits 多图推理 */
  imageInputs?: string[]
}

export interface GptImageResult {
  dataUrl: string
  revisedPrompt?: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

function normalizeBase(baseURL: string): string {
  const raw = baseURL.trim()
  const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`http://${raw}`)
  return `${url.origin}/v1`
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

/** data URL → Blob（用于 multipart 编辑请求） */
function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(',')
  const meta = commaIdx >= 0 ? dataUrl.slice(0, commaIdx) : ''
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : ''
  const mime = /data:(.*?);/.exec(meta)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** 剥离 b64_json/url 等大体量字段，供 debug 事件回传（避免 MB 级载荷阻塞前端） */
function stripImagePayload(data: unknown): unknown {
  try {
    const d = data as { data?: Array<Record<string, unknown>> }
    if (Array.isArray(d.data)) {
      return {
        ...d,
        data: d.data.map((item) => ({
          ...item,
          ...(item.b64_json ? { b64_json: `[omitted: ${(item.b64_json as string).length} chars]` } : {}),
          ...(item.url ? { url: '[omitted]' } : {}),
        })),
      }
    }
  } catch {
    /* ignore */
  }
  return data
}

/** GPT Image 同步生成/编辑：
 * - 无 imageInputs → POST /v1/images/generations（JSON，文生图）
 * - 1+ imageInputs → POST /v1/images/edits（multipart，多图推理/图生图）
 * 取 b64_json → 封装 data URL；通过 onEvent 回调上报各阶段；任意阶段失败抛错由调用方处理。 */
export async function generateImageGpt(
  cfg: GptImageConfig,
  onEvent: (type: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<GptImageResult> {
  const base = normalizeBase(cfg.baseURL)
  const hasImages = Array.isArray(cfg.imageInputs) && cfg.imageInputs.length > 0

  onEvent('start', { message: hasImages ? 'GPT Image 编辑中...' : 'GPT Image 生成中...' })

  let res: Response
  if (hasImages) {
    // /images/edits 多图推理（multipart/form-data）
    const fd = new FormData()
    cfg.imageInputs!.forEach((du, i) => {
      fd.append('image', dataUrlToBlob(du), `input-${i}.png`)
    })
    fd.append('model', cfg.model)
    fd.append('prompt', cfg.prompt)
    if (cfg.size) fd.append('size', cfg.size)
    if (cfg.quality) fd.append('quality', cfg.quality)
    if (cfg.background) fd.append('background', cfg.background)
    if (cfg.moderation) fd.append('moderation', cfg.moderation)
    // FormData 无法序列化，debug 用摘要对象
    onEvent('debug', {
      stage: 'submit',
      payload: { endpoint: '/images/edits', model: cfg.model, prompt: cfg.prompt, size: cfg.size, imageCount: cfg.imageInputs!.length },
    })
    res = await fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: authHeaders(cfg.apiKey),
      body: fd,
      signal,
    })
  } else {
    // /images/generations 文生图（JSON）
    const body: Record<string, unknown> = { model: cfg.model, prompt: cfg.prompt }
    if (cfg.size) body.size = cfg.size
    if (cfg.quality) body.quality = cfg.quality
    if (cfg.background) body.background = cfg.background
    if (cfg.moderation) body.moderation = cfg.moderation
    onEvent('debug', { stage: 'submit', payload: body })
    res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.apiKey) },
      body: JSON.stringify(body),
      signal,
    })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    onEvent('debug', { stage: 'submit', error: `HTTP ${res.status}: ${text.slice(0, 300)}` })
    throw new Error(`GPT Image 失败 HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

  onEvent('debug', { stage: 'response', response: stripImagePayload(data) })

  const imageData = data.data?.[0]
  if (!imageData) throw new Error('响应中无 image data')

  // 取图字节：优先远程 url（下载二进制，省去 MB 级 b64_json 的 JSON 传输/解析），b64_json 兜底
  let imgBuf: Buffer
  if (imageData.url) {
    onEvent('downloading', { message: '下载图片中...' })
    onEvent('debug', { stage: 'fetchImage', response: { url: imageData.url } })
    const imgRes = await fetch(imageData.url, { signal })
    if (!imgRes.ok) throw new Error(`下载图片失败 HTTP ${imgRes.status}`)
    imgBuf = Buffer.from(await imgRes.arrayBuffer())
  } else if (imageData.b64_json) {
    imgBuf = Buffer.from(imageData.b64_json, 'base64')
  } else {
    throw new Error('响应中既无 url 也无 b64_json')
  }

  // 落盘归档（带 alpha→png，否则→webp），回传文件 URL 而非 b64 dataUrl
  const { url } = await archiveImage(imgBuf)

  const result: GptImageResult = {
    dataUrl: url,
    revisedPrompt: imageData.revised_prompt,
    usage: data.usage,
  }

  onEvent('done', { image: url, model: cfg.model, revisedPrompt: result.revisedPrompt, usage: result.usage })
  return result
}
