// Card 子系统：30 种卡片效果执行 + 反制链（M3+ 实现，M0 骨架）
import type { GameState, Action } from '../types'

export function handleUseCard(state: GameState, _action: Action & { type: 'USE_CARD' }): GameState {
  return state
}

export function handleBuyCard(state: GameState, _action: Action & { type: 'BUY_CARD' }): GameState {
  return state
}

export function handleCardAction(state: GameState, action: Action): GameState {
  if (action.type === 'USE_CARD') return handleUseCard(state, action)
  if (action.type === 'BUY_CARD') return handleBuyCard(state, action)
  return state
}
