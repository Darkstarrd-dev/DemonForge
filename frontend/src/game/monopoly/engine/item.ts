// Item 子系统：13 种道具效果（M4+ 实现，M0 骨架）
import type { GameState, Action } from '../types'

export function handleUseItem(state: GameState, _action: Action & { type: 'USE_ITEM' }): GameState {
  return state
}

export function handleBuyItem(state: GameState, _action: Action & { type: 'BUY_ITEM' }): GameState {
  return state
}

export function handleItemAction(state: GameState, action: Action): GameState {
  if (action.type === 'USE_ITEM') return handleUseItem(state, action)
  if (action.type === 'BUY_ITEM') return handleBuyItem(state, action)
  return state
}
