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
    { name: 'novelhelper-mock', version: 1 },
  ),
)

let idCounter = 0
/** 简易唯一 id（mock 用） */
export function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
