// appStore 公共类型与轻量工厂（A-7 阶段2 从 appStore.ts 抽出）。
// 纯类型 + 无依赖工厂，供 appStore / slices / persistence / bootstrap 共享，避免循环依赖。
import type {
  Book,
  Chapter,
  EntityCard,
  EntityType,
  OutlineNode,
  SimScene,
  SimFragment,
  StateEvent,
  ConsistencyIssue,
  ProviderNode,
  ModuleKey,
  ModuleModelMapping,
  MergeCandidate,
  ImportSession,
  NovelArchitecture,
  TestHistoryItem,
  ChatSession,
  SessionRuntime,
  SplitPattern,
  ImageInputMode,
  RoleChatParticipant,
  RoleChatMessage,
  RoleChatRuntime,
  RoleChatAutoConfig,
} from '../services/types'

/** 节点测试表单草稿（轻量，持久化到 settings.json） */
export interface NodeTestForm {
  /** 服务商：当前仅 'modelscope' */
  provider: string
  /** 选中的节点 id */
  nodeId?: string
  prompt: string
  // ===== 图片生成参数 =====
  /** 分辨率预设值，如 '1024x1024'（透传给 ModelScope 的 size 字段） */
  resolution: string
  /** 反向提示词（negative_prompt），可选 */
  negativePrompt?: string
  /** 采样步数（steps），可选 */
  steps?: number
  /** 引导系数（guidance），可选 */
  guidance?: number
  /** 随机种子（seed），留空则随机 */
  seed?: number
  /** 图片输入方式（base64 / catbox / litterbox / 0x0 / telegraph） */
  imageInputMode?: ImageInputMode
  // ===== GPT Image 专属参数 =====
  /** 画质：'high' 表示高清，留空为标准（standard） */
  gptQuality?: string
  /** 背景：'transparent' 表示透明，留空为不透明 */
  gptBackground?: string
  /** 审核：'low' 表示宽松，留空为自动（auto） */
  gptModeration?: string
  // ===== xAI Imagine 专属参数 =====
  /** 宽高比，如 '1:1' / '16:9' / '21:9' 等 */
  xaiAspectRatio?: string
  /** 分辨率，如 '1k' / '2k' / '4k' / '8k' */
  xaiResolution?: string
  /** 单次生成数量，1-10 */
  xaiN?: number
  // ===== 文本推理参数 =====
  temperature?: number
  topP?: number
  topK?: number
  maxTokens?: number
}

/** System Prompt 预设（节点测试，全局共享，持久化到 settings.json） */
export interface SystemPromptPreset {
  /** 唯一 id，下拉 value 与删除定位用 */
  id: string
  /** 用户命名 */
  title: string
  /** system prompt 正文 */
  content: string
}

/** 向后兼容：旧的 ImageDemoForm 类型别名 */
export type ImageDemoForm = NodeTestForm

/** M1 Step3 清理当前进行中任务（不持久化，仅内存）。用于跨 Step 页面保持任务控制权。
 * acc 字段已移除——流式文本改用 Step3Clean 组件内 accMapRef + 150ms 定时刷新，不再每 delta 写 store。 */
export interface CleanRunActiveTask {
  chapterId: string
  nodeName: string
  nodeId?: string
  batchId?: string
  isBatchAnchor?: boolean
}

/** M1 Step3 工作节点会话（按批次生命周期） */
export interface CleanRunNodeSession {
  sessionKey: string
  nodeId: string
  name: string
  assigned: string[]
  done: string[]
  idle: boolean
}

export interface CleanRunState {
  handle: unknown
  running: boolean
  paused: boolean
  active: CleanRunActiveTask[]
  nodeSessions: CleanRunNodeSession[]
  startedAt: number
}

/** 节点测试 session 运行态默认值（新建/缺省时用）。 */
export function defaultSessionRuntime(): SessionRuntime {
  return {
    status: 'idle',
    streamingText: '',
    streamingReasoning: '',
    statusText: '',
    startedAt: 0,
    debug: { previewBody: null, actualBody: null, sseChunks: [] },
  }
}

/** 角色对话参与者 session 运行态默认值（新建/缺省时用）。 */
export function defaultRoleChatRuntime(): RoleChatRuntime {
  return {
    status: 'idle',
    streamingText: '',
    streamingReasoning: '',
    debug: { previewBody: null, actualBody: null, sseChunks: [] },
  }
}

export interface AppState {
  books: Book[]
  chapters: Chapter[]
  cards: EntityCard[]
  outline: OutlineNode[]
  scenes: SimScene[]
  fragments: SimFragment[]
  stateEvents: StateEvent[]
  issues: ConsistencyIssue[]
  /** 小说架构（book 级，起源流程产出） */
  architectures: NovelArchitecture[]
  providers: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
  /** M1 清理系统提示词（设置页持久化默认）。空串=用后端内置默认 */
  m1SystemPrompt: string
  /** 资产目录（业务数据 SQLite 库所在）。空串=后端用默认 <repo>/assets */
  assetDir: string
  /** 是否显示 Electron 原生菜单栏（持久化到 settings.json） */
  showMenuBar: boolean
  mergeCandidates: MergeCandidate[]
  /** 当前作品（project 书）id，驱动 M3/M4/M5 */
  currentBookId: string
  /** M1 导入会话（页面流程态，仅内存、不持久化——含整份 rawText，避免反复回传） */
  importSession: ImportSession | null
  /** 节点测试生成历史（持久化到 test_history 表） */
  testHistory: TestHistoryItem[]
  /** 节点测试对话记录（持久化到 chat_sessions 表，AI Studio 样式） */
  chatSessions: ChatSession[]
  /** 节点测试当前激活的对话记录 id（内存态，不持久化）；null=未选中/新建态 */
  activeChatSessionId: string | null
  /** 节点测试全局参数（provider + nodeId，持久化到 settings.json） */
  nodeTestGlobalForm: { provider: string; nodeId?: string }
  /** 节点测试每节点独立参数（持久化到 settings.json） */
  nodeTestFormPerNode: Record<string, Partial<NodeTestForm>>
  /** 向后兼容：旧的 imageGallery 字段别名 */
  imageGallery: TestHistoryItem[]
  /** 向后兼容：旧的 imageDemoGlobalForm 字段别名（内部指向 nodeTestGlobalForm） */
  imageDemoGlobalForm: { provider: string; nodeId?: string }
  /** 向后兼容：旧的 imageDemoFormPerNode 字段别名（内部指向 nodeTestFormPerNode） */
  imageDemoFormPerNode: Record<string, Partial<NodeTestForm>>
  /** M1 章节检测模式池（持久化到 settings.json，设置页可增删改） */
  splitPatterns: SplitPattern[]
  /**
   * M1 Step3 清理节点运行时覆盖（持久化到 settings.json）。
   * key = 节点 id，value = 该节点本次运行的参与/进程/批量/间隔覆盖。
   * 原 Step3 用 useState 存此值，重挂载/步骤切换即丢失 → 回退 provider 默认 batchChars=4000，
   * 曾导致"100 章发 100 请求"。迁到 store 后随设置落盘，避免静默回退。
   */
  cleanNodeOverrides: Record<string, Partial<{ participating: boolean; concurrency: number; batchChars: number; intervalSec: number }>>
  /** M1 Step3 失败章节自动重试开关（持久化到 settings.json，默认开启） */
  m1AutoRetry: boolean
  /** M1 Step2 章节名称替换模板（持久化到 settings.json），如 "第{0n}章 {title}" */
  m1TitleTemplate: string
  /** M1 测试文本（持久化到 settings.json）——节点池「测试」和「并发测试」用此文本 + 清理提示词调用真实负载 */
  m1TestText: string
  /** M1 Step3 清理运行状态（不持久化，仅内存）。跨 Step 页面保持任务控制权。 */
  cleanRun: CleanRunState | null
  /** 节点测试各 session 运行态（内存态，按 sessionId 索引，不持久化）。推理执行下沉到 sessionEngine 后写此处，UI 订阅。 */
  sessionRuntimes: Record<string, SessionRuntime>
  /** 节点测试下左侧栏内容模式：app 导航 / session 列表（内存态，不持久化） */
  nodeTestSidebarMode: 'app' | 'sessions'
  /** 图片归档保存目录（持久化到 settings.json）。空串=后端用默认 <dataDir>/images */
  imageArchiveDir: string
  /** M2 卡片 AI 生成系统提示词覆盖，按实体类型分别存（持久化到 settings.json）。缺该 type=用后端默认 */
  m2CardGenPromptByType: Partial<Record<EntityType, string>>
  /** 统一提示词覆盖（P3 归一化）：key→自定义提示词。key 形如 'm0-arch' 或 'm2-card-single:character'（按类型分支）。持久化到 settings.json */
  promptOverrides: Record<string, string>
  /** 角色交流参与者列表（内存态，不持久化） */
  roleChatParticipants: RoleChatParticipant[]
  /** 角色交流群聊消息流（内存态，不持久化；各参与者从此单一数据源派生各自缓存前缀） */
  roleChatMessages: RoleChatMessage[]
  /** 角色交流共享场景设定（内存态，不持久化） */
  roleChatSceneSetting: string
  /** 角色交流当前激活 session：'main'=群聊主界面，否则为参与者 id（内存态，不持久化） */
  roleChatActiveSessionId: string
  /** 角色交流左侧栏内容模式：app 导航 / session 列表（内存态，不持久化） */
  roleChatSidebarMode: 'app' | 'sessions'
  /** 角色交流各参与者 session 运行态（内存态，按参与者 id 索引，不持久化） */
  roleChatRuntimes: Record<string, RoleChatRuntime>
  /** 角色交流自动循环配置 */
  roleChatAutoConfig: RoleChatAutoConfig
  /** UI 主题模式（持久化到 settings.json） */
  theme: 'light' | 'dark'
  /** 4K 基准缩放开关（持久化到 settings.json，默认关闭） */
  enable4KScale: boolean
  /** 4K 基准缩放的基准内容宽度（DIP）；0=未捕获。由「以当前窗口为基准」捕获，持久化到 settings.json */
  scaleBaseWidth: number
  /** 节点池分组折叠状态（持久化到 settings.json）：key = groupKey (baseURL + groupName), value = 是否展开 */
  nodeGroupExpanded: Record<string, boolean>
  /** 节点测试 System Prompt 预设列表（全局共享，持久化到 settings.json） */
  systemPromptPresets: SystemPromptPreset[]
  /** 节点测试当前激活的 System Prompt 预设 id；null=未选中/新建态（持久化到 settings.json） */
  systemPromptActiveId: string | null

  setState: (patch: Partial<AppState>) => void
  /** M1 Step3 清洗运行状态合并写入（部分更新）。不持久化。 */
  setCleanRun: (patch: Partial<CleanRunState> | null) => void
  /** 节点测试：合并写入某 session 的运行态（缺省自动建默认）。不持久化。 */
  patchSessionRuntime: (id: string, patch: Partial<SessionRuntime>) => void
  /** 节点测试：清除某 session 的运行态（删 session / 完成清理时）。不持久化。 */
  clearSessionRuntime: (id: string) => void
  /** 角色交流：合并写入某参与者 session 的运行态（缺省自动建默认）。不持久化。 */
  patchRoleChatRuntime: (id: string, patch: Partial<RoleChatRuntime>) => void
  /** 角色交流：清除某参与者 session 的运行态（删除参与者 / 重置时）。不持久化。 */
  clearRoleChatRuntime: (id: string) => void
  updateChapter: (id: string, patch: Partial<Chapter>) => void
  updateCard: (id: string, patch: Partial<EntityCard>) => void
  updateIssue: (id: string, patch: Partial<ConsistencyIssue>) => void
  /** 删除一本书及其全部关联数据（级联）。删除当前作品时切到首个剩余 project，无则置空 */
  deleteBook: (id: string) => void
  /** 节点测试：新增一条测试历史到头部 */
  addTestHistory: (item: TestHistoryItem) => void
  /** 节点测试：按 id 删除一条历史 */
  deleteTestHistory: (id: string) => void
  /** 节点测试：新建对话记录，返回新 id（立即落库） */
  createChatSession: (session: ChatSession) => string
  /** 节点测试：合并更新对话记录（messages/title/updatedAt 等，立即落库） */
  updateChatSession: (id: string, patch: Partial<ChatSession>) => void
  /** 节点测试：重命名对话记录（立即落库） */
  renameChatSession: (id: string, title: string) => void
  /** 节点测试：按 id 删除对话记录（立即落库） */
  deleteChatSession: (id: string) => void
  /** 节点测试：批量删除多条对话记录（立即落库，单次 DELETE） */
  deleteChatSessions: (ids: string[]) => void
  /** 节点测试：设置当前激活的对话记录 id（内存态，不持久化） */
  setActiveChatSessionId: (id: string | null) => void
  /** 向后兼容：旧的 addImage 方法别名 */
  addImage: (image: TestHistoryItem) => void
  /** 向后兼容：旧的 deleteImage 方法别名 */
  deleteImage: (id: string) => void
  /** 设置：覆盖章节检测模式池（立即落 settings.json） */
  setSplitPatterns: (patterns: SplitPattern[]) => void
  /** 设置：恢复章节检测模式池为内置默认（立即落 settings.json） */
  resetSplitPatterns: () => void
  /**
   * 次数限制：派发任务前调用，判定该节点当前是否可用并扣减当日剩余次数。
   * - 未开启次数限制 → 直接返回 true。
   * - 跨本地自然日 → 重置 usageLeft = usageLimit。
   * - usageLeft <= 0 → 返回 false（调度器应跳过该节点）。
   * - 否则 usageLeft -= 1 并写回，返回 true。
   */
  consumeProviderUsage: (nodeId: string) => boolean
  /** 节点测试：保存/更新 System Prompt 预设。activeId 有值则更新，null 则新建并设为当前激活（立即落 settings.json） */
  saveSystemPromptPreset: (title: string, content: string) => void
  /** 节点测试：按 id 删除 System Prompt 预设。删除当前激活项时 activeId 置 null（立即落 settings.json） */
  deleteSystemPromptPreset: (id: string) => void
  /** 节点测试：切换当前激活的 System Prompt 预设 id（立即落 settings.json） */
  setSystemPromptActiveId: (id: string | null) => void
  resetDemo: () => void
}
