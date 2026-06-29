/**
 * 节点选择归一化 · 浮动选择窗（P1 地基，需求 2 的复用体）。
 *
 * 各模块的节点选择按钮点击后弹出此窗。按调用方传入的 `kind` 自动只显示
 * 文本推理节点或图片生成节点（需求 2「自动选择显示文本推理节点还是图片生成节点」）。
 *
 * 选中后立即关闭并回调（单选语义）；内部用 NodeList 渲染两行版列表（无折叠）。
 */
import { Modal } from 'antd'
import { useAppStore } from '../../store/appStore'
import { NodeList } from './NodeList'
import { resolveProviderNodes } from '../../utils/providerResolver'

export interface NodePickerModalProps {
  open: boolean
  /** 节点类型筛选：仅显示该 kind 的 enabled 节点。 */
  kind: 'text' | 'image'
  selectedId?: string
  onSelect: (nodeId: string) => void
  onClose: () => void
  title?: string
}

export function NodePickerModal({
  open,
  kind,
  selectedId,
  onSelect,
  onClose,
  title,
}: NodePickerModalProps) {
  const providers = useAppStore((s) => s.providers)
  const providerNodes = useAppStore((s) => s.providerNodes)
  const nodes = resolveProviderNodes({ providers, providerNodes }).filter((n) => n.enabled && n.nodeType === kind)

  return (
    <Modal
      title={title ?? (kind === 'text' ? '选择文本节点' : '选择图片节点')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      styles={{ body: { maxHeight: '60vh', overflowY: 'auto', padding: 0 } }}
    >
      <NodeList
        nodes={nodes}
        selectedId={selectedId}
        onSelect={(id) => {
          onSelect(id)
          onClose()
        }}
      />
    </Modal>
  )
}
