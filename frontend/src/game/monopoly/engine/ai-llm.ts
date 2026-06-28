// LLM 决策接口（M8+ 实现，M0 骨架）
import type { AIDecisionContext, AIDecisionResult } from '../types'

export async function aiDecideWithLLM(_ctx: AIDecisionContext): Promise<AIDecisionResult> {
  return { action: { type: 'END_TURN' }, reason: 'LLM 决策未实现（M0 骨架）' }
}
