import { create } from 'zustand'
import type {
  Book,
  Chapter,
  EntityCard,
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
  RoleChatMode,
  RoleChatAutoConfig,
} from '../services/types'
import {
  seedBooks,
  seedChapters,
  seedCards,
  seedOutline,
  seedScenes,
  seedFragments,
  seedStateEvents,
  seedIssues,
  seedProviders,
  seedModuleMapping,
  seedMergeCandidates,
  seedArchitectures,
} from '../mocks/seed'
import { DEFAULT_SPLIT_PATTERNS } from '../utils/split'
import { localDateKey } from '../utils/date'
// 持久化引擎与启动引导已抽出（A-7 阶段1）；actions 调用 pushXxxNow，末尾 registerPersisters 注册订阅。
// 全部本地 import 后于文件末尾统一 re-export，保调用方 import 路径零改动（仍从 '../store/appStore' 取）。
import {
  pushStoreNow,
  pushStoreNowChecked,
  pushDeleteNow,
  pushSettingsNow,
  pushImportSessionNow,
  flushStoreWrites,
  businessPayload,
  settingsPayload,
  registerPersisters,
} from './persistence'
import { bootstrapStore, reloadStoreFromBackend } from './bootstrap'

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
  /** 角色交流模式（持久化到 settings.json） */
  roleChatMode: RoleChatMode
  /** 角色交流 Opencode Server 地址（持久化到 settings.json） */
  roleChatOpencodeURL: string
  /** 角色交流自动循环配置（持久化到 settings.json） */
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

export const seedState = () => ({
  books: seedBooks,
  chapters: seedChapters,
  cards: seedCards,
  outline: seedOutline,
  scenes: seedScenes,
  fragments: seedFragments,
  stateEvents: seedStateEvents,
  issues: seedIssues,
  architectures: seedArchitectures,
  providers: seedProviders,
  moduleMapping: seedModuleMapping,
  m1SystemPrompt: '',
  assetDir: '',
  showMenuBar: true,
  mergeCandidates: seedMergeCandidates,
  currentBookId: '',
  roleChatMode: 'local' as RoleChatMode,
  roleChatOpencodeURL: 'http://127.0.0.1:4096',
  roleChatAutoConfig: {
    mode: 'count',
    count: 4,
    duration: 60,
    variance: 1,
    cooldownBase: 2,
    cooldownVariance: 1,
    reactionDelayMin: 0.5,
    reactionDelayMax: 2,
  } as RoleChatAutoConfig,
  importSession: null,
  testHistory: [] as TestHistoryItem[],
  chatSessions: [] as ChatSession[],
  activeChatSessionId: null,
  nodeTestGlobalForm: { provider: 'modelscope', nodeId: undefined },
  nodeTestFormPerNode: {} as Record<string, Partial<NodeTestForm>>,
  // 向后兼容字段别名
  get imageGallery() { return this.testHistory },
  set imageGallery(v) { this.testHistory = v },
  get imageDemoGlobalForm() { return this.nodeTestGlobalForm },
  set imageDemoGlobalForm(v) { this.nodeTestGlobalForm = v },
  get imageDemoFormPerNode() { return this.nodeTestFormPerNode },
  set imageDemoFormPerNode(v) { this.nodeTestFormPerNode = v },
  splitPatterns: DEFAULT_SPLIT_PATTERNS.map((p) => ({ ...p })),
  cleanNodeOverrides: {} as Record<string, Partial<{ participating: boolean; concurrency: number; batchChars: number; intervalSec: number }>>,
  m1AutoRetry: true,
  m1TitleTemplate: '第{0n}章 {title}',
  m1TestText: `[爱心]第1章

　　中少女穿着巫女服，深棕色的长发，编成发辫垂在胸前，额头上沁出细密的汗珠。
　　转她正在教夏川神乐舞。
　　宭这是祭典前的完整排练，下周就要正式演出了。
　　伞"这个转身要流畅...夏川君看好了。"
　　柒三叶示范了一个旋转动作，巫女服的下摆扬起。
　　易她转得很稳，脚步轻盈得像在飘。
　　7夏川跟着做，但他的动作更...利落。
　　2少了些柔美，多了种说不出的神圣与力量感。
　　韭"不对不对..."
　　幺三叶走到他身后，犹豫了一下，然后红着脸伸手扶住他的腰，"腰要这样转..."
　　壹她的手很小，很软，隔着薄薄的衣物能感觉到温度。
　　韭夏川能闻到她身上淡淡的香味，不是香水，是皂角混合着少女体香的味道。


　　"啊...是、是的..."
　　三叶慌忙退开10016，心跳如71055小鹿乱撞一样不受控制。
　　她低下头，手指绞着衣角，耳根红得滴血。

　　那是四宫家最隐秘的武装力量，平时根本不会动用，只有在家族存亡关头才会出现。
　　"早坂。"
　　辉夜突小説羣3七然转身1七29，"你觉得，发生11九了什么？"
　　早坂爱沉吟片刻:"从情报看，不只是四宫家，其他几家财阀也有类似动作。"

　　"但在家族利益上...各凭本事。"
　　阳乃站微笑着起身，"中转峮公  3气1漆平竞（二）9吆伊9争，那就...合作愉快？"
　　"合作愉快。"

　　ps：正在悬赏中，也是月末最后一天了，系统送的月票和刀片如果有的话不送就过期了~求~
　　ps：悬赏结束，向上取整，月票欠四章，推荐票欠两章，打赏欠一章，刀片欠两章，……总计正好欠十章。
　　0求鲜花

欢迎加入『灵珑小说群』
分享废卢，刺猬猫等全网小说资源，每个群的文件不一样（之前的群没了，以下是新群）
（灵珑小说外群一群：852104278）
（灵珑小说外群二群：817040545）
（中转群371729119）
（ 备用2群893964460）
以上群号搜不到可以加qq264235286`,
  cleanRun: null,
  sessionRuntimes: {} as Record<string, SessionRuntime>,
  nodeTestSidebarMode: 'sessions' as 'app' | 'sessions',
  imageArchiveDir: '',
  theme: 'light' as const,
  enable4KScale: false,
  scaleBaseWidth: 0,
  nodeGroupExpanded: {},
  systemPromptPresets: [] as SystemPromptPreset[],
  systemPromptActiveId: null as string | null,
})

export const useAppStore = create<AppState>()((set, get) => ({
  ...seedState(),
  // 向后兼容：getter 别名映射
  get imageGallery() { return get().testHistory },
  get imageDemoGlobalForm() { return get().nodeTestGlobalForm },
  get imageDemoFormPerNode() { return get().nodeTestFormPerNode },
  setState: (patch) => set(patch),
  setCleanRun: (patch) =>
    set((s) => ({
      cleanRun: patch === null ? null : { ...(s.cleanRun ?? { handle: null, running: false, paused: false, active: [], nodeSessions: [], startedAt: 0 }), ...patch },
    })),
  patchSessionRuntime: (id, patch) =>
    set((s) => ({
      sessionRuntimes: { ...s.sessionRuntimes, [id]: { ...(s.sessionRuntimes[id] ?? defaultSessionRuntime()), ...patch } },
    })),
  clearSessionRuntime: (id) =>
    set((s) => {
      if (!(id in s.sessionRuntimes)) return {} as Partial<AppState>
      const next = { ...s.sessionRuntimes }
      delete next[id]
      return { sessionRuntimes: next }
    }),
  updateChapter: (id, patch) =>
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  updateCard: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  updateIssue: (id, patch) =>
    set((s) => ({
      issues: s.issues.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
  deleteBook: (id) => {
    /** 显式删除收集器：syncAll 已改为纯 upsert（永不删除），删除必须走 DELETE 端点。 */
    const deletes: Record<string, string[]> = {}
    const addIds = (key: string, ids: string[]) => { if (ids.length) deletes[key] = ids }
    set((s) => {
      // 收集待删 book 下的场景 id 与卡片 id，用于级联清理间接引用的 fragments / mergeCandidates
      const bookScenes = s.scenes.filter((sc) => sc.bookId === id)
      const bookSceneIds = new Set(bookScenes.map((sc) => sc.id))
      const bookCards = s.cards.filter((c) => c.bookId === id)
      const bookCardIds = new Set(bookCards.map((c) => c.id))
      const remainingBooks = s.books.filter((b) => b.id !== id)
      // 删除当前作品时：切到首个剩余 project；无 project 则置空
      const currentBookId =
        s.currentBookId === id
          ? remainingBooks.filter((b) => b.type === 'project')[0]?.id ?? ''
          : s.currentBookId
      // 收集将被移除的各实体 id（供 DELETE 端点精确删除）
      addIds('books', [id])
      addIds('chapters', s.chapters.filter((c) => c.bookId === id).map((c) => c.id))
      addIds('cards', bookCards.map((c) => c.id))
      addIds('outline', s.outline.filter((o) => o.bookId === id).map((o) => o.id))
      addIds('architectures', s.architectures.filter((a) => a.bookId === id).map((a) => a.id))
      addIds('scenes', bookScenes.map((sc) => sc.id))
      addIds('fragments', s.fragments.filter((f) => bookSceneIds.has(f.sceneId)).map((f) => f.id))
      addIds('stateEvents', s.stateEvents.filter((e) => e.bookId === id).map((e) => e.id))
      addIds('issues', s.issues.filter((i) => i.bookId === id).map((i) => i.id))
      addIds('mergeCandidates', s.mergeCandidates.filter((m) => bookCardIds.has(m.cardAId) || bookCardIds.has(m.cardBId)).map((m) => m.id))
      return {
        books: remainingBooks,
        chapters: s.chapters.filter((c) => c.bookId !== id),
        cards: s.cards.filter((c) => c.bookId !== id),
        outline: s.outline.filter((o) => o.bookId !== id),
        architectures: s.architectures.filter((a) => a.bookId !== id),
        scenes: s.scenes.filter((sc) => sc.bookId !== id),
        fragments: s.fragments.filter((f) => !bookSceneIds.has(f.sceneId)),
        stateEvents: s.stateEvents.filter((e) => e.bookId !== id),
        issues: s.issues.filter((i) => i.bookId !== id),
        mergeCandidates: s.mergeCandidates.filter(
          (m) => !bookCardIds.has(m.cardAId) && !bookCardIds.has(m.cardBId),
        ),
        currentBookId,
      }
    })
    // 显式删除：精确删除该书的级联 id（后端 syncAll 已不反推删除，必须显式 DELETE）。
    // 立即触发（绕 debounce），避免"删完立刻关窗"竞态丢失删除写入。
    pushDeleteNow(deletes)
  },
  // 重置业务数据（已移除演示数据，保留为清空全部业务数据的快捷操作）
  resetDemo: () => {
    /** 重置前先把当前业务数据全部显式删除（syncAll 不再反推删除）。 */
    const cur = useAppStore.getState()
    const deletes: Record<string, string[]> = {}
    for (const key of ['books', 'chapters', 'cards', 'outline', 'scenes', 'fragments', 'stateEvents', 'issues', 'architectures', 'mergeCandidates', 'imageGallery', 'chatSessions'] as const) {
      const arr = cur[key] as { id: string }[]
      const ids = arr.map((x) => x.id).filter(Boolean)
      if (ids.length) deletes[key] = ids
    }
    set({
      books: seedBooks,
      chapters: seedChapters,
      cards: seedCards,
      outline: seedOutline,
      scenes: seedScenes,
      fragments: seedFragments,
      stateEvents: seedStateEvents,
      issues: seedIssues,
      architectures: seedArchitectures,
      mergeCandidates: seedMergeCandidates,
      chatSessions: [],
      currentBookId: '',
      importSession: null,
    })
    // 先显式删旧业务数据（防残留），再立即 pushStore 落新种子（空数组）
    pushDeleteNow(deletes)
    pushStoreNow()
  },
  // ===== 节点测试 =====
  // 新测试历史插到头部（最新在前）；写入是关键操作 → 立即落库（绕过 1s 防抖）。
  addTestHistory: (item: TestHistoryItem) => {
    set((s) => ({ testHistory: [item, ...s.testHistory] }))
    pushStoreNow()
  },
  // 删除即从历史移除 → 立即显式删除该 id（syncAll 已不反推删除）。
  deleteTestHistory: (id: string) => {
    set((s) => ({ testHistory: s.testHistory.filter((i) => i.id !== id) }))
    pushDeleteNow({ testHistory: [id] })
  },
  // ===== 节点测试 · 对话记录（chat_sessions 表） =====
  createChatSession: (session) => {
    set((s) => ({ chatSessions: [session, ...s.chatSessions] }))
    pushStoreNow()
    return session.id
  },
  updateChatSession: (id, patch) => {
    set((s) => ({ chatSessions: s.chatSessions.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    pushStoreNow()
  },
  renameChatSession: (id, title) => {
    set((s) => ({ chatSessions: s.chatSessions.map((c) => (c.id === id ? { ...c, title } : c)) }))
    pushStoreNow()
  },
  deleteChatSession: (id) => {
    set((s) => {
      const next = { ...s.sessionRuntimes }
      delete next[id]
      return {
        chatSessions: s.chatSessions.filter((c) => c.id !== id),
        activeChatSessionId: s.activeChatSessionId === id ? null : s.activeChatSessionId,
        sessionRuntimes: next,
      }
    })
    pushDeleteNow({ chatSessions: [id] })
  },
  deleteChatSessions: (ids) => {
    const idSet = new Set(ids)
    set((s) => {
      const next = { ...s.sessionRuntimes }
      for (const id of ids) delete next[id]
      return {
        chatSessions: s.chatSessions.filter((c) => !idSet.has(c.id)),
        activeChatSessionId: s.activeChatSessionId && idSet.has(s.activeChatSessionId) ? null : s.activeChatSessionId,
        sessionRuntimes: next,
      }
    })
    pushDeleteNow({ chatSessions: ids })
  },
  setActiveChatSessionId: (id) => {
    set({ activeChatSessionId: id })
  },
  // 向后兼容方法别名
  addImage: (image: TestHistoryItem) => {
    get().addTestHistory(image)
  },
  deleteImage: (id: string) => {
    get().deleteTestHistory(id)
  },
  // ===== 章节检测模式池（设置通道，落 settings.json） =====
  setSplitPatterns: (patterns) => {
    set({ splitPatterns: patterns })
    pushSettingsNow()
  },
  resetSplitPatterns: () => {
    set({ splitPatterns: DEFAULT_SPLIT_PATTERNS.map((p) => ({ ...p })) })
    pushSettingsNow()
  },
  // ===== 节点测试 System Prompt 预设（全局共享，落 settings.json） =====
  saveSystemPromptPreset: (title, content) => {
    const st = get()
    const id = st.systemPromptActiveId
    if (id) {
      // 更新现有预设
      set({ systemPromptPresets: st.systemPromptPresets.map((p) => (p.id === id ? { ...p, title, content } : p)) })
    } else {
      // 新建预设并设为当前激活
      const newId = genId('sp')
      set({ systemPromptPresets: [...st.systemPromptPresets, { id: newId, title, content }], systemPromptActiveId: newId })
    }
    pushSettingsNow()
  },
  deleteSystemPromptPreset: (id) => {
    const st = get()
    set({
      systemPromptPresets: st.systemPromptPresets.filter((p) => p.id !== id),
      systemPromptActiveId: st.systemPromptActiveId === id ? null : st.systemPromptActiveId,
    })
    pushSettingsNow()
  },
  setSystemPromptActiveId: (id) => {
    set({ systemPromptActiveId: id })
    pushSettingsNow()
  },
  consumeProviderUsage: (nodeId) => {
    const node = useAppStore.getState().providers.find((p) => p.id === nodeId)
    if (!node) return false
    if (!node.usageLimitEnabled) return true
    const today = localDateKey()
    let left = node.usageLeft ?? 0
    let resetDate = node.usageResetDate ?? ''
    if (resetDate !== today) {
      left = node.usageLimit ?? 0
      resetDate = today
    }
    if (left <= 0) return false
    const next = left - 1
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === nodeId ? { ...p, usageLeft: next, usageResetDate: resetDate } : p,
      ),
    }))
    return true
  },
}))

// ===== 持久化与启动引导（已抽出，见 persistence.ts / bootstrap.ts）=====
// 注册三套订阅 + 关窗冲刷监听（必须在 useAppStore 定义后调用一次）。
registerPersisters()

// re-export 本地绑定：保所有调用方 import 路径零改动（仍从 '../store/appStore' 取这些符号）。
export {
  pushStoreNow,
  pushStoreNowChecked,
  pushDeleteNow,
  pushSettingsNow,
  pushImportSessionNow,
  flushStoreWrites,
  businessPayload,
  settingsPayload,
  bootstrapStore,
  reloadStoreFromBackend,
}

let idCounter = 0
/** 简易唯一 id */
export function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
