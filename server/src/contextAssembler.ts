// 上下文组装器（Context Assembler）—— DESIGN §4 点名的 M3/M4/M5 共用核心组件。
// 给定 book/章节/场景/目标角色，从资产库收集创作所需的全部上下文，返回结构化对象。
// 阶段 A 只做数据收集骨架，不拼最终 prompt（各创作端点在阶段 B/C 消费此对象自行拼装）。
import { readAll } from './store/db'
import { queryVectorStore, type RagChunk } from './store/vector'
import type { ProviderConfig } from './llmClient'

// 后端无共享 types（前端 services/types.ts 不被后端引用），此处内联所需最小字段。
interface BookLite { id: string; globalSummary?: string }
interface ChapterLite { id: string; bookId: string; index: number; title: string; summary?: string }
interface OutlineLite {
  id: string; bookId: string; volume: string; title: string; summary: string; order: number
  positioning?: string; role?: string; suspenseDensity?: string; foreshadow?: string; twistLevel?: number
}
interface ArchitectureLite {
  id: string; bookId: string; seed: string; characterDynamics: string; worldBuilding: string; plotStructure: string
}
interface StateEventLite {
  id: string; bookId: string; chapterId: string; entityId: string
  eventType: string; description: string; createdAt: string
}
interface FragmentLite { id: string; sceneId: string; characterId: string; adoptedText?: string; order: number }

export interface AssembleInput {
  bookId: string
  /** 目标章节序号（对齐 chapter.index / outline.order） */
  chapterIndex?: number
  /** M3 场景 id（取该场景已采纳的推演片段） */
  sceneId?: string
  /** 目标角色 id（推导其当前状态时间线） */
  targetCharacterId?: string
  /** 给定则做 RAG 召回 */
  rag?: { queryText: string; k?: number; provider: ProviderConfig }
}

export interface AssembledContext {
  bookId: string
  architecture: ArchitectureLite | null
  currentOutline: OutlineLite | null
  nextOutline: OutlineLite | null
  globalSummary: string
  prevChapterSummary: string
  /** 目标角色的状态事件时间线（按发生先后），用于推导「当前态」 */
  characterTimeline: StateEventLite[]
  ragChunks: RagChunk[]
  /** M4 硬约束：该场景已采纳的推演片段原文 */
  adoptedFragments: string[]
}

export async function assembleContext(input: AssembleInput): Promise<AssembledContext> {
  const data = readAll()
  const books = (data.books ?? []) as BookLite[]
  const chapters = (data.chapters ?? []) as ChapterLite[]
  const outline = (data.outline ?? []) as OutlineLite[]
  const architectures = (data.architectures ?? []) as ArchitectureLite[]
  const stateEvents = (data.stateEvents ?? []) as StateEventLite[]
  const fragments = (data.fragments ?? []) as FragmentLite[]

  const book = books.find((b) => b.id === input.bookId) ?? null
  const architecture = architectures.find((a) => a.bookId === input.bookId) ?? null

  const bookOutline = outline.filter((o) => o.bookId === input.bookId)
  const idx = input.chapterIndex // 提取局部常量，使 TS 在闭包内窄化非空
  const currentOutline = idx != null ? bookOutline.find((o) => o.order === idx) ?? null : null
  const nextOutline = idx != null ? bookOutline.find((o) => o.order === idx + 1) ?? null : null

  const prevChapter =
    idx != null ? chapters.find((c) => c.bookId === input.bookId && c.index === idx - 1) : undefined

  const characterTimeline = input.targetCharacterId
    ? stateEvents
        .filter((e) => e.bookId === input.bookId && e.entityId === input.targetCharacterId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : []

  const adoptedFragments = input.sceneId
    ? fragments
        .filter((f) => f.sceneId === input.sceneId && f.adoptedText)
        .sort((a, b) => a.order - b.order)
        .map((f) => f.adoptedText as string)
    : []

  const ragChunks = input.rag
    ? await queryVectorStore({
        queryText: input.rag.queryText,
        k: input.rag.k,
        bookId: input.bookId,
        provider: input.rag.provider,
      })
    : []

  return {
    bookId: input.bookId,
    architecture,
    currentOutline,
    nextOutline,
    globalSummary: book?.globalSummary ?? '',
    prevChapterSummary: prevChapter?.summary ?? '',
    characterTimeline,
    ragChunks,
    adoptedFragments,
  }
}
