/**
 * 节点池仓储层——接口 + SettingsJsonRepo 过渡实现。
 *
 * 路由层只依赖 NodePoolRepository 接口，禁止 import 具体 Repo 类。
 * 5.5a 实施时注入 SettingsJsonRepo（读写 settings.json 两键，零迁移风险）；
 * 5.5b 时新增 SqliteRepo 实现类，路由层零改动、只换注入实例。
 *
 * 前瞻约束：接口方法签名一旦定下，5.5b 不得修改（只新增实现类）。
 */

import { readSettings, updateSettings } from '../routes/settings'

// ===== 类型定义（后端侧，与前端 packages/node-pool/types.ts 对齐）=====

export interface ProviderApiKey {
  id: string
  key: string
  label?: string
  enabled: boolean
  state: 'ok' | 'exhausted' | 'disabled'
  lastUsedAt?: number
  consecFailures?: number
}

export interface Provider {
  id: string
  name: string
  baseURL: string
  apiKeys: ProviderApiKey[]
  rotationPolicy: 'round-robin' | 'failover'
  createdAt: number
}

export interface ProviderNode {
  id: string
  providerId: string
  nodeType: 'text' | 'image'
  protocol?: 'modelscope' | 'gpt' | 'xai'
  model: string
  enabled: boolean
  lastTestResult?: 'ok' | 'fail' | null
  maxConcurrency: number
  batchChars: number
  intervalSec: number
  usageLimitEnabled?: boolean
  usageLimit?: number
  usageLeft?: number
  usageResetDate?: string
  isMultimodal?: boolean
}

export interface ModuleModelMapping {
  nodeId: string | null
  model?: string
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

// ===== 仓储接口 =====

/** 节点池仓储接口——5.5a/5.5b 共用，路由层只依赖此接口。 */
export interface NodePoolRepository {
  listProviders(): Provider[]
  getProvider(id: string): Provider | null
  saveProvider(p: Provider): void
  deleteProvider(id: string): void

  listNodes(): ProviderNode[]
  getNode(id: string): ProviderNode | null
  saveNode(n: ProviderNode): void
  deleteNode(id: string): void

  getModuleMapping(): Record<ModuleKey, ModuleModelMapping>
  saveModuleMapping(mapping: Record<ModuleKey, ModuleModelMapping>): void
}

// ===== SettingsJsonRepo 实现（5.5a 过渡）=====

/** 5.5a 实现：读写 settings.json 的 providers/providerNodes/moduleMapping 三键。 */
export class SettingsJsonRepo implements NodePoolRepository {
  listProviders(): Provider[] {
    const s = readSettings()
    const providers = s.providers
    if (!Array.isArray(providers)) return []
    return providers as Provider[]
  }

  getProvider(id: string): Provider | null {
    return this.listProviders().find((p) => p.id === id) ?? null
  }

  saveProvider(p: Provider): void {
    const s = readSettings()
    const existing = (s.providers as Provider[] | undefined) ?? []
    const idx = existing.findIndex((x) => x.id === p.id)
    const updated = [...existing]
    if (idx >= 0) {
      updated[idx] = p
    } else {
      updated.push(p)
    }
    updateSettings({ providers: updated })
  }

  deleteProvider(id: string): void {
    const s = readSettings()
    const providers = ((s.providers as Provider[] | undefined) ?? []).filter((p) => p.id !== id)
    // 级联删除：同时过滤掉 providerId 匹配的节点
    const nodes = ((s.providerNodes as ProviderNode[] | undefined) ?? []).filter((n) => n.providerId !== id)
    updateSettings({ providers, providerNodes: nodes })
  }

  listNodes(): ProviderNode[] {
    const s = readSettings()
    const nodes = s.providerNodes
    if (!Array.isArray(nodes)) return []
    return nodes as ProviderNode[]
  }

  getNode(id: string): ProviderNode | null {
    return this.listNodes().find((n) => n.id === id) ?? null
  }

  saveNode(n: ProviderNode): void {
    const s = readSettings()
    const existing = (s.providerNodes as ProviderNode[] | undefined) ?? []
    const idx = existing.findIndex((x) => x.id === n.id)
    const updated = [...existing]
    if (idx >= 0) {
      updated[idx] = n
    } else {
      updated.push(n)
    }
    updateSettings({ providerNodes: updated })
  }

  deleteNode(id: string): void {
    const s = readSettings()
    const nodes = ((s.providerNodes as ProviderNode[] | undefined) ?? []).filter((n) => n.id !== id)
    updateSettings({ providerNodes: nodes })
  }

  getModuleMapping(): Record<ModuleKey, ModuleModelMapping> {
    const s = readSettings()
    return (s.moduleMapping as Record<ModuleKey, ModuleModelMapping> | undefined) ?? {} as Record<ModuleKey, ModuleModelMapping>
  }

  saveModuleMapping(mapping: Record<ModuleKey, ModuleModelMapping>): void {
    updateSettings({ moduleMapping: mapping })
  }
}
