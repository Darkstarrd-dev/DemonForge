/**
 * 节点选择归一化 · 触发按钮（P1 地基，需求 3/5/6/7/8 的统一替换件）。
 *
 * 替代各处 `<Select>` 下拉。默认显示（两行）：
 *   行1：供应商名
 *   行2：模型名（默认）        ← 未选时加「（默认）」后缀
 *
 * 点击打开 NodePickerModal；选中后 onChange 回传 nodeId（调用方写本地 state，
 * 不写回 moduleMapping —— 临时本次生效语义）。
 *
 * `stretch` 模式：按钮高度填满父容器，用于需求 3「上下端对齐左侧人物名称」
 * （父容器 flex 布局，按钮 align-self:stretch）。
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button, Typography } from 'antd'
import { NodePickerModal } from './NodePickerModal'
import { useModuleNode } from '../../hooks/useModuleNode'
import { nodeVendorName } from '../../utils/nodePicker'
import type { ModuleKey } from '../../services/types'

export interface NodePickerButtonProps {
  moduleKey: ModuleKey
  kind: 'text' | 'image'
  /** 本地临时选中 id（undefined=未选，走默认）。调用方用 state 维护。 */
  value?: string
  onChange: (nodeId: string) => void
  style?: CSSProperties
  /** true=按钮高度填满父容器（与左侧人物名上下端对齐）。 */
  stretch?: boolean
  /** 按钮内额外节点（如右侧图标），不传则默认右箭头。 */
  suffix?: ReactNode
  /** Modal 标题自定义。 */
  modalTitle?: string
}

export function NodePickerButton({
  moduleKey,
  kind,
  value,
  onChange,
  style,
  stretch,
  suffix,
  modalTitle,
}: NodePickerButtonProps) {
  const [open, setOpen] = useState(false)
  const { node } = useModuleNode(moduleKey, kind, value)

  const vendor = node ? nodeVendorName(node) : '未配置'
  const model = node?.model ?? '未配置'
  // 未手动选择时显示「（默认）」后缀（需求确认：未选则加后缀）
  const showDefaultBadge = !value

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          height: stretch ? '100%' : 'auto',
          minHeight: 48,
          padding: '6px 10px',
          lineHeight: 1.25,
          textAlign: 'left',
          ...style,
        }}
      >
        <Typography.Text style={{ fontSize: 12 }} ellipsis>
          {vendor}
        </Typography.Text>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis>
            {model}
          </Typography.Text>
          {showDefaultBadge && (
            <Typography.Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
              （默认）
            </Typography.Text>
          )}
          {suffix}
        </span>
      </Button>
      <NodePickerModal
        open={open}
        kind={kind}
        selectedId={node?.id}
        onSelect={onChange}
        onClose={() => setOpen(false)}
        title={modalTitle}
      />
    </>
  )
}
