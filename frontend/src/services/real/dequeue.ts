// 从 startCleanQueue 抽出的纯函数：按字数累积组 batch。
//
// 行为与原闭包内联实现逐字一致（仅把闭包队列改为参数），便于单测覆盖边界：
// - 先排空 retryQueue（重试优先），再从 pendingQueue 补足；
// - 每队列内：首个任务**无条件取出**（result 为空时跳过字数检查，避免单章超 maxChars 时永远取不到）；
// - 之后每个任务：若 result 非空且累计 + 本章字数 > maxChars 则停；取出后若累计 >= maxChars 也停。
//
// 注：与原实现一致，本函数**会 mutate 传入的两个队列**（shift 取出已收纳的任务）。
// 泛型化（只依赖 `content` 字段）以与 llm.ts 的 ChapterTask 解耦。

export function dequeueBatch<T extends { content: string }>(
  retryQueue: T[],
  pendingQueue: T[],
  maxChars: number,
): T[] {
  const result: T[] = []
  let accChars = 0

  // 优先重试队列
  while (retryQueue.length > 0) {
    const task = retryQueue[0]
    // 已有章节时检查是否超限（首章不受限制，避免单章过大时永远取不到）
    if (result.length > 0 && accChars + task.content.length > maxChars) break
    retryQueue.shift()
    result.push(task)
    accChars += task.content.length
    // 累积达标且已有至少1章，停止继续取
    if (accChars >= maxChars) break
  }

  // 再从 pending 队列补足
  while (pendingQueue.length > 0) {
    const task = pendingQueue[0]
    // 已有章节时检查是否超限
    if (result.length > 0 && accChars + task.content.length > maxChars) break
    pendingQueue.shift()
    result.push(task)
    accChars += task.content.length
    if (accChars >= maxChars) break
  }

  return result
}
