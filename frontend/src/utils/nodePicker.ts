/**
 * 节点选择归一化 —— 已迁移至 `packages/node-pool/picker.ts`。
 *
 * 本文件保留 re-export，供现有调用方零改动继续使用。
 * 新代码建议直接从 `@/packages/node-pool/picker` 导入。
 */
export {
  nodeVendorName,
  nodeLabel,
  nodeModelName,
  isMultimodalNode,
  supportsImageEditNode,
  groupProviders,
} from '../packages/node-pool/picker'
export type { ProviderGroup } from '../packages/node-pool/picker'
