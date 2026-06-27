// 示例角色（P5 角色卡接入演示用）。
//
// 这是「角色卡接入」的数据源占位。项目 M2 角色卡（store.cards: EntityCard）稳定后，
// 可直接替换为真实角色：把 EntityCard.id → id、name → name、description/styleNote → persona、
// 由名称生成 color 即可，下游（NewGameModal / 显示 / AI 人设注入）接口不变。

export interface MonopolyCharacter {
  id: string
  name: string
  persona: string // 人设：AI 决策注入用（P5 预留，P5+ 接 LLM 时作为 system 提示）
  color: string // 棋子 / 头像色
}

export const PRESET_CHARACTERS: MonopolyCharacter[] = [
  { id: 'char-1', name: '林若曦', persona: '精明的女商人，热衷囤地扩张，见好地就买', color: '#E74C3C' },
  { id: 'char-2', name: '赵铁柱', persona: '稳健的老地主，偏好升级核心地产、稳扎稳打', color: '#3498DB' },
  { id: 'char-3', name: '苏晴', persona: '激进的投机者，敢押重注、追求高回报', color: '#27AE60' },
  { id: 'char-4', name: '陈墨', persona: '谨慎的理财师，注重现金流、量入为出', color: '#F39C12' },
  { id: 'char-5', name: '周伯通', persona: '随性的老顽童，全凭兴致决策', color: '#9B59B6' },
  { id: 'char-6', name: '何蓉', persona: '冷静的分析师，精算每一笔过路费与回本', color: '#16A085' },
]
