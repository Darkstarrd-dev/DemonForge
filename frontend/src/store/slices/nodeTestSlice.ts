import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { defaultSessionRuntime } from '../types'
import type { TestHistoryItem, ChatSession } from '../../services/types'
import type { NodeTestForm } from '../types'
import { genId } from '../id'
import { pushStoreNow, pushDeleteNow, pushSettingsNow } from '../persistence'

/** 节点测试域：生成历史 / 对话记录 / session 运行态 / 全局与 per-node 表单 / System Prompt 预设。
 * 注：向后兼容字段别名 imageGallery/imageDemoGlobalForm/imageDemoFormPerNode 为 getter，
 * 定义在最外层 create（不被 slice spread 求值），不属本切片。 */
export type NodeTestSlice = Pick<
  AppState,
  | 'testHistory' | 'chatSessions' | 'activeChatSessionId'
  | 'nodeTestGlobalForm' | 'nodeTestFormPerNode'
  | 'sessionRuntimes' | 'nodeTestSidebarMode'
  | 'systemPromptPresets' | 'systemPromptActiveId'
  | 'patchSessionRuntime' | 'clearSessionRuntime'
  | 'addTestHistory' | 'deleteTestHistory'
  | 'createChatSession' | 'updateChatSession' | 'renameChatSession'
  | 'deleteChatSession' | 'deleteChatSessions' | 'setActiveChatSessionId'
  | 'addImage' | 'deleteImage'
  | 'saveSystemPromptPreset' | 'deleteSystemPromptPreset' | 'setSystemPromptActiveId'
>

export const createNodeTestSlice: StateCreator<AppState, [], [], NodeTestSlice> = (set, get) => ({
  testHistory: [] as TestHistoryItem[],
  chatSessions: [] as ChatSession[],
  activeChatSessionId: null,
  nodeTestGlobalForm: { provider: 'modelscope', nodeId: undefined },
  nodeTestFormPerNode: {} as Record<string, Partial<NodeTestForm>>,
  sessionRuntimes: {} as AppState['sessionRuntimes'],
  nodeTestSidebarMode: 'sessions' as 'app' | 'sessions',
  systemPromptPresets: [] as AppState['systemPromptPresets'],
  systemPromptActiveId: null as string | null,

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
})
