/**
 * Provider / Node 规范化 —— 已迁移至 `packages/node-pool/normalize.ts`。
 *
 * 本文件保留 re-export，供现有调用方零改动继续使用。
 * 新代码建议直接从 `@/packages/node-pool/normalize` 导入。
 */
export {
  normalizeProviderApiKey,
  normalizeProvider,
  normalizeProviderNode,
} from '../packages/node-pool/normalize'
export type {
  // normalize 函数无额外公开类型
} from '../packages/node-pool/normalize'
