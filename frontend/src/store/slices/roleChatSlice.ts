import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { RoleChatMode, RoleChatAutoConfig } from '../../services/types'

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

/** 角色交流域：模式 / Opencode 地址 / 自动循环配置（均经 setState 改写，无专属 action）。 */
export type RoleChatSlice = Pick<AppState, 'roleChatMode' | 'roleChatOpencodeURL' | 'roleChatAutoConfig'>

export const createRoleChatSlice: StateCreator<AppState, [], [], RoleChatSlice> = () => ({
  roleChatMode: 'local' as RoleChatMode,
  roleChatOpencodeURL: 'http://127.0.0.1:4096',
  roleChatAutoConfig: { ...defaultRoleChatAutoConfig },
})
