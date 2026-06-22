// M3 角色推演真实服务层——调用后端 /api/llm/simulate 网关，返回双候选流式推演。

import type { SimScene, EntityCard } from '../types'
// import { streamSSE } from './creation'

export interface SimulateParams {
  baseURL: string
  apiKey?: string
  model: string
  scene: SimScene
  targetCharacterId: string
  candidateCount: number
}

/**
 * M3 角色推演——流式返回 N 个候选（默认 2）。
 * 后端 /api/llm/simulate 返回 delta 事件时携带 candidateIdx，前端维护累积数组。
 *
 * @param scene 场景上下文
 * @param card 目标角色卡
 * @param onChunk 流式回调：(candidateIdx, accText) => void
 * @param signal 可选 AbortSignal
 * @returns Promise<{id, text}[]> 完整候选数组
 */
export async function simulateCharacter(
  scene: SimScene,
  card: EntityCard,
  onChunk: (candidateIdx: number, accText: string) => void,
  signal?: AbortSignal,
): Promise<{ id: string; text: string }[]> {
  // 从 settings.json 读取 Provider 配置（M3 模块）
  const settingsRes = await fetch('/api/settings')
  if (!settingsRes.ok) throw new Error('无法读取设置')
  const settings = await settingsRes.json()
  const m3Mapping = settings.moduleMapping?.m3Simulate
  if (!m3Mapping?.providerId) {
    throw new Error('M3 模块未配置 Provider，请前往设置页指定')
  }
  const provider = settings.providers?.find((p: { id: string }) => p.id === m3Mapping.providerId)
  if (!provider) {
    throw new Error(`Provider ${m3Mapping.providerId} 不存在`)
  }

  const body: SimulateParams = {
    baseURL: provider.baseURL,
    apiKey: provider.apiKey,
    model: m3Mapping.modelName || provider.model,
    scene,
    targetCharacterId: card.id,
    candidateCount: 2,
  }

  const res = await fetch('/api/llm/simulate', {
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
  const accTexts: string[] = ['', ''] // 双候选累积数组

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

      const parsed = JSON.parse(data) as {
        candidateIdx?: number
        delta?: string
        candidates?: { id: string; text: string }[]
        message?: string
      }

      if (event === 'delta') {
        const idx = parsed.candidateIdx ?? 0
        accTexts[idx] += parsed.delta ?? ''
        onChunk(idx, accTexts[idx])
      } else if (event === 'done') {
        return parsed.candidates ?? accTexts.map((t, i) => ({ id: `cand-${i}`, text: t }))
      } else if (event === 'error') {
        throw new Error(parsed.message ?? 'M3 推演失败')
      }
    }
    if (done) break
  }

  throw new Error('流式响应意外结束')
}
