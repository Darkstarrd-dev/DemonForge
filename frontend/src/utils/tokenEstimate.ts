/**
 * Token 估算工具
 *
 * 基于经验公式：
 * - 中文：约 1.5-2 字符/token（取 1.8）
 * - 英文：约 4 字符/token
 * - 混合文本：取中文规则（小说内容以中文为主）
 */

export function estimateTokens(text: string): number {
  if (!text) return 0
  // 简化：统一按 1.8 字符/token 估算（小说内容以中文为主）
  return Math.ceil(text.length / 1.8)
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens} tokens`
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K tokens`
  return `${(tokens / 1000000).toFixed(2)}M tokens`
}

/**
 * 根据目标字数计算大致 token 数
 */
export function charsToTokens(chars: number): number {
  return Math.ceil(chars / 1.8)
}

/**
 * 根据目标 token 数计算大致字数
 */
export function tokensToChars(tokens: number): number {
  return Math.ceil(tokens * 1.8)
}
