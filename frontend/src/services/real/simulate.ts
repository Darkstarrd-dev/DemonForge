// M3 角色推演真实服务层——调用后端 /api/llm/simulate 网关，返回双候选流式推演。

import type { SimScene, EntityCard } from '../types'
import { parseSSE } from '../sse'
import { resolveProviderNode } from '../../utils/providerResolver'
import { normalizeProvider, normalizeProviderNode } from '../../utils/provider'

export interface SimulateParams {
  baseURL: string
  apiKey?: string
  model: string
  scene: SimScene
  targetCharacterId: string
  candidateCount: number
  systemPrompt?: string
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
  systemPrompt?: string,
): Promise<{ id: string; text: string }[]> {
  // 从 settings.json 读取 Provider 配置（M3 模块）
  const settingsRes = await fetch('/api/settings')
  if (!settingsRes.ok) throw new Error('无法读取设置')
  const settings = await settingsRes.json()
  const m3Mapping = settings.moduleMapping?.m3Simulate
  const nodeId = m3Mapping?.nodeId as string | undefined
  if (!nodeId) {
    throw new Error('M3 模块未配置节点，请前往设置页指定')
  }
  const normalizedProviders = (settings.providers ?? []).map((p: unknown) =>
    normalizeProvider(p as unknown as Parameters<typeof normalizeProvider>[0]),
  )
  const normalizedNodes = (settings.providerNodes ?? []).map((n: unknown) =>
    normalizeProviderNode(n as unknown as Parameters<typeof normalizeProviderNode>[0]),
  )
  const node = resolveProviderNode(
    { providers: normalizedProviders, providerNodes: normalizedNodes },
    nodeId,
  )
  if (!node) {
    throw new Error(`节点 ${nodeId} 不存在`)
  }

  const body: SimulateParams = {
    baseURL: node.baseURL,
    apiKey: node.apiKey,
    model: node.model,
    scene,
    targetCharacterId: card.id,
    candidateCount: 2,
    ...(systemPrompt ? { systemPrompt } : {}),
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

  const accTexts: string[] = ['', ''] // 双候选累积数组
  for await (const { event, data } of parseSSE(res.body)) {
    const parsed = data as {
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

  throw new Error('流式响应意外结束')
}
