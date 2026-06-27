import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { defaultRoleChatRuntime } from '../types'
import type { RoleChatAutoConfig } from '../../services/types'

/** 角色交流自动循环默认配置。导出供 bootstrap 合并旧 settings.json（缺键沿用默认）。 */
export const defaultRoleChatAutoConfig: RoleChatAutoConfig = {
  mode: 'count',
  count: 4,
  duration: 60,
  variance: 1,
  cooldownBase: 2,
  cooldownVariance: 1,
  reactionDelayMin: 0.5,
  reactionDelayMax: 2,
}

/** 角色交流域：参与者 / 群聊流 / 场景 / 激活 session / 侧栏模式 / 各参与者运行态 / 自动循环配置。
 *  参与者/消息/场景/激活/侧栏/运行态均为内存态（不持久化）；仅 autoConfig 为配置项。 */
export type RoleChatSlice = Pick<
  AppState,
  | 'roleChatParticipants' | 'roleChatMessages' | 'roleChatSceneSetting'
  | 'roleChatActiveSessionId' | 'roleChatSidebarMode' | 'roleChatRuntimes'
  | 'roleChatAutoConfig'
  | 'patchRoleChatRuntime' | 'clearRoleChatRuntime'
>

export const createRoleChatSlice: StateCreator<AppState, [], [], RoleChatSlice> = (set) => ({
  roleChatParticipants: [],
  roleChatMessages: [],
  roleChatSceneSetting: '',
  roleChatActiveSessionId: 'main',
  roleChatSidebarMode: 'sessions',
  roleChatRuntimes: {},
  roleChatAutoConfig: { ...defaultRoleChatAutoConfig },

  patchRoleChatRuntime: (id, patch) =>
    set((s) => ({
      roleChatRuntimes: {
        ...s.roleChatRuntimes,
        [id]: { ...(s.roleChatRuntimes[id] ?? defaultRoleChatRuntime()), ...patch },
      },
    })),
  clearRoleChatRuntime: (id) =>
    set((s) => {
      if (!(id in s.roleChatRuntimes)) return {} as Partial<AppState>
      const next = { ...s.roleChatRuntimes }
      delete next[id]
      return { roleChatRuntimes: next }
    }),
})
