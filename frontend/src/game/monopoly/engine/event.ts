// Event 子系统：新闻 / 魔法屋 / 命运 / 宝箱 / 乐透 / 传送 / 小游戏（M6+ 实现，M0 骨架）
import type { GameState, Action } from '../types'

export function handleTriggerEvent(state: GameState, _action: Action & { type: 'TRIGGER_EVENT' }): GameState {
  return state
}

export function handleMiniGameResult(state: GameState, _action: Action & { type: 'MINI_GAME_RESULT' }): GameState {
  return state
}

export function handleEventAction(state: GameState, action: Action): GameState {
  if (action.type === 'TRIGGER_EVENT') return handleTriggerEvent(state, action)
  if (action.type === 'MINI_GAME_RESULT') return handleMiniGameResult(state, action)
  return state
}
