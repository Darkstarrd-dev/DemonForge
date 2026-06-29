// 节点测试 · 表单 hook（A-8 从 index.tsx 抽出）。
// 职责：从 store 订阅全局/ per-node 表单态，派生带默认值的完整 nodeTestForm，并提供 per-node setForm。
// 纯派生 + setState，无 effect/ref，与原 index 行为逐字一致。
import { useAppStore } from '../../../store/appStore'
import type { NodeTestForm } from '../../../store/appStore'

export function useNodeTestForm(): {
  effectiveNodeId: string | undefined
  nodeTestGlobalForm: { provider: string; nodeId?: string }
  nodeTestForm: NodeTestForm
  setForm: (patch: Partial<NodeTestForm>) => void
} {
  const nodeTestFormPerNode = useAppStore((s) => s.nodeTestFormPerNode)
  const nodeTestGlobalForm = useAppStore((s) => s.nodeTestGlobalForm)
  const setState = useAppStore((s) => s.setState)

  const effectiveNodeId = nodeTestGlobalForm.nodeId

  // 派生当前节点的表单参数（含默认值）
  const nodeParams = effectiveNodeId ? nodeTestFormPerNode[effectiveNodeId] : {}
  const nodeTestForm: NodeTestForm = {
    provider: nodeTestGlobalForm.provider,
    nodeId: effectiveNodeId,
    prompt: nodeParams?.prompt ?? '',
    resolution: nodeParams?.resolution ?? '1024x1024',
    negativePrompt: nodeParams?.negativePrompt ?? '',
    steps: nodeParams?.steps,
    guidance: nodeParams?.guidance,
    seed: nodeParams?.seed,
    imageInputMode: nodeParams?.imageInputMode,
    gptQuality: nodeParams?.gptQuality ?? '',
    gptBackground: nodeParams?.gptBackground ?? '',
    gptModeration: nodeParams?.gptModeration ?? '',
    xaiAspectRatio: nodeParams?.xaiAspectRatio ?? '1:1',
    xaiResolution: nodeParams?.xaiResolution ?? '2k',
    xaiN: nodeParams?.xaiN ?? 1,
    temperature: nodeParams?.temperature ?? 0.7,
    topP: nodeParams?.topP ?? 0.9,
    topK: nodeParams?.topK,
    maxTokens: nodeParams?.maxTokens ?? 2000,
    note: nodeParams?.note ?? '',
  }

  const setForm = (patch: Partial<NodeTestForm>) => {
    const nid = nodeTestGlobalForm.nodeId
    if (!nid) return
    setState({
      nodeTestFormPerNode: {
        ...nodeTestFormPerNode,
        [nid]: { ...nodeTestFormPerNode[nid], ...patch },
      },
    })
  }

  return { effectiveNodeId, nodeTestGlobalForm, nodeTestForm, setForm }
}
