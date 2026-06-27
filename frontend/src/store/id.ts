// 简易唯一 id 生成器（A-7 阶段2 从 appStore.ts 抽出）。
// 独立无依赖模块：供 slices 与外部调用方共享，避免与 appStore 形成循环依赖。
let idCounter = 0
export function genId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
