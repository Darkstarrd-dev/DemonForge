// AI 控制器（P4）：规则式决策。
// 本文件是「AI 驱动角色行动」的挂载点——P4 用规则，P5 可替换为 LLM 节点调用
// （读 Player.aiNodeId + 角色卡人设），上层 aiNextAction 的接口不变。

import type { Action, DecisionRequest, GameState } from './types'
import { rollDice } from './engine'

// 决策点策略：买得起就买（扩张优先）；现金充裕才升级；其余取第一项。
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

// 根据当前回合阶段，返回 AI 玩家应执行的下一个 action；非 AI 回合 / 已结束返回 null。
// 由 UI 的自动循环逐步调用，形成 human/AI 混合驱动。
export function aiNextAction(state: GameState): Action | null {
  if (state.status === 'ended') return null
  const current = state.players.find((p) => p.id === state.turn.currentPlayerId)
  if (!current || current.controller !== 'ai') return null

  switch (state.turn.phase) {
    case 'ROLL':
      return { type: 'ROLL_DICE', dice: rollDice() }
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
