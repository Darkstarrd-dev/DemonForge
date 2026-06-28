// AI 三档难度策略实现（M8+ 实现，M0 骨架）
import type { AIConfig, GameState, DecisionRequest } from '../types'

export const AI_CONFIGS: Record<string, AIConfig> = {
  easy:   { difficulty: 'easy',   purchaseThreshold: 0.5, buildThreshold: 0.5, attackCardPropensity: 0.1, targetLeader: false, considerPriceIndex: false },
  normal: { difficulty: 'normal', purchaseThreshold: 1.5, buildThreshold: 2.0, attackCardPropensity: 0.5, targetLeader: false, considerPriceIndex: false },
  hard:   { difficulty: 'hard',   purchaseThreshold: 2.0, buildThreshold: 3.0, attackCardPropensity: 0.9, targetLeader: true,  considerPriceIndex: true  },
}

export function aiDecideWithStrategy(state: GameState, request: DecisionRequest, difficulty: 'easy' | 'normal' | 'hard'): string {
  const cfg = AI_CONFIGS[difficulty]
  const player = state.players.find((p) => p.id === request.playerId)
  if (!player) return 'skip'

  if (request.kind === 'buyProperty') {
    const price = (request.context.price as number) ?? 0
    if (player.cash >= price * (1 / cfg.purchaseThreshold)) return 'buy'
    return 'skip'
  }
  if (request.kind === 'upgradeProperty') {
    const cost = (request.context.cost as number) ?? 0
    if (player.cash > cost * cfg.buildThreshold) return 'upgrade'
    return 'skip'
  }
  return request.options[0]?.id ?? 'skip'
}
