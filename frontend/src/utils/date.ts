// 本地自然日工具。
// 历史 bug：节点每日额度重置曾用 new Date().toISOString().slice(0,10) 取 UTC 日期，
// 在 UTC+8 每日 00:00–08:00 仍是前一天，导致额度清晨不重置。本函数按本地时区返回 YYYY-MM-DD。

/** 返回本地时区的自然日键，格式 YYYY-MM-DD。 */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
