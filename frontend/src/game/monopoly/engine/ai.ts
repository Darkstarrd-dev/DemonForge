// AI 控制器：统一 AIController + 兜底降级（M8 全量实现）
import type { Action, DecisionRequest, GameState } from '../types'
import { TurnPhaseV2 } from '../types'
import { aiDecideWithStrategy } from './ai-strategies'
import type { LLMDecisionFn } from './ai-llm'

function getDiceCount(vehicle?: string): number {
  if (vehicle === 'CAR') return 3
  if (vehicle === 'MOTORCYCLE') return 2
  return 2
}

type AIDecideMode = 'strategy' | 'llm'

interface AIControllerState {
  llmFn?: LLMDecisionFn
  getPersona?: (playerId: string) => string
}

let controllerState: AIControllerState = {}

export function configureAIController(opts: { llmFn?: LLMDecisionFn; getPersona?: (playerId: string) => string }): void {
  controllerState = opts
}

export function resetAIController(): void {
  controllerState = {}
}

function getDecideMode(playerId: string, state: GameState): AIDecideMode {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) return 'strategy'
  if (controllerState.llmFn && player.aiNodeId) return 'llm'
  return 'strategy'
}

function difficultyOrDefault(player: { aiDifficulty?: 'easy' | 'normal' | 'hard' }): 'easy' | 'normal' | 'hard' {
  return player.aiDifficulty ?? 'normal'
}

export async function aiDecideAsync(state: GameState, request: DecisionRequest): Promise<string> {
  const player = state.players.find((p) => p.id === request.playerId)
  if (!player) return 'skip'
  const mode = getDecideMode(request.playerId, state)
  if (mode === 'llm' && controllerState.llmFn) {
    const persona = controllerState.getPersona?.(request.playerId) ?? `玩家 ${player.name}`
    try {
      const { buildLLMMessages } = await import('./ai-llm')
      const messages = buildLLMMessages(state, request, persona)
      const raw = await controllerState.llmFn(messages)
      const trimmed = raw.trim()
      return request.options.find((o) => trimmed.startsWith(o.id) || trimmed === o.id)?.id ?? request.options[0]?.id ?? 'skip'
    } catch {
      return aiDecideWithStrategy(state, request, difficultyOrDefault(player))
    }
  }
  return aiDecideWithStrategy(state, request, difficultyOrDefault(player))
}

export function aiDecide(state: GameState, request: DecisionRequest): string {
  return aiDecideWithStrategy(state, request, difficultyOrDefault(
    state.players.find((p) => p.id === request.playerId) ?? { aiDifficulty: 'normal' },
  ))
}

export function aiNextAction(state: GameState): Action | null {
  if (state.status === 'ended') return null
  const current = state.players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!current || current.controller !== 'ai') return null

  switch (state.turnContext.phase) {
    case TurnPhaseV2.ROLL_DICE: {
      const count = getDiceCount(current.vehicle)
      const dice = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6))
      return { type: 'ROLL_DICE', dice }
    }
    case TurnPhaseV2.TURN_END:
      return { type: 'END_TURN' }
    default:
      if (state.awaitingDecision?.playerId === current.id) {
        return { type: 'RESOLVE_DECISION', optionId: aiDecide(state, state.awaitingDecision) }
      }
      return null
  }
}
