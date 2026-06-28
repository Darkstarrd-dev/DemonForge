import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

/** UI 偏好域：资产目录 / 菜单栏 / 图片归档目录 / 主题 / 4K 缩放 / 节点分组折叠 / M2 卡片生成提示词覆盖 / 统一提示词覆盖（均经 setState 改写）。 */
export type UiPrefsSlice = Pick<
  AppState,
  | 'assetDir' | 'showMenuBar' | 'imageArchiveDir'
  | 'theme' | 'enable4KScale' | 'scaleBaseWidth' | 'nodeGroupExpanded'
  | 'm2CardGenPromptByType' | 'promptOverrides'
>

export const createUiPrefsSlice: StateCreator<AppState, [], [], UiPrefsSlice> = () => ({
  assetDir: '',
  showMenuBar: true,
  imageArchiveDir: '',
  theme: 'light' as const,
  enable4KScale: false,
  scaleBaseWidth: 0,
  nodeGroupExpanded: {},
  m2CardGenPromptByType: {},
  promptOverrides: {},
})
