// M4/M5 生成与管理真实服务层（阶段 C）——经后端 /api/llm/{draft,finalize,consistency} 调用。
// 复用 creation.ts 的 streamSSE 解析范式。

import { streamSSE } from './creation'

// ===== draft 端点类型 =====

export interface DraftContext {
  bookId: string
  chapterIndex?: number
  sceneId?: string
  targetCharacterId?: string
  rag?: {
    queryText: string
    k?: number
    provider: {
      baseURL: string
      apiKey?: string
      model: string
    }
  }
}

export interface DraftParams {
  baseURL: string
  apiKey?: string
  model: string
  context: DraftContext
  userGuidance?: string
  targetWordCount?: number
  systemPrompt?: string
}

/** 生成章节草稿（M4）——流式 */
export async function generateDraft(
  params: DraftParams,
  onDelta: (acc: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return streamSSE('/api/llm/draft', params, onDelta, signal)
}

// ===== finalize 端点类型 =====

export interface FinalizeResult {
  chapterSummary: string
  globalSummaryDelta: string
  stateEvents: Array<{
    characterId: string
    type: string
    description: string
    timestamp: string
  }>
}

export interface FinalizeParams {
  baseURL: string
  apiKey?: string
  model: string
  chapterText: string
  existingGlobalSummary?: string
  existingStates?: string
  systemPrompt?: string
}

/** 定稿章节（M5）——流式返回 JSON */
export async function finalizeChapter(
  params: FinalizeParams,
  onDelta: (acc: string) => void,
  signal?: AbortSignal,
): Promise<FinalizeResult> {
  const jsonText = await streamSSE('/api/llm/finalize', params, onDelta, signal)
  // 去除可能的 markdown 代码块标记
  const cleanJson = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
  return JSON.parse(cleanJson) as FinalizeResult
}

// ===== consistency 端点类型 =====

export interface ConsistencyIssueRaw {
  severity: '严重' | '警告' | '提示'
  dimension: '角色一致性' | '世界观逻辑' | '剧情连贯性'
  description: string
  suggestion: string
}

export interface ConsistencyResult {
  status: '通过' | '警告' | '严重错误'
  issues: ConsistencyIssueRaw[]
}

export interface ConsistencyParams {
  baseURL: string
  apiKey?: string
  model: string
  chapterText: string
  architecture?: string
  characterStates?: string
  previousSummary?: string
  systemPrompt?: string
}

/** 一致性审校（M5）——流式返回 JSON */
export async function checkConsistency(
  params: ConsistencyParams,
  onDelta: (acc: string) => void,
  signal?: AbortSignal,
): Promise<ConsistencyResult> {
  const jsonText = await streamSSE('/api/llm/consistency', params, onDelta, signal)
  // 去除可能的 markdown 代码块标记
  const cleanJson = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
  return JSON.parse(cleanJson) as ConsistencyResult
}
