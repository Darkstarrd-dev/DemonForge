// AI 控制器：规则式决策 + 自动循环入口（P4 重构版）
import type { Action, DecisionRequest, GameState } from '../types'

export function aiDecide(state: GameState, request: DecisionRequest): string {
  const player = state.players.find((p) => p.id === request.playerId)
  if (!player) return 'skip'

  if (request.kind === 'buyProperty') {
    return 'buy'
  }
  if (request.kind === 'upgradeProperty') {
    const cost = (request.context.cost as number) ?? 0
    return player.cash > cost * 3 ? 'upgrade' : 'skip'
  }
  return request.options[0]?.id ?? 'skip'
}

export function aiNextAction(state: GameState): Action | null {
  if (state.status === 'ended') return null
  const current = state.players.find((p) => p.id === state.turn.currentPlayerId)
  if (!current || current.controller !== 'ai') return null

  switch (state.turn.phase) {
    case 'ROLL': {
      const dice: [number, number] = [
        1 + Math.floor(Math.random() * 6),
        1 + Math.floor(Math.random() * 6),
      ]
      return { type: 'ROLL_DICE', dice }
    }
    case 'DECIDE':
      if (state.awaitingDecision?.playerId === current.id) {
        return { type: 'RESOLVE_DECISION', optionId: aiDecide(state, state.awaitingDecision) }
      }
      return null
    case 'END_TURN':
      return { type: 'END_TURN' }
    default:
      return null
  }
}
