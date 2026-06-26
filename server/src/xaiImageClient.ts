// xAI Imagine 文生图客户端 — xAI Images API 同步协议。
// 与 gptImageClient.ts（GPT Image 同步协议）和 imageClient.ts（ModelScope 异步任务协议）完全独立。
// 后端无状态：每次调用由前端传入 {baseURL, apiKey, model, prompt}。
// 无输入图 → POST /v1/images/generations（JSON，文生图）
// 有输入图 → 同上端点，附加 image_url 参数（data:image/png;base64,... 格式，图生图编辑）
// 内置 3 次自动重试（应对代理端点偶发 500）

const MAX_RETRIES = 3

export interface XaiImageConfig {
  baseURL: string
  apiKey: string
  model: string
  prompt: string
  aspectRatio?: string
  resolution?: string
  n?: number
  /** 输入图片（data URL），用于图生图编辑 */
  imageInputs?: string[]
}

export interface XaiImageResult {
  dataUrl: string
  n?: number
}

function normalizeBase(baseURL: string): string {
  const raw = baseURL.trim()
  const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`http://${raw}`)
  return `${url.origin}/v1`
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` }
}

/** 剥离 b64_json 等大体量字段，供 debug 事件回传（避免 MB 级载荷阻塞前端） */
function stripImagePayload(data: unknown): unknown {
  try {
    const d = data as { data?: Array<Record<string, unknown>> }
    if (Array.isArray(d.data)) {
      return {
        ...d,
        data: d.data.map((item) => ({
          ...item,
          ...(item.b64_json ? { b64_json: `[omitted: ${(item.b64_json as string).length} chars]` } : {}),
        })),
      }
    }
  } catch {
    /* ignore */
  }
  return data
}

/** 将 data URL 转为 data:image/png;base64,... 格式（xAI 要求 PNG MIME 类型前缀） */
function ensurePngDataUri(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/png;base64,')) return dataUrl
  const commaIdx = dataUrl.indexOf(',')
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl
  return `data:image/png;base64,${b64}`
}

/** xAI Imagine 同步生成/编辑：
 * - 无 imageInputs → POST /v1/images/generations（JSON，文生图）
 * - 有 imageInputs → 同上端点，附加 image_url（PNG base64，图生图编辑）
 * 取 b64_json → 封装 data URL；通过 onEvent 回调上报各阶段。
 * 内置 3 次自动重试（仅针对 500 错误）。 */
export async function generateImageXai(
  cfg: XaiImageConfig,
  onEvent: (type: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<XaiImageResult> {
  const base = normalizeBase(cfg.baseURL)
  const hasImages = Array.isArray(cfg.imageInputs) && cfg.imageInputs.length > 0

  onEvent('start', { message: hasImages ? 'xAI Imagine 编辑中...' : 'xAI Imagine 生成中...' })

  const body: Record<string, unknown> = {
    model: cfg.model,
    prompt: cfg.prompt,
    n: cfg.n ?? 1,
    response_format: 'b64_json',
  }
  if (cfg.aspectRatio) body.aspect_ratio = cfg.aspectRatio
  if (cfg.resolution) body.resolution = cfg.resolution
  if (hasImages) {
    body.image_url = ensurePngDataUri(cfg.imageInputs![0])
  }

  let lastError: Error | null = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      onEvent('debug', { stage: 'retry', attempt: attempt + 1, maxRetries: MAX_RETRIES })
    }

    try {
      onEvent('debug', {
        stage: 'submit',
        payload: {
          ...body,
          ...(body.image_url ? { image_url: `[omitted: ${(body.image_url as string).length} chars]` } : {}),
        },
      })

      const res = await fetch(`${base}/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(cfg.apiKey) },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new Error(`xAI Imagine 失败 HTTP ${res.status}: ${text.slice(0, 300)}`)
        // 500 错误重试，其他错误直接抛
        if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
          lastError = err
          onEvent('debug', { stage: 'submit', error: `HTTP ${res.status}（第 ${attempt + 1} 次尝试，将重试）` })
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          continue
        }
        throw err
      }

      const data = (await res.json()) as {
        created?: number
        data?: Array<{ b64_json?: string }>
      }

      onEvent('debug', { stage: 'response', response: stripImagePayload(data) })

      const imageData = data.data?.[0]
      if (!imageData || !imageData.b64_json) throw new Error('响应中无 b64_json 数据')

      const dataUrl = `data:image/png;base64,${imageData.b64_json}`

      const result: XaiImageResult = {
        dataUrl,
        n: data.data?.length,
      }

      onEvent('done', { image: dataUrl, model: cfg.model, n: result.n })
      return result
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError ?? new Error('xAI Imagine 未知错误')
}