import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  mergeCandidates: MergeCandidate[]
  /** 当前作品（project 书）id，驱动 M3/M4/M5 */
  currentBookId: string
  /** M1 导入会话（页面流程态） */
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
  mergeCandidates: seedMergeCandidates,
  currentBookId: 'book-proj-1',
  importSession: null,
})

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
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
      resetDemo: () => set(seedState()),
    }),
    {
      name: 'novelhelper-mock',
      version: 1,
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) return
          void (async () => {
            try {
              const res = await fetch('/api/settings')
              if (!res.ok) return
              const data = await res.json() as { providers?: ProviderNode[]; moduleMapping?: Record<ModuleKey, ModuleModelMapping>; m1SystemPrompt?: string }
              if (data?.providers?.length) {
                useAppStore.setState({
                  providers: data.providers.map((p: ProviderNode) => normalizeProvider(p)),
                  moduleMapping: data.moduleMapping ?? useAppStore.getState().moduleMapping,
                  m1SystemPrompt: typeof data.m1SystemPrompt === 'string' ? data.m1SystemPrompt : useAppStore.getState().m1SystemPrompt,
                })
              }
            } catch { /* server not available */ }
          })()
        }
      },
    },
  ),
)

let syncTimer: ReturnType<typeof setTimeout> | null = null
let _lastSynced = ''
useAppStore.subscribe((s) => {
  const payload = JSON.stringify({ providers: s.providers, moduleMapping: s.moduleMapping, m1SystemPrompt: s.m1SystemPrompt })
  if (payload === _lastSynced) return
  _lastSynced = payload
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => {})
  }, 1000)
})

let idCounter = 0
/** 简易唯一 id（mock 用） */
export function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
