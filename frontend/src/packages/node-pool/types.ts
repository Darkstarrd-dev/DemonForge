/**
 * 节点池（Node Pool）核心类型定义。
 *
 * 本文件是节点池模块的「类型真相源」：Provider / ProviderNode / ResolvedProviderNode
 * 等类型原先位于 services/types.ts，现整体迁入此独立包，供节点池内部与业务调用方共用。
 * 任何不依赖 novelhelper 业务数据的项目均可直接 import 本文件。
 */

/** 节点用途：文本(默认) / 图片 */
export type ProviderNodeType = 'text' | 'image'

/** 根据模块 Key 返回所需节点类型：仅 m2CardImage 为 image，其余均为 text。 */
export function getModuleNodeType(key: ModuleKey): ProviderNodeType {
  return key === 'm2CardImage' ? 'image' : 'text'
}

/** 图片生图协议：ModelScope 异步任务 / GPT Image 同步 API / xAI Imagine 同步 API */
export type ImageProtocol = 'modelscope' | 'gpt' | 'xai'

/** 供应商级 API KEY 状态。 */
export type ProviderApiKeyState = 'ok' | 'exhausted' | 'disabled'

/** 供应商轮询策略：round-robin 分散负载；failover 固定主 key，失败才切换（适合按 token / 支持 cache 的供应商）。 */
export type ProviderRotationPolicy = 'round-robin' | 'failover'

/** 供应商下的单个 API KEY。 */
export interface ProviderApiKey {
  id: string
  key: string
  /** 可选备注，如 "主 key" / "备用-1" */
  label?: string
  /** 是否启用（用户可临时关闭某 key） */
  enabled: boolean
  /** 运行态：ok 正常 / exhausted 额度或速率暂耗尽 / disabled 认证失败等永久失效 */
  state: ProviderApiKeyState
  /** 上次使用时间戳 */
  lastUsedAt?: number
  /** 连续失败次数 */
  consecFailures?: number
}

/**
 * 供应商（Provider）：连接级信息。
 * 一个供应商可有多个 API KEY，按 rotationPolicy 轮询；所有子节点共享 baseURL 与 KEY 池。
 */
export interface Provider {
  id: string
  name: string
  baseURL: string
  apiKeys: ProviderApiKey[]
  rotationPolicy: ProviderRotationPolicy
  createdAt: number
}

/**
 * 节点（ProviderNode）：模型级配置，挂靠在某个 providerId 下。
 * 运行时通过 providerResolver 与 Provider 合并为 ResolvedProviderNode。
 */
export interface ProviderNode {
  id: string
  /** 所属供应商 id */
  providerId: string
  /** 节点用途：文本(默认) / 图片 */
  nodeType: ProviderNodeType
  /** 图片节点的协议（仅 nodeType=image 时生效），默认 modelscope */
  protocol?: ImageProtocol
  model: string
  enabled: boolean
  lastTestResult?: 'ok' | 'fail' | null
  /** 该节点最大并发请求数（核心数），默认 2 */
  maxConcurrency: number
  /** 该节点每次请求的批次上限（文本=字数，图片=张数/次数），默认 4000 */
  batchChars: number
  /** 该节点两次请求之间最小间隔秒数，默认 0 */
  intervalSec: number
  /** 次数限制开关：开启后按每日额度限制该节点可用次数 */
  usageLimitEnabled?: boolean
  /** 每日可用额度（用户设置） */
  usageLimit?: number
  /** 当日剩余次数（每次调用后递减，跨日重置为 usageLimit） */
  usageLeft?: number
  /** 上次重置剩余次数的日期 YYYY-MM-DD（本地自然日） */
  usageResetDate?: string
  /** 是否支持视觉多模态理解（VLM），仅文本节点有效 */
  isMultimodal?: boolean
}

/**
 * 运行时解析后的完整节点视图：ProviderNode + 所属 Provider 的连接信息 + 当前选中的 API KEY。
 * 与旧 ProviderNode 字段对齐，供大部分消费方零感知使用。
 */
export interface ResolvedProviderNode extends ProviderNode {
  /** 供应商名称 */
  providerName: string
  /** 运行时显示名（供应商名 · 模型） */
  name: string
  baseURL: string
  apiKey: string
  /** 当前使用的 API KEY id */
  apiKeyId: string
  /** 是否支持图片编辑（Image2Image），由 protocol 派生 */
  supportsImageEdit: boolean
}

export type ModuleKey =
  | 'm0Arch'
  | 'm0Blueprint'
  | 'm1Clean'
  | 'm2Extract'
  | 'm2CardImage'
  | 'm3Simulate'
  | 'm4Generate'
  | 'm5Check'
  | 'm5Finalize'
  | 'batchGenerate'
  | 'roleChat'
  | 'embedding'

export interface ModuleModelMapping {
  nodeId: string | null
  /** 模型名不再独立维护——读取时一律从节点池 provider.model 取。保留字段仅为兼容旧 settings.json */
  model?: string
}

/**
 * 调度器消费的运行时节点视图——ResolvedProviderNode 的调度子集。
 *
 * 调度器只关心「怎么连 + 并发/间隔约束」，不关心 providerId/usageLimit/enabled/lastTestResult 等管理字段。
 * `batchChars` 可选：仅文本清理节点使用；批量生成/图片节点不感知该字段。
 */
export interface SchedulableNode {
  id: string
  name: string
  baseURL: string
  apiKey?: string
  model: string
  maxConcurrency: number
  intervalSec: number
  /** 批次字数上限（仅文本清理节点用；图片节点/批量生成无此字段） */
  batchChars?: number
}

/** 节点池运行时状态（供序列化 / store 独立化使用）。 */
export interface NodePoolStateCore {
  providers: Provider[]
  providerNodes: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
}
