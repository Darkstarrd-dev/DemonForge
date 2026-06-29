/**
 * Provider / Node 解析器 —— 已迁移至 `packages/node-pool/resolver.ts`。
 *
 * 本文件保留 re-export，供现有调用方零改动继续使用。
 * 新代码建议直接从 `@/packages/node-pool/resolver` 导入。
 */
export {
  resolvedNodeName,
  findProviderById,
  findProviderNodeById,
  selectApiKey,
  markKeyUsed,
  updateKeyStateByError,
  resolveProviderNode,
  resolveProviderNodes,
  resolveAndUseProviderNode,
} from '../packages/node-pool/resolver'
export type { ResolverState } from '../packages/node-pool/resolver'
