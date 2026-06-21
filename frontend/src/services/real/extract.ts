// M2 实体提取真实服务层——经后端 /api/llm/extract-entities 调用。

import type { Chapter, EntityCard, MergeCandidate } from '../types'

export interface ExtractProgress {
  stage: 'chunk' | 'merge' | 'embed'
  current: number
  total: number
  message?: string
}

export interface ExtractResult {
  cards: EntityCard[]
  mergeCandidates: MergeCandidate[]
}

/**
 * 从章节提取实体（M2）——流式进度回调 + 最终结果。
 *
 * @param bookId 书籍 ID
 * @param chapters 待提取章节列表
 * @param existingNames 已有卡片名称（用于去重）
 * @param onProgress 进度回调（可选）
 * @param signal 中止信号（可选）
 * @returns {cards, mergeCandidates} 新卡片 + 合并候选对
 */
export async function extractEntities(
  bookId: string,
  chapters: Chapter[],
  existingNames: string[],
  onProgress?: (progress: ExtractProgress) => void,
  signal?: AbortSignal,
): Promise<ExtractResult> {
  // 从 settings.json 读取 m2Extract 节点配置
  const settingsRes = await fetch('/api/settings')
  if (!settingsRes.ok) {
    throw new Error(`无法读取设置：HTTP ${settingsRes.status}`)
  }
  const settings = await settingsRes.json()
  const { moduleMapping, providers } = settings as {
    moduleMapping?: Record<string, { nodeId: string | null }>
    providers?: Array<{ id: string; baseURL: string; apiKey?: string; model: string }>
  }

  const nodeId = moduleMapping?.m2Extract?.nodeId
  if (!nodeId) {
    throw new Error('M2 提取模块未配置节点，请前往设置页指定')
  }

  const node = providers?.find((p) => p.id === nodeId)
  if (!node) {
    throw new Error(`M2 提取节点 ${nodeId} 不存在于节点池`)
  }

  const res = await fetch('/api/llm/extract-entities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookId,
      chapters,
      existingNames,
      provider: {
        baseURL: node.baseURL,
        apiKey: node.apiKey,
        model: node.model,
      },
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '(无法读取响应体)')
    throw new Error(`提取失败 HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`)
  }

  if (!res.body) throw new Error('响应无 body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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

      const parsed = JSON.parse(data)

      if (event === 'progress') {
        if (onProgress) {
          onProgress(parsed as ExtractProgress)
        }
      } else if (event === 'done') {
        return parsed as ExtractResult
      } else if (event === 'error') {
        throw new Error(parsed.message ?? '提取失败')
      }
    }

    if (done) break
  }

  throw new Error('流式响应意外结束')
}
