/**
 * 节点选择归一化 · 纯函数层（P1 地基）。
 *
 * 消除项目里 3+ 处重复的「分组 / 标签 / 能力判定」逻辑：
 * - 分组：`name.replace(/\s*\([^)]*\)\s*$/,'') + (baseURL|||groupName)` 曾散布于
 *   `pages/node-test/index.tsx`、`pages/library/Step3Clean*`、设置页。
 * - 标签：`${name}·${model}` 曾 7+ 处硬编码。
 * - 能力：👁️多模态 / 🖼️图生图 仅 `ChatComposer` 渲染，其它下拉丢失该信息。
 *
 * 本模块作为节点选择 UI（NodeList / NodePickerModal / NodePickerButton）的唯一数据源。
 * 无副作用、无框架依赖，可被纯 node 单测引用（仿 provider.ts）。
 */
import type { ProviderNode } from '../services/types'

/**
 * 节点对应的「供应商名」＝ 去掉 `name` 末尾括号后缀（与节点池分组规则一致），
 * 空则回退 `baseURL`。例：「通义千问 (华东)」→「通义千问」。
 */
export function nodeVendorName(node: ProviderNode): string {
  return node.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || node.baseURL
}

/** 节点完整标签（兼容旧 `${name}·${model}` 显示形态）。 */
export function nodeLabel(node: ProviderNode): string {
  return `${node.name} · ${node.model}`
}

/** 仅模型名（两行版式下行用）。 */
export function nodeModelName(node: ProviderNode): string {
  return node.model
}

/** 是否支持视觉多模态（VLM）。仅文本节点有效；图片节点恒 false。 */
export function isMultimodalNode(node: ProviderNode): boolean {
  return node.nodeType === 'text' && node.isMultimodal === true
}

/** 是否支持图生图（Image2Image / 图片编辑）。仅图片节点有效；文本节点恒 false。 */
export function supportsImageEditNode(node: ProviderNode): boolean {
  return node.nodeType === 'image' && node.supportsImageEdit === true
}

export interface ProviderGroup {
  /** 分组键：`baseURL|||groupName`，用于折叠态持久化。 */
  key: string
  /** 供应商名（去括号后缀）。 */
  groupName: string
  /** 服务端点。 */
  baseURL: string
  /** 组内节点列表。 */
  nodes: ProviderNode[]
}

/**
 * 按 baseURL + 供应商名 分组（消除 3 处重复逻辑）。
 * 与 `pages/node-test/index.tsx` 旧版 inline 分组规则等价。
 */
export function groupProviders(nodes: ProviderNode[]): ProviderGroup[] {
  const acc: Record<string, ProviderGroup> = {}
  for (const node of nodes) {
    const groupName = nodeVendorName(node)
    const key = `${node.baseURL}|||${groupName}`
    if (!acc[key]) acc[key] = { key, groupName, baseURL: node.baseURL, nodes: [] }
    acc[key].nodes.push(node)
  }
  return Object.values(acc)
}
