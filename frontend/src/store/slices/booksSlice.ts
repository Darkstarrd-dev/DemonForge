import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import {
  seedBooks,
  seedChapters,
  seedCards,
  seedOutline,
  seedScenes,
  seedFragments,
  seedStateEvents,
  seedIssues,
  seedMergeCandidates,
  seedArchitectures,
} from '../../mocks/seed'
import { pushDeleteNow, pushStoreNow } from '../persistence'

/** 书库业务数据域：书/章/卡片/大纲/场景/片段/状态事件/一致性问题/架构/合并候选 + 当前作品。 */
export type BooksSlice = Pick<
  AppState,
  | 'books' | 'chapters' | 'cards' | 'outline' | 'scenes' | 'fragments'
  | 'stateEvents' | 'issues' | 'architectures' | 'mergeCandidates' | 'currentBookId'
  | 'updateChapter' | 'updateCard' | 'updateIssue' | 'deleteBook' | 'resetDemo'
>

export const createBooksSlice: StateCreator<AppState, [], [], BooksSlice> = (set, get) => ({
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
  currentBookId: '',

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
    const cur = get()
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
})
