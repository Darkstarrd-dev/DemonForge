// 角色交流模块服务层
import type { OpencodeAgent, OpencodeSession, RoleChatMessage } from '../types'

// ==================== Opencode 模式 ====================

/** Opencode 模式：列出可用 Agent */
export async function listOpencodeAgents(baseURL: string): Promise<OpencodeAgent[]> {
  try {
    const res = await fetch(`${baseURL}/agent`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { name: string; description?: string }[]
    return Array.isArray(data) ? data : []
  } catch (e) {
    throw new Error(`无法连接到 Opencode Server: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Opencode 模式：创建会话 */
export async function createOpencodeSession(
  baseURL: string,
  agentName: string,
): Promise<OpencodeSession> {
  try {
    const res = await fetch(`${baseURL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `角色交流 - ${agentName}`, directory: '.' }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { id?: string; sessionID?: string }
    const sessionID = data.id || data.sessionID
    if (!sessionID) throw new Error('Opencode Server 未返回有效的 sessionID')
    return { sessionID, agentName }
  } catch (e) {
    throw new Error(`创建 Opencode 会话失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Opencode 模式：发送消息（返回完整响应文本） */
export async function sendOpencodeMessage(
  baseURL: string,
  sessionID: string,
  agentName: string,
  model: string,
  prompt: string,
): Promise<string> {
  try {
    const res = await fetch(`${baseURL}/session/${sessionID}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: prompt }],
        agent: agentName,
        model,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { parts?: Array<{ type: string; text?: string }> }
    const textParts = (data.parts ?? []).filter((p) => p.type === 'text' && p.text).map((p) => p.text!)
    return textParts.join('\n')
  } catch (e) {
    throw new Error(`Opencode 消息发送失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ==================== 本地模式 ====================

/** 本地模式：发送角色对话消息（SSE 流式，返回完整文本） */
export async function sendLocalRoleMessage(
  cardId: string,
  nodeId: string,
  conversationHistory: RoleChatMessage[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('/api/chat/role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cardId,
      nodeId,
      conversationHistory: conversationHistory.map((m) => ({
        participantName: m.participantName,
        content: m.content,
        isUser: m.isUser,
      })),
    }),
    signal,
  })

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}${text ? ` - ${text}` : ''}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const dataStr = trimmed.slice(5).trim()
        if (!dataStr) continue

        try {
          const data = JSON.parse(dataStr) as
            | { delta: string }
            | { text: string }
            | { message: string }

          if ('delta' in data && data.delta) {
            fullText += data.delta
            onDelta(data.delta)
          } else if ('text' in data) {
            // done 事件，已累积完整文本，不再追加
          } else if ('message' in data) {
            throw new Error(data.message)
          }
        } catch (e) {
          if (e instanceof Error && e.message) throw e
          // 忽略非 JSON 行（keep-alive）
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullText
}
