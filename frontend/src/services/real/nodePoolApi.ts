/**
 * 节点池 CRUD API 客户端（5.5a 修复）。
 *
 * 对齐后端 per-item CRUD 端点（/api/providers、/api/nodes、/api/module-mapping），
 * 提供 list / save(upsert) / remove 三个粒度的方法。
 * persistence.ts 的 pushNodePoolNow / flushStoreWrites 通过本模块做 diff-based sync，
 * 不再将整数组 POST 到单项端点。
 */
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping } from '../../packages/node-pool/types'

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

// ===== Providers =====

export const providersApi = {
  async list(): Promise<Provider[]> {
    const res = await fetch('/api/providers')
    if (!res.ok) throw new Error(`GET /api/providers failed: ${res.status}`)
    return (await res.json()) as Provider[]
  },

  /** Upsert single provider (PUT /api/providers/:id)。 */
  async save(p: Provider, opts?: { keepalive?: boolean }): Promise<void> {
    const res = await fetch(`/api/providers/${encodeURIComponent(p.id)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(p),
      keepalive: opts?.keepalive,
    })
    if (!res.ok) throw new Error(`PUT /api/providers/${p.id} failed: ${res.status}`)
  },

  async remove(id: string, opts?: { keepalive?: boolean }): Promise<void> {
    const res = await fetch(`/api/providers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      keepalive: opts?.keepalive,
    })
    if (!res.ok) throw new Error(`DELETE /api/providers/${id} failed: ${res.status}`)
  },
}

// ===== Nodes =====

export const nodesApi = {
  async list(): Promise<ProviderNode[]> {
    const res = await fetch('/api/nodes')
    if (!res.ok) throw new Error(`GET /api/nodes failed: ${res.status}`)
    return (await res.json()) as ProviderNode[]
  },

  /** Upsert single node (PUT /api/nodes/:id)。 */
  async save(n: ProviderNode, opts?: { keepalive?: boolean }): Promise<void> {
    const res = await fetch(`/api/nodes/${encodeURIComponent(n.id)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(n),
      keepalive: opts?.keepalive,
    })
    if (!res.ok) throw new Error(`PUT /api/nodes/${n.id} failed: ${res.status}`)
  },

  async remove(id: string, opts?: { keepalive?: boolean }): Promise<void> {
    const res = await fetch(`/api/nodes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      keepalive: opts?.keepalive,
    })
    if (!res.ok) throw new Error(`DELETE /api/nodes/${id} failed: ${res.status}`)
  },
}

// ===== Module Mapping =====

export const moduleMappingApi = {
  async get(): Promise<Record<ModuleKey, ModuleModelMapping>> {
    const res = await fetch('/api/module-mapping')
    if (!res.ok) throw new Error(`GET /api/module-mapping failed: ${res.status}`)
    return (await res.json()) as Record<ModuleKey, ModuleModelMapping>
  },

  /** 整体替换 module-mapping（POST /api/module-mapping）。 */
  async save(m: Record<ModuleKey, ModuleModelMapping>, opts?: { keepalive?: boolean }): Promise<void> {
    const res = await fetch('/api/module-mapping', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(m),
      keepalive: opts?.keepalive,
    })
    if (!res.ok) throw new Error(`POST /api/module-mapping failed: ${res.status}`)
  },
}
