// 节点测试页共享类型（A-8 从 index.tsx 抽出，供 index 与拆出的子组件共用）。
// ChatMessage 字段与 services 的 ChatSessionMessage 一致，但页面内用本地名承载渲染态。

export type Phase = 'idle' | 'submitted' | 'polling' | 'done' | 'error' | 'streaming'

export type TestMode = 'text' | 'image'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  images?: string[]
  reasoning?: string
  nodeId?: string
  modelName?: string
  revisedPrompt?: string
  /** 图片生成耗时（毫秒，仅图片模式 assistant 消息） */
  genMs?: number
}
