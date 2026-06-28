// LLM 决策接口（M8 实现）：构建 prompt + 定义 LLM 回调类型
// streamChat 实际调用在 page 层进行（engine/ 目录保持纯 TS）
import type { GameState, DecisionRequest, AIDecisionResult } from '../types'
import type { ChatMessage } from '../../../services/real/chat'

export type LLMDecisionFn = (messages: ChatMessage[]) => Promise<string>

export function buildLLMMessages(
  state: GameState,
  request: DecisionRequest,
  persona: string,
): ChatMessage[] {
  const player = state.players.find((p) => p.id === request.playerId)
  const playerSummary = player
    ? `玩家 ${player.name}（ID=${player.id}）\n现金：${player.cash} | 存款：${player.bankDeposit ?? 0} | 贷款：${player.bankLoan ?? 0}\n总资产估值：${player.totalAssets ?? player.cash}\n位置：第 ${player.position} 格 | 持有地产：${player.ownedTileIds.length} 处`
    : '未知玩家'

  const body = request.options
    .map((o) => `  - ${o.id}: ${o.label}${o.preview?.description ? `（${o.preview.description}）` : ''}${o.preview?.cashDelta != null ? ` [现金变化: ${o.preview.cashDelta > 0 ? '+' : ''}${o.preview.cashDelta}]` : ''}`)
    .join('\n')

  return [
    {
      role: 'system',
      content: `你是大富翁游戏里的角色，需要根据当前游戏局势做出决策。请从以下选项中选一个，只回复选项 ID，不要解释。

角色设定：${persona}

决策规则：
- 分析当前局势、自己与其他玩家的资产差距
- 选择最有利于自己的选项
- 只输出一个选项 ID，不要附带任何其他文字`,
    },
    {
      role: 'user',
      content: `当前游戏状态：
第 ${state.day ?? 1} 天
${playerSummary}

决策类型：${request.kind}
决策描述：请从以下选项中选择：
${body}

请只回复选项 ID。`,
    },
  ]
}

export async function aiDecideWithLLM(
  state: GameState,
  request: DecisionRequest,
  llmFn: LLMDecisionFn,
  persona: string,
): Promise<AIDecisionResult> {
  const messages = buildLLMMessages(state, request, persona)
  try {
    const raw = await llmFn(messages)
    const trimmed = raw.trim()
    const optionId = request.options.find((o) => trimmed.startsWith(o.id) || trimmed === o.id)?.id ?? request.options[0]?.id ?? 'skip'
    return { action: { type: 'RESOLVE_DECISION', optionId }, reason: `LLM 选择: ${trimmed.slice(0, 100)}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { action: { type: 'RESOLVE_DECISION', optionId: 'skip' }, reason: `LLM 决策失败，降级至 skip（${msg}）` }
  }
}
