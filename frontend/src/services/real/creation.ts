// 创作类真实服务层（阶段 B：起源流程）——经后端 /api/llm/{arch,blueprint} 网关调用。
// SSE 客户端解析复用 real/llm.ts 的 reader/decoder/\n\n event 解析范式。

export interface CreationProvider {
  baseURL: string
  apiKey?: string
  model: string
}

export interface ArchParams extends CreationProvider {
  topic: string
  genre?: string
  chapters?: number
  guidance?: string
}

export interface BlueprintParams extends CreationProvider {
  /** 架构全文（四块拼回） */
  architecture: string
  /** 已有目录文本（续写时传入，保持连贯） */
  existingDirectory?: string
  /** 全书总章节数 */
  totalChapters?: number
  /** 起始章号（续写时传入） */
  startChapter?: number
}

/**
 * 通用 SSE 流式请求：转发 POST 到后端，逐 delta 回调，返回完整文本。
 * 复用 real/llm.ts:streamSingleChapter 的 reader/event 解析（delta 累积 + done 收尾 + error 抛出）。
 */
export async function streamSSE(
  url: string,
  body: object,
  onDelta: (acc: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    throw new Error(`网关错误 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }
  if (!res.body) throw new Error('响应无 body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let acc = ''
  for (;;) {
    const { done, value } = await reader.read()
    const text = value ? decoder.decode(value, { stream: !done }) : ''
    buffer += text
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const evt of events) {
      if (!evt.trim()) continue
      let event = 'message'
      let data = ''
      for (const line of evt.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      const parsed = JSON.parse(data) as { delta?: string; text?: string; message?: string }
      if (event === 'delta') {
        acc += parsed.delta ?? ''
        onDelta(acc)
      } else if (event === 'done') {
        return parsed.text ?? acc
      } else if (event === 'error') {
        throw new Error(parsed.message ?? '生成失败')
      }
    }
    if (done) break
  }
  throw new Error('流式响应意外结束')
}

/** 生成小说架构（雪花法四步）——流式 */
export async function generateArch(
  params: ArchParams,
  onDelta: (acc: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return streamSSE('/api/llm/arch', params, onDelta, signal)
}

/** 生成章节蓝图（节奏化目录）——流式 */
export async function generateBlueprint(
  params: BlueprintParams,
  onDelta: (acc: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return streamSSE('/api/llm/blueprint', params, onDelta, signal)
}
