// 文生图客户端（P0 起点）—— ModelScope 异步任务协议。
// 与 llmClient.ts（OpenAI 兼容）分离：文生图走 ModelScope 独有的「提交任务 → 轮询 → 取图」流程。
// 后端无状态：每次调用由前端传入 {baseURL, apiKey, model, prompt}，这里只做协议适配与转发。

export interface ImageGenConfig {
  baseURL: string
  apiKey: string
  model: string
  prompt: string
}

/** 规范化 baseURL：提取 origin，去尾斜杠（ModelScope 路径自拼 /v1） */
function normalizeBase(baseURL: string): string {
  const raw = baseURL.trim()
  const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`http://${raw}`)
  return url.origin
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 探测图片 MIME；不识别时回退 image/jpeg */
function sniffMime(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
    return 'image/webp'
  return 'image/jpeg'
}

export interface ImageEventPayloads {
  submitted: { taskId: string }
  polling: { status: string; attempt: number }
  done: { image: string; model: string }
}

export type ImageEventType = keyof ImageEventPayloads

/** ModelScope 文生图：提交任务 → 轮询状态 → 成功后取图转 base64 data URL。
 *  通过 onEvent 回调上报各阶段；任意阶段失败抛错由调用方处理。
 *  signal abort 时立即中止（fetch / 轮询循环都会感知）。 */
export async function generateImageModelScope<K extends ImageEventType>(
  cfg: ImageGenConfig,
  onEvent: (type: K, data: ImageEventPayloads[K]) => void,
  signal?: AbortSignal,
): Promise<void> {
  const base = normalizeBase(cfg.baseURL)
  const POLL_INTERVAL_MS = 3000
  const MAX_POLL_MS = 120_000

  // 1) 提交任务
  const submitRes = await fetch(`${base}/v1/images/generations`, {
    method: 'POST',
    headers: {
      ...authHeaders(cfg.apiKey),
      'Content-Type': 'application/json',
      'X-ModelScope-Async-Mode': 'true',
    },
    body: JSON.stringify({ model: cfg.model, prompt: cfg.prompt }),
    signal,
  })
  if (!submitRes.ok) {
    const body = await submitRes.text().catch(() => '')
    throw new Error(`提交任务失败：HTTP ${submitRes.status} ${submitRes.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`)
  }
  const submitData = (await submitRes.json()) as { task_id?: string }
  const taskId = submitData.task_id
  if (!taskId) throw new Error('提交任务成功，但未返回 task_id')
  onEvent('submitted' as K, { taskId } as ImageEventPayloads[K])

  // 2) 轮询状态
  const startedAt = Date.now()
  let attempt = 0
  let lastStatus = 'PENDING'
  for (;;) {
    if (signal?.aborted) throw new DOMException('用户取消', 'AbortError')
    if (Date.now() - startedAt > MAX_POLL_MS) throw new Error(`轮询超时（>${MAX_POLL_MS / 1000}s），任务 ${taskId}`)

    const pollRes = await fetch(`${base}/v1/tasks/${taskId}`, {
      headers: {
        ...authHeaders(cfg.apiKey),
        'X-ModelScope-Task-Type': 'image_generation',
      },
      signal,
    })
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => '')
      throw new Error(`查询任务失败：HTTP ${pollRes.status} ${pollRes.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`)
    }
    const data = (await pollRes.json()) as {
      task_status?: string
      output_images?: string[]
      errors?: unknown
    }
    lastStatus = data.task_status ?? 'UNKNOWN'
    attempt += 1
    onEvent('polling' as K, { status: lastStatus, attempt } as ImageEventPayloads[K])

    if (data.task_status === 'SUCCEED') {
      const imgUrl = data.output_images?.[0]
      if (!imgUrl) throw new Error('任务成功，但未返回 output_images')
      // 3) 取图并转 base64 data URL
      const imgRes = await fetch(imgUrl, { signal })
      if (!imgRes.ok) throw new Error(`下载图片失败：HTTP ${imgRes.status} ${imgRes.statusText}`)
      const buf = new Uint8Array(await imgRes.arrayBuffer())
      const mime = sniffMime(buf)
      let bin = ''
      const chunk = 0x8000
      for (let i = 0; i < buf.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as unknown as number[])
      }
      const dataUrl = `data:${mime};base64,${btoa(bin)}`
      onEvent('done' as K, { image: dataUrl, model: cfg.model } as ImageEventPayloads[K])
      return
    }
    if (data.task_status === 'FAILED') {
      const detail = data.errors ? JSON.stringify(data.errors) : ''
      throw new Error(`生成失败（任务 ${taskId}）${detail ? `：${detail}` : ''}`)
    }
    // PENDING / RUNNING → 继续轮询
    await sleep(POLL_INTERVAL_MS)
  }
}
