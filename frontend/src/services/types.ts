// 领域类型——字段对齐 DESIGN.md §3 核心实体，未来后端 API 返回结构以此为准

export type BookType = 'reference' | 'project'

export interface Book {
  id: string
  title: string
  type: BookType
  createdAt: string
}

export type ChapterStatus = 'raw' | 'cleaned' | 'draft' | 'final'

export interface Chapter {
  id: string
  bookId: string
  index: number
  title: string
  content: string
  status: ChapterStatus
  outlineNodeId?: string
  updatedAt: string
}

export type EntityType = 'character' | 'location' | 'item' | 'skill' | 'faction'

export interface EntityRef {
  chapterId: string
  excerpt: string
}

export interface EntityCard {
  id: string
  bookId: string
  type: EntityType
  name: string
  aliases: string[]
  /** 结构化字段，键值随实体类型不同 */
  fields: Record<string, string>
  description: string
  /** 人物专用：语言风格描述（M3 推演用） */
  styleNote?: string
  /** 人物专用：台词例句 */
  styleExamples?: string[]
  refs: EntityRef[]
  updatedAt: string
}

export interface OutlineNode {
  id: string
  bookId: string
  volume: string
  title: string
  summary: string
  order: number
}

/** M3 推演场景：同一场景可轮流推演多个角色 */
export interface SimScene {
  id: string
  bookId: string
  desc: string
  goal: string
  prevSummary: string
  presentCharacterIds: string[]
  createdAt: string
}

/** M3 单角色推演片段（一次生成，含多候选） */
export interface SimFragment {
  id: string
  sceneId: string
  characterId: string
  candidates: { id: string; text: string }[]
  adoptedText?: string
  /** 场景序列内排序 */
  order: number
  createdAt: string
}

export type StateEventType =
  | 'location'
  | 'relationship'
  | 'injury'
  | 'possession'
  | 'death'
  | 'other'

export interface StateEvent {
  id: string
  bookId: string
  chapterId: string
  entityId: string
  eventType: StateEventType
  description: string
  createdAt: string
}

export type IssueLevel = 'error' | 'warning'
export type IssueStatus = 'open' | 'ignored' | 'resolved'

export interface ConsistencyIssue {
  id: string
  bookId: string
  chapterId: string
  type: string
  level: IssueLevel
  description: string
  relatedCardIds: string[]
  suggestion: string
  status: IssueStatus
}

export interface ProviderNode {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  enabled: boolean
  lastTestResult?: 'ok' | 'fail' | null
  /** 该节点最大并发请求数（核心数），默认 2 */
  maxConcurrency: number
  /** 该节点每次请求合并的章节数，默认 1（单章） */
  batchSize: number
  /** 该节点两次请求之间最小间隔秒数，默认 0 */
  intervalSec: number
}

export type ModuleKey =
  | 'm1Clean'
  | 'm2Extract'
  | 'm3Simulate'
  | 'm4Generate'
  | 'm5Check'
  | 'embedding'

export interface ModuleModelMapping {
  nodeId: string | null
  /** 模型名不再独立维护——读取时一律从节点池 provider.model 取。保留字段仅为兼容旧 settings.json */
  model?: string
}

/** M2 实体合并裁决候选对 */
export interface MergeCandidate {
  id: string
  cardAId: string
  cardBId: string
  similarity: number
  status: 'pending' | 'merged' | 'kept'
}

// ===== M1 导入会话（页面流程态，正式版同样会持久化） =====

export type CleanStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'needsReprocess'

export interface LineDecision {
  action: 'accept' | 'reject' | 'edit'
  content?: string
}

export interface ImportChapter {
  id: string
  title: string
  content: string
  cleanStatus: CleanStatus
  cleanedContent?: string
  /** 整章接受时由「清理结果 + 行级决策」计算出的最终文本（入库/导出用） */
  finalText?: string
  lineDecisions: Record<number, LineDecision>
  retryCount: number
}

export interface ImportSession {
  fileName: string
  rawText: string
  encoding: string
  detectedEncoding: string
  step: number
  chapters: ImportChapter[]
}
