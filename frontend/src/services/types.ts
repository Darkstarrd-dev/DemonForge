// 领域类型——字段对齐 DESIGN.md §3 核心实体，未来后端 API 返回结构以此为准

export type BookType = 'reference' | 'project'

export interface Book {
  id: string
  title: string
  type: BookType
  createdAt: string
  /** 滚动摘要（长篇记忆，定稿时增量更新）——novel-generator global_summary 对应 */
  globalSummary?: string
  /** 作者名（仅素材库，可选） */
  author?: string
  /** 原始发布平台（仅素材库，可选） */
  platform?: string
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
  /** 本章定稿摘要（喂给下一章生成）——定稿时由 finalize 生成 */
  summary?: string
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
  // ===== 节奏字段（对齐 novel-blueprint 目录格式，均可选、兼容旧数据）=====
  /** 本章定位（开端/铺垫/转折/高潮等） */
  positioning?: string
  /** 核心作用（推进主线/塑造人物/埋伏笔等） */
  role?: string
  /** 悬念密度（低/中/高） */
  suspenseDensity?: string
  /** 伏笔操作（埋设/回收/强化的伏笔说明） */
  foreshadow?: string
  /** 认知颠覆强度 1–5 */
  twistLevel?: number
}

/** 小说架构（book 级，一本一条）——雪花法四步产出，novel-arch 对应 */
export interface NovelArchitecture {
  id: string
  bookId: string
  /** 核心种子（单句公式） */
  seed: string
  /** 角色动力学（驱动力三角 + 关系网） */
  characterDynamics: string
  /** 世界观（物理/社会/隐喻三维度） */
  worldBuilding: string
  /** 三幕式情节架构 */
  plotStructure: string
  updatedAt: string
}

/** RAG 检索召回片段（前端调 /api/store/vector/query 的返回项） */
export interface RagChunk {
  source: string
  bookId?: string
  chapterId?: string
  text: string
  distance: number
}

/** 文生图 Demo 生成历史项（持久化到 image_gallery 表，dataUrl 为 base64 data URL） */
export interface GeneratedImage {
  id: string
  dataUrl: string
  prompt: string
  /** 生成所用模型名（来自节点） */
  modelName: string
  /** 生成所用文生图节点 id */
  nodeId: string
  width?: number
  height?: number
  /** 生成所用分辨率字符串（如 "1024x1024"） */
  size?: string
  /** 反向提示词 */
  negativePrompt?: string
  /** 采样步数 */
  steps?: number
  /** 引导系数 */
  guidance?: number
  /** 随机种子 */
  seed?: number
  createdAt: string
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

export type ProviderNodeType = 'text' | 'image'

export interface ProviderNode {
  id: string
  name: string
  /** 节点用途：文本生成(默认) / 文生图 */
  nodeType: ProviderNodeType
  baseURL: string
  apiKey: string
  model: string
  enabled: boolean
  lastTestResult?: 'ok' | 'fail' | null
  /** 该节点最大并发请求数（核心数），默认 2 */
  maxConcurrency: number
  /** 该节点每次请求的批次字数上限（非章节数），默认 4000 */
  batchChars: number
  /** 该节点两次请求之间最小间隔秒数，默认 0 */
  intervalSec: number
  /** 次数限制开关：开启后按每日额度限制该节点可用次数 */
  usageLimitEnabled?: boolean
  /** 每日可用额度（用户设置） */
  usageLimit?: number
  /** 当日剩余次数（每次调用后递减，跨日重置为 usageLimit） */
  usageLeft?: number
  /** 上次重置剩余次数的日期 YYYY-MM-DD（本地自然日） */
  usageResetDate?: string
  /** 是否支持图片编辑（Image2Image）功能，仅文生图节点有效 */
  supportsImageEdit?: boolean
}

export type ModuleKey =
  | 'm0Arch'
  | 'm0Blueprint'
  | 'm1Clean'
  | 'm2Extract'
  | 'm3Simulate'
  | 'm4Generate'
  | 'm5Check'
  | 'm5Finalize'
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
  /** 卷/特殊标记章，Step3 跳过 LLM 调用，原样保留 */
  skipClean?: boolean
  /** 最终成功处理该章的节点（供完成列表/审核页溯源、按节点筛选拒绝） */
  processedByNode?: { nodeId: string; nodeName: string }
}

/** 章节检测模式（持久化形态：regex 为字符串，便于用户编辑 + settings.json 存储） */
export interface SplitPattern {
  key: string
  label: string
  regex: string
  /** 正则标志，如 'i'（大小写忽略）。可选 */
  flags?: string
  builtin?: boolean
}

export interface ImportSession {
  fileName: string
  rawText: string
  encoding: string
  detectedEncoding: string
  step: number
  chapters: ImportChapter[]
}
