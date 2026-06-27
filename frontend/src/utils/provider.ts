/**
 * Provider 节点规范化（纯函数，无副作用，无框架依赖）。
 * 从 appStore.ts 抽出——backup.ts 的纯函数单测需要引用它，而 appStore 依赖 zustand/浏览器
 * 环境无法在纯 node 下加载。此处独立成模块，appStore 与 backup.ts 共用。
 */
import type { ProviderNode } from '../services/types'

/** 规范化 Provider 节点：为旧版/缺字段数据补默认值（向后兼容）。 */
export const normalizeProvider = (
  p: Partial<ProviderNode> & { id: string; name: string; baseURL: string; model: string },
): ProviderNode => ({
  ...p,
  nodeType: p.nodeType === 'image' ? 'image' : 'text',
  maxConcurrency: typeof p.maxConcurrency === 'number' && p.maxConcurrency > 0 ? p.maxConcurrency : 2,
  batchChars: typeof p.batchChars === 'number' && p.batchChars > 0 ? p.batchChars :
              // 向后兼容：旧版 batchSize 转换为 batchChars
              (typeof (p as { batchSize?: number }).batchSize === 'number' ? (p as { batchSize?: number }).batchSize! * 3000 : 10000),
  intervalSec: typeof p.intervalSec === 'number' && p.intervalSec >= 0 ? p.intervalSec : 0,
  enabled: p.enabled !== false,
  apiKey: p.apiKey ?? '',
  lastTestResult: p.lastTestResult ?? null,
  usageLimitEnabled: p.usageLimitEnabled === true,
  usageLimit: typeof p.usageLimit === 'number' && p.usageLimit >= 0 ? p.usageLimit : 0,
  usageLeft: typeof p.usageLeft === 'number' && p.usageLeft >= 0 ? p.usageLeft : 0,
  usageResetDate: p.usageResetDate ?? '',
  supportsImageEdit: p.nodeType === 'image' && (p.protocol === 'xai' || p.protocol === 'gpt') ? true : p.supportsImageEdit === true,
  isMultimodal: p.isMultimodal === true,
  protocol: p.nodeType === 'image' ? (p.protocol === 'gpt' ? 'gpt' : p.protocol === 'xai' ? 'xai' : 'modelscope') : undefined,
})
