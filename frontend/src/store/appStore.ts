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
  GeneratedImage,
  SplitPattern,
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

/** 文生图 Demo 表单草稿（轻量，持久化到 settings.json） */
export interface ImageDemoForm {
  /** 服务商：当前仅 'modelscope' */
  provider: string
  /** 选中的文生图节点 id */
  nodeId?: string
  prompt: string
  /** 分辨率预设值，如 '1024x1024' */
  resolution: string
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
  /** 文生图 Demo 生成历史（持久化到 image_gallery 表，dataUrl 为 base64） */
  imageGallery: GeneratedImage[]
  /** 文生图 Demo 表单草稿（持久化到 settings.json） */
  imageDemoForm: ImageDemoForm
  /** M1 章节检测模式池（持久化到 settings.json，设置页可增删改） */
  splitPatterns: SplitPattern[]

  setState: (patch: Partial<AppState>) => void
  updateChapter: (id: string, patch: Partial<Chapter>) => void
  updateCard: (id: string, patch: Partial<EntityCard>) => void
  updateIssue: (id: string, patch: Partial<ConsistencyIssue>) => void
  /** 删除一本书及其全部关联数据（级联）。删除当前作品时切到首个剩余 project，无则置空 */
  deleteBook: (id: string) => void
  /** 文生图：新增一张生成图到历史头部 */
  addImage: (image: GeneratedImage) => void
  /** 文生图：按 id 删除一张历史图 */
  deleteImage: (id: string) => void
  /** 设置：覆盖章节检测模式池（立即落 settings.json） */
  setSplitPatterns: (patterns: SplitPattern[]) => void
  /** 设置：恢复章节检测模式池为内置默认（立即落 settings.json） */
  resetSplitPatterns: () => void
  resetDemo: () => void
}

const normalizeProvider = (p: Partial<ProviderNode> & { id: string; name: string; baseURL: string; model: string }): ProviderNode => ({
  ...p,
  nodeType: p.nodeType === 'image' ? 'image' : 'text',
  maxConcurrency: typeof p.maxConcurrency === 'number' && p.maxConcurrency > 0 ? p.maxConcurrency : 2,
  batchSize: typeof p.batchSize === 'number' && p.batchSize > 0 ? p.batchSize : 1,
  intervalSec: typeof p.intervalSec === 'number' && p.intervalSec >= 0 ? p.intervalSec : 0,
  enabled: p.enabled !== false,
  apiKey: p.apiKey ?? '',
  lastTestResult: p.lastTestResult ?? null,
})

const seedState = () => ({
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
  currentBookId: 'book-proj-1',
  importSession: null,
  imageGallery: [] as GeneratedImage[],
  imageDemoForm: { provider: 'modelscope', nodeId: undefined, prompt: '', resolution: '1024x1024' },
  splitPatterns: DEFAULT_SPLIT_PATTERNS.map((p) => ({ ...p })),
})

export const useAppStore = create<AppState>()((set) => ({
  ...seedState(),
  setState: (patch) => set(patch),
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
    set((s) => {
      // 收集待删 book 下的场景 id 与卡片 id，用于级联清理间接引用的 fragments / mergeCandidates
      const bookSceneIds = new Set(s.scenes.filter((sc) => sc.bookId === id).map((sc) => sc.id))
      const bookCardIds = new Set(s.cards.filter((c) => c.bookId === id).map((c) => c.id))
      const remainingBooks = s.books.filter((b) => b.id !== id)
      // 删除当前作品时：切到首个剩余 project；无 project 则置空
      const currentBookId =
        s.currentBookId === id
          ? remainingBooks.filter((b) => b.type === 'project')[0]?.id ?? ''
          : s.currentBookId
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
    // 删除是关键操作 → 立即落库（绕过 1s 防抖），避免"删完立刻关窗"竞态丢失写入。
    pushStoreNow()
  },
  // 仅重置业务数据 + 导入会话；保留 providers/moduleMapping/m1SystemPrompt/assetDir（用户配置）
  resetDemo: () => {
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
      currentBookId: 'book-proj-1',
      importSession: null,
    })
    // 重置同理立即落库
    pushStoreNow()
  },
  // ===== 文生图 Demo =====
  // 新图插到历史头部（最新在前）；写入是关键操作 → 立即落库（绕过 1s 防抖）。
  addImage: (image: GeneratedImage) => {
    set((s) => ({ imageGallery: [image, ...s.imageGallery] }))
    pushStoreNow()
  },
  // 删除即从历史移除 → syncAll 自动删 SQLite 对应行；立即落库避免"删完立刻关窗"竞态。
  deleteImage: (id: string) => {
    set((s) => ({ imageGallery: s.imageGallery.filter((i) => i.id !== id) }))
    pushStoreNow()
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
}))

// ===== 后端持久化（替代原 localStorage persist）=====
// 业务数据 → /api/store（SQLite 资产库）；设置类 → /api/settings（server 本地 JSON）。

let storeReady = false

const businessPayload = (s: AppState) => ({
  books: s.books,
  chapters: s.chapters,
  cards: s.cards,
  outline: s.outline,
  scenes: s.scenes,
  fragments: s.fragments,
  stateEvents: s.stateEvents,
  issues: s.issues,
  architectures: s.architectures,
  mergeCandidates: s.mergeCandidates,
  imageGallery: s.imageGallery,
})

const pushStore = (payload: Record<string, unknown>) =>
  fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

/** 启动引导：先拉设置，再拉业务数据；后端为空且从未初始化过才用种子播种。 */
export async function bootstrapStore(): Promise<void> {
  // 标记业务库是否已初始化过。用于区分「首次运行（后端为空→播种）」与
  // 「用户清空了全部书（后端为空但已初始化→保持空，不再回填种子）」。
  let storeInitialized = false
  try {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const d = (await res.json()) as {
        providers?: ProviderNode[]
        moduleMapping?: Record<ModuleKey, ModuleModelMapping>
        m1SystemPrompt?: string
        assetDir?: string
        currentBookId?: string
        storeInitialized?: boolean
        imageDemoForm?: ImageDemoForm
        showMenuBar?: boolean
        splitPatterns?: SplitPattern[]
      }
      storeInitialized = d.storeInitialized === true
      const patch: Partial<AppState> = {}
      if (d.providers?.length) patch.providers = d.providers.map((p) => normalizeProvider(p))
      // 合并 seed 默认键，防旧 settings.json 缺新增 ModuleKey 导致 Record 不全
      if (d.moduleMapping) patch.moduleMapping = { ...seedModuleMapping, ...d.moduleMapping }
      if (typeof d.m1SystemPrompt === 'string') patch.m1SystemPrompt = d.m1SystemPrompt
      if (typeof d.assetDir === 'string') patch.assetDir = d.assetDir
      if (typeof d.showMenuBar === 'boolean') patch.showMenuBar = d.showMenuBar
      if (typeof d.currentBookId === 'string' && d.currentBookId) patch.currentBookId = d.currentBookId
      // 文生图 Demo 表单草稿（旧 settings.json 无此键则沿用 seed 默认）
      if (d.imageDemoForm && typeof d.imageDemoForm === 'object')
        patch.imageDemoForm = { ...useAppStore.getState().imageDemoForm, ...d.imageDemoForm }
      // 章节检测模式池（旧 settings.json 无此键则沿用内置默认池；确保 custom 永在）
      if (Array.isArray(d.splitPatterns) && d.splitPatterns.length) {
        const hasCustom = d.splitPatterns.some((p) => p.key === 'custom')
        patch.splitPatterns = hasCustom ? d.splitPatterns : [...d.splitPatterns, { key: 'custom', label: '自定义正则', regex: '', builtin: true }]
      }
      if (Object.keys(patch).length) useAppStore.setState(patch)
    }
  } catch {
    /* 后端不可用：沿用内存种子设置 */
  }

  try {
    const res = await fetch('/api/store')
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown[]>
      if (Array.isArray(data.books) && data.books.length > 0) {
        useAppStore.setState({
          books: data.books as Book[],
          chapters: (data.chapters ?? []) as Chapter[],
          cards: (data.cards ?? []) as EntityCard[],
          outline: (data.outline ?? []) as OutlineNode[],
          scenes: (data.scenes ?? []) as SimScene[],
          fragments: (data.fragments ?? []) as SimFragment[],
          stateEvents: (data.stateEvents ?? []) as StateEvent[],
          issues: (data.issues ?? []) as ConsistencyIssue[],
          architectures: (data.architectures ?? []) as NovelArchitecture[],
          mergeCandidates: (data.mergeCandidates ?? []) as MergeCandidate[],
          imageGallery: (data.imageGallery ?? []) as GeneratedImage[],
        })
        // 旧 settings.json 没有该标记 → 趁这次有数据时补写，避免后续"删光"误触发回填
        if (!storeInitialized) {
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeInitialized: true }),
          }).catch(() => {})
        }
      } else if (!storeInitialized) {
        // 仅「首次运行」播种：后端为空且从未初始化过 → 用种子并持久化 + 标记已初始化
        const seed = businessPayload(seedState() as unknown as AppState)
        useAppStore.setState(seed)
        await pushStore(seed)
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeInitialized: true }),
        }).catch(() => {})
      } else {
        // 已初始化但库为空（用户删光了书 / 切到空目录）→ 必须显式把内存清空，
        // 否则内存里仍是 seedState() 的两本种子书，后续任意 setState（如 currentBookId
        // 改动）触发 storeReady 订阅 → 把这两本假书 pushStore 回后端 → 重启后「自动冒出」。
        // ⚠️ 关键：清空前先临时关掉 storeReady，避免"内存清空"这一步本身触发订阅把空数组
        // POST 回后端、反向删除后端未来可能恢复的数据。清空后重新开启 storeReady。
        // （若刚入库的书因后端瞬时读空走到这里，pushStoreNow 已在入库时即时落库；此处清空
        // 只影响内存，不影响后端。）
        storeReady = false
        useAppStore.setState({
          books: [],
          chapters: [],
          cards: [],
          outline: [],
          scenes: [],
          fragments: [],
          stateEvents: [],
          issues: [],
          architectures: [],
          mergeCandidates: [],
          imageGallery: [],
        })
        storeReady = true
      }
    }
  } catch {
    /* 后端不可用：保留内存种子，仅本会话有效 */
  }

  storeReady = true
}

/** 切换资产目录后重新载入该目录的业务数据。 */
export async function reloadStoreFromBackend(): Promise<void> {
  const res = await fetch('/api/store')
  if (!res.ok) return
  const data = (await res.json()) as Record<string, unknown[]>
  if (Array.isArray(data.books) && data.books.length > 0) {
    useAppStore.setState({
      books: data.books as Book[],
      chapters: (data.chapters ?? []) as Chapter[],
      cards: (data.cards ?? []) as EntityCard[],
      outline: (data.outline ?? []) as OutlineNode[],
      scenes: (data.scenes ?? []) as SimScene[],
      fragments: (data.fragments ?? []) as SimFragment[],
      stateEvents: (data.stateEvents ?? []) as StateEvent[],
      issues: (data.issues ?? []) as ConsistencyIssue[],
      architectures: (data.architectures ?? []) as NovelArchitecture[],
      mergeCandidates: (data.mergeCandidates ?? []) as MergeCandidate[],
      imageGallery: (data.imageGallery ?? []) as GeneratedImage[],
    })
  } else {
    // 目标目录无业务数据 → 视为空书库，保持空（不再自动播种 Mock 演示作品）。
    // 用户可经 M0 立项 / M1 导入自行创建作品。同样须显式清空内存，避免回切旧
    // 目录后残留的内存种子被 storeReady 订阅写回后端。
    useAppStore.setState({
      books: [],
      chapters: [],
      cards: [],
      outline: [],
      scenes: [],
      fragments: [],
      stateEvents: [],
      issues: [],
      architectures: [],
      mergeCandidates: [],
      imageGallery: [],
    })
  }
}

// 业务数据回写：仅在业务切片引用变化时 debounce POST（导入会话变动不触发）
let storeTimer: ReturnType<typeof setTimeout> | null = null
useAppStore.subscribe((s, prev) => {
  if (!storeReady) return
  if (
    s.books === prev.books &&
    s.chapters === prev.chapters &&
    s.cards === prev.cards &&
    s.outline === prev.outline &&
    s.scenes === prev.scenes &&
    s.fragments === prev.fragments &&
    s.stateEvents === prev.stateEvents &&
    s.issues === prev.issues &&
    s.architectures === prev.architectures &&
    s.mergeCandidates === prev.mergeCandidates &&
    s.imageGallery === prev.imageGallery
  ) {
    return
  }
  if (storeTimer) clearTimeout(storeTimer)
  storeTimer = setTimeout(() => {
    pushStore(businessPayload(useAppStore.getState())).catch(() => {})
  }, 1000)
})

// 立即把当前业务状态推送到后端（绕过 1s 防抖）。用于删除/重置/**入库**等一次性关键操作：
// 点击即落库，不依赖 beforeunload（Electron 卸载时机不稳定，1s 内关窗会丢写入）。
// function 声明被提升，故 store actions（定义在上方）可在运行时引用。
// 导出供 Step4 入库等关键写操作立即落库（避免依赖 debounce 在关窗竞态下丢失）。
// 返回 Promise 以便调用方 await（入库前必须确认落库，再提示成功）。
export function pushStoreNow(): Promise<void> {
  if (!storeReady) return Promise.resolve()
  if (storeTimer) {
    clearTimeout(storeTimer)
    storeTimer = null
  }
  return pushStore(businessPayload(useAppStore.getState())).then(() => undefined).catch(() => {})
}

// 设置回写：providers/moduleMapping/m1SystemPrompt/assetDir/currentBookId/imageDemoForm/
// showMenuBar/splitPatterns 变化时 debounce POST
const settingsPayload = (s: AppState) => ({
  providers: s.providers,
  moduleMapping: s.moduleMapping,
  m1SystemPrompt: s.m1SystemPrompt,
  assetDir: s.assetDir,
  currentBookId: s.currentBookId,
  imageDemoForm: s.imageDemoForm,
  showMenuBar: s.showMenuBar,
  splitPatterns: s.splitPatterns,
})

let settingsTimer: ReturnType<typeof setTimeout> | null = null
useAppStore.subscribe((s, prev) => {
  if (!storeReady) return
  if (
    s.providers === prev.providers &&
    s.moduleMapping === prev.moduleMapping &&
    s.m1SystemPrompt === prev.m1SystemPrompt &&
    s.assetDir === prev.assetDir &&
    s.currentBookId === prev.currentBookId &&
    s.imageDemoForm === prev.imageDemoForm &&
    s.showMenuBar === prev.showMenuBar &&
    s.splitPatterns === prev.splitPatterns
  ) {
    return
  }
  if (settingsTimer) clearTimeout(settingsTimer)
  settingsTimer = setTimeout(() => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload(useAppStore.getState())),
    }).catch(() => {})
  }, 1000)
})

// 立即把当前设置推送到后端（绕过 1s 防抖）。用于 splitPatterns 编辑/恢复等关键操作。
// function 声明被提升，故 store actions（定义在上方）可在运行时引用。
function pushSettingsNow(): void {
  if (!storeReady) return
  if (settingsTimer) {
    clearTimeout(settingsTimer)
    settingsTimer = null
  }
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsPayload(useAppStore.getState())),
  }).catch(() => {})
}

// 关窗/退出时立即冲刷未提交的 debounce 写入。
// 业务数据写入有 1s debounce，若用户删除后立刻关窗，定时器未触发 → 后端拿不到删除 → 重启后数据回归。
// beforeunload 用 keepalive:true 让请求能熬过页面卸载，确保最后一次状态落库。
export async function flushStoreWrites(): Promise<void> {
  if (storeTimer) {
    clearTimeout(storeTimer)
    storeTimer = null
  }
  if (settingsTimer) {
    clearTimeout(settingsTimer)
    settingsTimer = null
  }
  const st = useAppStore.getState()
  await Promise.all([
    fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(businessPayload(st)),
      keepalive: true,
    }).catch(() => {}),
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload(st)),
      keepalive: true,
    }).catch(() => {}),
  ])
}

if (typeof window !== 'undefined') {
  // 页面卸载前尽力冲刷（fire-and-forget，靠 keepalive 续命）
  window.addEventListener('beforeunload', () => {
    void flushStoreWrites()
  })
  window.addEventListener('pagehide', () => {
    void flushStoreWrites()
  })
}

let idCounter = 0
/** 简易唯一 id */
export function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
