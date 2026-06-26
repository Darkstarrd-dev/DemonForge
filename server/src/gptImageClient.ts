// GPT Image 文生图客户端 — OpenAI Images API 同步协议。
// 与 imageClient.ts（ModelScope 异步任务协议）完全独立。
// 后端无状态：每次调用由前端传入 {baseURL, apiKey, model, prompt}。

export interface GptImageConfig {
  baseURL: string
  apiKey?: string
  model: string
  prompt: string
  size?: string
  quality?: string
  background?: string
  moderation?: string
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

/** GPT Image 同步生成：POST /v1/images/generations → 取 b64_json → 封装 data URL。
 * 通过 onEvent 回调上报各阶段；任意阶段失败抛错由调用方处理。 */
export async function generateImageGpt(
  cfg: GptImageConfig,
  onEvent: (type: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<GptImageResult> {
  const base = normalizeBase(cfg.baseURL)

  const body: Record<string, unknown> = { model: cfg.model, prompt: cfg.prompt }
  if (cfg.size) body.size = cfg.size
  if (cfg.quality) body.quality = cfg.quality
  if (cfg.background) body.background = cfg.background
  if (cfg.moderation) body.moderation = cfg.moderation

  onEvent('start', { message: 'GPT Image 生成中...' })
  onEvent('debug', { stage: 'submit', payload: body })

  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.apiKey) },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    onEvent('debug', { stage: 'submit', error: `HTTP ${res.status}: ${text.slice(0, 300)}` })
    throw new Error(`GPT Image 失败 HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

  onEvent('debug', { stage: 'response', response: data })

  const imageData = data.data?.[0]
  if (!imageData) throw new Error('响应中无 image data')

  let dataUrl: string
  if (imageData.b64_json) {
    dataUrl = `data:image/png;base64,${imageData.b64_json}`
  } else if (imageData.url) {
    onEvent('downloading', { message: '下载图片中...' })
    onEvent('debug', { stage: 'fetchImage', response: { url: imageData.url } })
    const imgRes = await fetch(imageData.url, { signal })
    if (!imgRes.ok) throw new Error(`下载图片失败 HTTP ${imgRes.status}`)
    const buf = new Uint8Array(await imgRes.arrayBuffer())
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as unknown as number[])
    }
    dataUrl = `data:image/png;base64,${btoa(bin)}`
  } else {
    throw new Error('响应中既无 b64_json 也无 url')
  }

  const result: GptImageResult = {
    dataUrl,
    revisedPrompt: imageData.revised_prompt,
    usage: data.usage,
  }

  onEvent('done', { image: dataUrl, model: cfg.model, revisedPrompt: result.revisedPrompt, usage: result.usage })
  return result
}