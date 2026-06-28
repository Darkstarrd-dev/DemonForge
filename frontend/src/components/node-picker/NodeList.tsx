/**
 * 节点选择归一化 · 两行版列表（P1 地基，需求 1 的模板）。
 *
 * 版式（相对旧版四行 → 两行）：
 *   分组行：[▶/▼] 供应商名(计数)  endpoint            ← 原「供应商名(计数)」+「endpoint」两行合并
 *   节点行：      模型名  [🖼️图生图][👁️多模态]       ← 原「供应商名·模型名」+「标识」两行合并
 *
 * 同时服务于：
 * - inline 菜单（ChatComposer 底部，带折叠）：传 expandedMap + onToggleExpand
 * - 浮动窗（NodePickerModal 内，全展开）：不传折叠 props
 */
import type { CSSProperties } from 'react'
import { Empty, Typography, theme } from 'antd'
import {
  groupProviders,
  isMultimodalNode,
  supportsImageEditNode,
} from '../../utils/nodePicker'
import type { ProviderNode } from '../../services/types'

export interface NodeListProps {
  nodes: ProviderNode[]
  selectedId?: string
  onSelect: (nodeId: string) => void
  /** 折叠态（key=分组键→是否展开）。不传=非受控全展开（浮动窗用法）。 */
  expandedMap?: Record<string, boolean>
  onToggleExpand?: (key: string) => void
  style?: CSSProperties
}

export function NodeList({
  nodes,
  selectedId,
  onSelect,
  expandedMap,
  onToggleExpand,
  style,
}: NodeListProps) {
  const { token } = theme.useToken()
  const groups = groupProviders(nodes)

  if (nodes.length === 0) {
    return <Empty description="无可用节点" style={{ padding: 24 }} />
  }

  return (
    <div style={style}>
      {groups.map((g) => {
        const expanded = expandedMap ? (expandedMap[g.key] ?? true) : true
        const collapsible = Boolean(onToggleExpand)
        return (
          <div key={g.key} style={{ marginBottom: 4 }}>
            {/* 分组行：供应商名(计数) endpoint —— 一行 */}
            <div
              style={{
                padding: '8px 16px',
                cursor: collapsible ? 'pointer' : 'default',
                background: expanded && collapsible ? token.colorFillQuaternary : 'transparent',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
              onClick={collapsible ? () => onToggleExpand!(g.key) : undefined}
            >
              {collapsible && (
                <Typography.Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
                  {expanded ? '▼' : '▶'}
                </Typography.Text>
              )}
              <Typography.Text strong style={{ fontSize: 13 }}>
                {g.groupName}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                ({g.nodes.length})
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                {g.baseURL}
              </Typography.Text>
            </div>

            {/* 节点行：模型名 + 能力标识 —— 一行 */}
            {expanded &&
              g.nodes.map((node) => {
                const isSelected = selectedId === node.id
                return (
                  <div
                    key={node.id}
                    style={{
                      padding: '8px 16px 8px 28px',
                      cursor: 'pointer',
                      background: isSelected ? token.colorPrimaryBg : 'transparent',
                      borderLeft: isSelected
                        ? `3px solid ${token.colorPrimary}`
                        : '3px solid transparent',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                    onClick={() => onSelect(node.id)}
                  >
                    <Typography.Text
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected ? 500 : 400,
                        color: isSelected ? token.colorPrimary : token.colorText,
                      }}
                    >
                      {node.model}
                    </Typography.Text>
                    {supportsImageEditNode(node) && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        🖼️ 图生图
                      </Typography.Text>
                    )}
                    {isMultimodalNode(node) && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        👁️ 多模态
                      </Typography.Text>
                    )}
                  </div>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}
