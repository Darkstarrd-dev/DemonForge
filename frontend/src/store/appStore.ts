// ===== appStore 组合根（A-7 阶段2）=====
// 状态/逻辑按域拆到 slices/*；类型在 types.ts；持久化在 persistence.ts；引导在 bootstrap.ts。
// 本文件仅：组合 6 个 slice + 向后兼容 getter 别名 + setState，注册持久化，统一 re-export
// 保所有调用方 import 路径零改动（仍从 '../store/appStore' 取 useAppStore / 各函数 / 各类型）。
import { create } from 'zustand'
import type { AppState } from './types'
import { createBooksSlice } from './slices/booksSlice'
import { createNodeTestSlice } from './slices/nodeTestSlice'
import { createM1ImportSlice } from './slices/m1ImportSlice'
import { createRoleChatSlice } from './slices/roleChatSlice'
import { createProviderSlice } from './slices/providerSlice'
import { createUiPrefsSlice } from './slices/uiPrefsSlice'
import { registerPersisters } from './persistence'

export const useAppStore = create<AppState>()((set, get, store) => ({
  ...createBooksSlice(set, get, store),
  ...createNodeTestSlice(set, get, store),
  ...createM1ImportSlice(set, get, store),
  ...createRoleChatSlice(set, get, store),
  ...createProviderSlice(set, get, store),
  ...createUiPrefsSlice(set, get, store),
  setState: (patch) => set(patch),
  // 向后兼容 getter 别名：最外层定义（不被 slice spread 求值，保持 accessor 语义）。
  get imageGallery() { return get().testHistory },
  get imageDemoGlobalForm() { return get().nodeTestGlobalForm },
  get imageDemoFormPerNode() { return get().nodeTestFormPerNode },
}))

// 注册三套订阅 + 关窗冲刷监听（必须在 useAppStore 定义后调用一次）。
registerPersisters()

// re-export：保所有调用方 import 路径零改动。
export type {
  AppState,
  NodeTestForm,
  SystemPromptPreset,
  ImageDemoForm,
  CleanRunActiveTask,
  CleanRunNodeSession,
  CleanRunState,
} from './types'
export { defaultSessionRuntime } from './types'
export { genId } from './id'
export {
  pushStoreNow,
  pushStoreNowChecked,
  pushDeleteNow,
  pushSettingsNow,
  pushNodePoolNow,
  pushImportSessionNow,
  flushStoreWrites,
  businessPayload,
  settingsPayload,
  nodePoolPayload,
} from './persistence'
export { bootstrapStore, reloadStoreFromBackend } from './bootstrap'
