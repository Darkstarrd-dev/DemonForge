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
} from '../mocks/seed'

export interface AppState {
  books: Book[]
  chapters: Chapter[]
  cards: EntityCard[]
  outline: OutlineNode[]
  scenes: SimScene[]
  fragments: SimFragment[]
  stateEvents: StateEvent[]
  issues: ConsistencyIssue[]
  providers: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
  /** M1 清理系统提示词（设置页持久化默认）。空串=用后端内置默认 */
  m1SystemPrompt: string
  /** 资产目录（业务数据 SQLite 库所在）。空串=后端用默认 <repo>/assets */
  assetDir: string
  mergeCandidates: MergeCandidate[]
  /** 当前作品（project 书）id，驱动 M3/M4/M5 */
  currentBookId: string
  /** M1 导入会话（页面流程态，仅内存、不持久化——含整份 rawText，避免反复回传） */
  importSession: ImportSession | null

  setState: (patch: Partial<AppState>) => void
  updateChapter: (id: string, patch: Partial<Chapter>) => void
  updateCard: (id: string, patch: Partial<EntityCard>) => void
  updateIssue: (id: string, patch: Partial<ConsistencyIssue>) => void
  resetDemo: () => void
}

const normalizeProvider = (p: Partial<ProviderNode> & { id: string; name: string; baseURL: string; model: string }): ProviderNode => ({
  ...p,
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
  providers: seedProviders,
  moduleMapping: seedModuleMapping,
  m1SystemPrompt: '',
  assetDir: '',
  mergeCandidates: seedMergeCandidates,
  currentBookId: 'book-proj-1',
  importSession: null,
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
  // 仅重置业务数据 + 导入会话；保留 providers/moduleMapping/m1SystemPrompt/assetDir（用户配置）
  resetDemo: () =>
    set({
      books: seedBooks,
      chapters: seedChapters,
      cards: seedCards,
      outline: seedOutline,
      scenes: seedScenes,
      fragments: seedFragments,
      stateEvents: seedStateEvents,
      issues: seedIssues,
      mergeCandidates: seedMergeCandidates,
      currentBookId: 'book-proj-1',
      importSession: null,
    }),
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
  mergeCandidates: s.mergeCandidates,
})

const pushStore = (payload: Record<string, unknown>) =>
  fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

/** 启动引导：先拉设置，再拉业务数据；后端为空则用种子并持久化一次（从种子重建）。 */
export async function bootstrapStore(): Promise<void> {
  try {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const d = (await res.json()) as {
        providers?: ProviderNode[]
        moduleMapping?: Record<ModuleKey, ModuleModelMapping>
        m1SystemPrompt?: string
        assetDir?: string
        currentBookId?: string
      }
      const patch: Partial<AppState> = {}
      if (d.providers?.length) patch.providers = d.providers.map((p) => normalizeProvider(p))
      if (d.moduleMapping) patch.moduleMapping = d.moduleMapping
      if (typeof d.m1SystemPrompt === 'string') patch.m1SystemPrompt = d.m1SystemPrompt
      if (typeof d.assetDir === 'string') patch.assetDir = d.assetDir
      if (typeof d.currentBookId === 'string' && d.currentBookId) patch.currentBookId = d.currentBookId
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
          mergeCandidates: (data.mergeCandidates ?? []) as MergeCandidate[],
        })
      } else {
        // 后端为空 → 用种子业务数据并持久化一次
        const seed = businessPayload(seedState() as unknown as AppState)
        useAppStore.setState(seed)
        await pushStore(seed)
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
      mergeCandidates: (data.mergeCandidates ?? []) as MergeCandidate[],
    })
  } else {
    // 新目录为空 → 填充种子并持久化
    const seed = businessPayload(seedState() as unknown as AppState)
    useAppStore.setState(seed)
    await pushStore(seed)
  }
}

// 业务数据回写：仅在 9 个业务切片引用变化时 debounce POST（导入会话变动不触发）
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
    s.mergeCandidates === prev.mergeCandidates
  ) {
    return
  }
  if (storeTimer) clearTimeout(storeTimer)
  storeTimer = setTimeout(() => {
    pushStore(businessPayload(useAppStore.getState())).catch(() => {})
  }, 1000)
})

// 设置回写：providers/moduleMapping/m1SystemPrompt/assetDir/currentBookId 变化时 debounce POST
let settingsTimer: ReturnType<typeof setTimeout> | null = null
useAppStore.subscribe((s, prev) => {
  if (!storeReady) return
  if (
    s.providers === prev.providers &&
    s.moduleMapping === prev.moduleMapping &&
    s.m1SystemPrompt === prev.m1SystemPrompt &&
    s.assetDir === prev.assetDir &&
    s.currentBookId === prev.currentBookId
  ) {
    return
  }
  if (settingsTimer) clearTimeout(settingsTimer)
  settingsTimer = setTimeout(() => {
    const st = useAppStore.getState()
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: st.providers,
        moduleMapping: st.moduleMapping,
        m1SystemPrompt: st.m1SystemPrompt,
        assetDir: st.assetDir,
        currentBookId: st.currentBookId,
      }),
    }).catch(() => {})
  }, 1000)
})

let idCounter = 0
/** 简易唯一 id */
export function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
