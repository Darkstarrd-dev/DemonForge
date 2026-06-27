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

/** 卡片图片（落盘归档后只存文件 URL，不存 b64，避免 DB 膨胀） */
export interface CardImage {
  id: string
  /** 归档文件 URL（/api/image/file/<name>） */
  url: string
  /** 生成该图所用的提示词（看大图时展示） */
  prompt: string
  /** 分组标签，如 '表情差分' / '全身形象' / '场景背景'；空=默认组 */
  group?: string
  createdAt: string
}

export interface EntityCard {
  id: string
  /** 归属书 id；空串 '' 表示「素材库」——不归属任何一本书的自有素材 */
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
  /** 图片素材（表情差分/全身形象/场景背景等，按 group 分组） */
  images?: CardImage[]
  /** 主图引用（指向 images[].id）；未设回退 images[0]，用于卡片简介旁 1:1 封面 */
  coverImageId?: string
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

/** 节点测试历史项（持久化到 test_history 表） */
export interface TestHistoryItem {
  id: string
  /** 测试类型：文本生成/多模态理解/图片生成 */
  testType: 'text' | 'multimodal' | 'image'
  /** 文本响应（text/multimodal） */
  textResponse?: string
  /** 图片响应（image），base64 data URL */
  imageResponse?: string
  prompt: string
  /** 生成所用模型名（来自节点） */
  modelName: string
  /** 生成所用节点 id */
  nodeId: string
  /** 节点类型（text/image） */
  nodeType: 'text' | 'image'
  // ===== 图片生成参数 =====
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
  /** 图生图时使用的输入图片（Base64 data URL 或图床 URL） */
  imageInputs?: string[]
  /** 图片输入方式（base64 / catbox / litterbox / 0x0 / telegraph） */
  imageInputMode?: ImageInputMode
  // ===== 文本推理参数 =====
  temperature?: number
  topP?: number
  topK?: number
  maxTokens?: number
  createdAt: string
}

/** 向后兼容：旧的 GeneratedImage 类型别名 */
export type GeneratedImage = TestHistoryItem

export type ImageInputMode = 'base64' | 'catbox' | 'litterbox' | '0x0' | 'telegraph'

// ==================== 节点测试 · 对话记录 ====================

/** 对话记录内单条消息（持久化到 chat_sessions 表） */
export interface ChatSessionMessage {
  id: string
  role: 'user' | 'assistant'
  /** 文本内容；image 模式 assistant 为图片 dataUrl */
  content: string
  timestamp: number
  /** 多模态/图生图输入图片（dataUrl 或图床 URL） */
  images?: string[]
  /** 思考过程（reasoning 字段） */
  reasoning?: string
  /** 节点 ID（用于模型切换标记） */
  nodeId?: string
  /** 模型名称（用于模型切换标记） */
  modelName?: string
  /** GPT Image 模型改写后的提示词（仅 GPT 图片模式 assistant 消息） */
  revisedPrompt?: string
  /** 图片生成耗时（毫秒，仅图片模式 assistant 消息） */
  genMs?: number
}

/** 对话记录（一轮对话流 = 一个 session，多轮累积）。持久化到 chat_sessions 表 */
export interface ChatSession {
  id: string
  /** 自动生成，可手动更名 */
  title: string
  testType: 'text' | 'multimodal' | 'image'
  nodeId: string
  modelName: string
  messages: ChatSessionMessage[]
  /** 使用时的 system prompt 快照 */
  systemPromptContent?: string
  // ===== 文本参数快照 =====
  temperature?: number
  topP?: number
  maxTokens?: number
  // ===== 图片参数快照 =====
  size?: string
  negativePrompt?: string
  steps?: number
  guidance?: number
  seed?: number
  imageInputMode?: ImageInputMode
  // ===== GPT Image 参数快照 =====
  gptQuality?: string
  gptBackground?: string
  gptModeration?: string
  // ===== xAI Imagine 参数快照 =====
  xaiAspectRatio?: string
  xaiResolution?: string
  createdAt: string
  updatedAt: string
}

// ==================== 角色交流模块类型 ====================

/** 角色交流模式：Opencode 服务器或本地节点池 */
export type RoleChatMode = 'opencode' | 'local'

/** 角色对话参与者（统一 Opencode Agent 和本地角色） */
export interface RoleChatParticipant {
  id: string
  name: string
  /** 模式：opencode = Opencode Agent / local = 本地角色卡 */
  mode: RoleChatMode
  /** Opencode 模式：Agent 名称 */
  agentName?: string
  /** Opencode 模式：Model 名称 */
  model?: string
  /** 本地模式：EntityCard ID */
  cardId?: string
  /** 本地模式：选中的节点 ID */
  nodeId?: string
  /** 头像（可选，优先级：自定义 > 卡片 fields.avatar > 首字母） */
  avatar?: string
  /** 头像颜色（从名称生成） */
  color: string
  /** 当前状态：idle/thinking/responding/waiting/done */
  status: 'idle' | 'thinking' | 'responding' | 'waiting' | 'done'
}

/** 角色对话消息 */
export interface RoleChatMessage {
  id: string
  participantId: string
  participantName: string
  content: string
  timestamp: number
  /** 是否为用户消息（非 Agent） */
  isUser?: boolean
}

/** 自动循环配置 */
export interface RoleChatAutoConfig {
  /** 模式：按次数或时间 */
  mode: 'count' | 'time'
  /** 次数模式：每个 Agent 回复次数（±variance） */
  count: number
  /** 时间模式：总运行秒数 */
  duration: number
  /** 次数波动范围 */
  variance: number
  /** 冷却基准值（秒） */
  cooldownBase: number
  /** 冷却波动范围（秒） */
  cooldownVariance: number
  /** 反应延迟（秒）：Agent "思考"延迟范围 */
  reactionDelayMin: number
  reactionDelayMax: number
}

/** Opencode Agent 信息 */
export interface OpencodeAgent {
  name: string
  description?: string
}

/** Opencode 会话信息 */
export interface OpencodeSession {
  sessionID: string
  agentName: string
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

/** 图片生图协议：ModelScope 异步任务 / GPT Image 同步 API / xAI Imagine 同步 API */
export type ImageProtocol = 'modelscope' | 'gpt' | 'xai'

export interface ProviderNode {
  id: string
  name: string
  /** 节点用途：文本生成(默认) / 文生图 */
  nodeType: ProviderNodeType
  /** 文生图节点的协议（仅 nodeType=image 时生效），默认 modelscope */
  protocol?: ImageProtocol
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
  /** 是否支持视觉多模态理解（VLM），仅文本节点有效 */
  isMultimodal?: boolean
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
  /** 清理模式目标书 ID。存在 = 清理模式（仅 Step2/3，覆盖入库）；undefined = 新建模式 */
  targetBookId?: string
}

// ==================== 节点测试 · Debug Info / Session 运行态 ====================

/** Debug Info 单条 SSE chunk（上游原始；json 为 null 表示 [DONE]）。
 *  从 node-test/DebugInfoPanel 上移到此处共享，供 appStore 运行态注册表引用。 */
export interface SseChunk {
  line: string
  json: unknown | null
}

/** Debug Info 数据（每 session 独立：预览请求体 / 实际请求体 / 上游 SSE chunks） */
export interface DebugInfoData {
  previewBody: object | null
  actualBody: object | null
  sseChunks: SseChunk[]
}

/** 节点测试 session 运行态状态机 */
export type SessionRunStatus = 'idle' | 'streaming' | 'done' | 'error'

/** 节点测试单 session 的运行态（内存态，按 sessionId 索引，不持久化）。
 *  推理执行从组件下沉到 sessionEngine 后，运行态写到这里，UI 只订阅——
 *  从而"显示哪个 session"与"哪个 session 在跑"完全解耦（切走仍继续）。 */
export interface SessionRuntime {
  status: SessionRunStatus
  /** 流式累积的文本（图片模式为结果 URL，一般不经此） */
  streamingText: string
  /** 流式累积的 reasoning */
  streamingReasoning: string
  /** 图片阶段文案，如 "GPT Image 生成中…" / "下载图片中…" */
  statusText: string
  /** 计时基准（elapsed = now - startedAt） */
  startedAt: number
  /** 错误信息（status==='error' 时） */
  error?: string
  /** 本 session 正在流式写入的 assistant 占位消息 id（done 时替换为最终内容） */
  pendingAssistantMsgId?: string
  /** 每 session 独立 Debug Info */
  debug: DebugInfoData
}
