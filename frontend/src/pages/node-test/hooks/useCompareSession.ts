// 节点测试 · 对比模式 session（B-5：从 useInferenceSession 抽出）。
//
// 对比模式独立于单栏引擎：本地 state（chatMessagesLeft/Right）+ 直调 streamChat，双侧并发、各自 AbortController。
// 设计要点：
//   - slot 字典：把左右两侧按 side 分叉的 setMessages/setPhase/setDebugInfo/acRef/messages/selectedNodeId
//     收进 CompareSlot，动作开头 `slotOf(side)` 一次，消除满屏 `side === 'left' ? A : B` 三元。
//   - runStream：handleGenerateSide 与 retryCompareMessage 的 streamChat 回调逐字相同，合并为一份。
//   - 卸载清理：useEffect 卸载时 abort 左右 acRef（修 audit-02 B-5 ③，切走页面不再后台续跑）。
//   - 编辑态（editingMsgId/editingText/editingCompareSide）由父 hook 持有、经入参注入（单栏与对比共享）。
//
// 注：行为与原 useInferenceSession 内联实现逐字一致——重构安全网为 node-test/index.test.tsx。
import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { App } from 'antd'
import { genId } from '../../../store/appStore'
import { streamChat } from '../../../services/api'
import type { ResolvedProviderNode } from '../../../services/types'
import type { NodeTestForm } from '../../../store/appStore'
import type { DebugInfoData } from '../DebugInfoPanel'
import type { ChatMessage, Phase } from '../types'

type ApiMsg = { role: 'system' | 'user' | 'assistant'; content: string }

/** 左右两侧的 side 化句柄：消除 `side === 'left' ? A : B` 三元的核心。 */
interface CompareSlot {
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  selectedNodeId: string | undefined
  setPhase: Dispatch<SetStateAction<Phase>>
  acRef: { current: AbortController | null }
  setDebugInfo: Dispatch<SetStateAction<DebugInfoData>>
}

export interface CompareSessionArgs {
  availableNodes: ResolvedProviderNode[]
  activeSystemPrompt: string
  nodeTestForm: NodeTestForm
  // 共享编辑态（父 useInferenceSession 持有，对比编辑函数复用）
  editingMsgId: string | null
  editingText: string
  editingCompareSide: 'left' | 'right' | null
  setEditingMsgId: Dispatch<SetStateAction<string | null>>
  setEditingText: Dispatch<SetStateAction<string>>
  setEditingCompareSide: Dispatch<SetStateAction<'left' | 'right' | null>>
}

export function useCompareSession(args: CompareSessionArgs) {
  const {
    availableNodes, activeSystemPrompt, nodeTestForm,
    editingMsgId, editingText, editingCompareSide,
    setEditingMsgId, setEditingText, setEditingCompareSide,
  } = args

  const { message } = App.useApp()

  // ===== 对比模式状态 =====
  const [chatMessagesLeft, setChatMessagesLeft] = useState<ChatMessage[]>([])
  const [chatMessagesRight, setChatMessagesRight] = useState<ChatMessage[]>([])
  const [selectedNodeIdLeft, setSelectedNodeIdLeft] = useState<string | undefined>(undefined)
  const [selectedNodeIdRight, setSelectedNodeIdRight] = useState<string | undefined>(undefined)
  const selectedNodeIdLeftRef = useRef<string | undefined>(undefined)
  const selectedNodeIdRightRef = useRef<string | undefined>(undefined)
  const setSelectedNodeIdLeftWrapped = (v: string | undefined) => { selectedNodeIdLeftRef.current = v; setSelectedNodeIdLeft(v) }
  const setSelectedNodeIdRightWrapped = (v: string | undefined) => { selectedNodeIdRightRef.current = v; setSelectedNodeIdRight(v) }
  const [phaseLeft, setPhaseLeft] = useState<Phase>('idle')
  const [phaseRight, setPhaseRight] = useState<Phase>('idle')
  const acRefLeft = useRef<AbortController | null>(null)
  const acRefRight = useRef<AbortController | null>(null)
  const [debugInfoLeft, setDebugInfoLeft] = useState<DebugInfoData>({ previewBody: null, actualBody: null, sseChunks: [] })
  const [debugInfoRight, setDebugInfoRight] = useState<DebugInfoData>({ previewBody: null, actualBody: null, sseChunks: [] })
  const [debugSide, setDebugSide] = useState<'left' | 'right'>('left')

  // 卸载清理：abort 左右在途流（切走 /node-test 路由不再后台续跑）
  useEffect(() => () => { acRefLeft.current?.abort(); acRefRight.current?.abort() }, [])

  // side 句柄（每次渲染重建，捕获当前 state 快照）
  const left: CompareSlot = {
    messages: chatMessagesLeft, setMessages: setChatMessagesLeft, selectedNodeId: selectedNodeIdLeft,
    setPhase: setPhaseLeft, acRef: acRefLeft, setDebugInfo: setDebugInfoLeft,
  }
  const right: CompareSlot = {
    messages: chatMessagesRight, setMessages: setChatMessagesRight, selectedNodeId: selectedNodeIdRight,
    setPhase: setPhaseRight, acRef: acRefRight, setDebugInfo: setDebugInfoRight,
  }
  const slotOf = (side: 'left' | 'right') => (side === 'left' ? left : right)

  // ===== 对比模式消息编辑（复用父 hook 的共享编辑态） =====

  const deleteCompareMessage = (side: 'left' | 'right', msgId: string) => {
    slotOf(side).setMessages((prev) => prev.filter((m) => m.id !== msgId))
    if (editingMsgId === msgId) {
      setEditingMsgId(null)
      setEditingText('')
      setEditingCompareSide(null)
    }
  }

  const editCompareMessage = (side: 'left' | 'right', msgId: string) => {
    const msg = slotOf(side).messages.find((m) => m.id === msgId)
    if (!msg) return
    setEditingMsgId(msgId)
    setEditingCompareSide(side)
    setEditingText(msg.content)
  }

  const commitCompareEdit = () => {
    if (!editingMsgId || !editingCompareSide) return
    if (!editingText.trim()) {
      message.warning('内容不能为空')
      return
    }
    slotOf(editingCompareSide).setMessages((prev) => prev.map((m) => m.id === editingMsgId ? { ...m, content: editingText } : m))
    setEditingMsgId(null)
    setEditingText('')
    setEditingCompareSide(null)
  }

  const cancelCompareEdit = () => {
    setEditingMsgId(null)
    setEditingText('')
    setEditingCompareSide(null)
  }

  // 共享流式段：handleGenerateSide 与 retryCompareMessage 的 streamChat 回调逐字相同，合并一处。
  const runStream = async (slot: CompareSlot, node: ResolvedProviderNode, apiMessages: ApiMsg[], assistantMsgId: string, ac: AbortController) => {
    let fullText = ''
    let fullReasoning = ''
    try {
      await streamChat(
        {
          baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, messages: apiMessages, includeRaw: true,
          ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
          ...(typeof nodeTestForm.topP === 'number' ? { topP: nodeTestForm.topP } : {}),
          ...(typeof nodeTestForm.maxTokens === 'number' ? { maxTokens: nodeTestForm.maxTokens } : {}),
        },
        {
          reasoningDelta: (delta) => {
            fullReasoning += delta
            slot.setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, reasoning: fullReasoning } : m))
          },
          delta: (delta) => {
            fullText += delta
            slot.setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: fullText } : m))
          },
          requestBody: (body) => slot.setDebugInfo((prev) => ({ ...prev, actualBody: body as object })),
          rawChunk: (raw) => slot.setDebugInfo((prev) => ({ ...prev, sseChunks: [...prev.sseChunks, raw] })),
          done: (finalText) => {
            slot.setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: finalText, reasoning: fullReasoning || undefined } : m))
            slot.setPhase('done')
          },
          error: (err) => {
            const errorMsg: ChatMessage = { id: genId('msg'), role: 'assistant', content: `失败：${err}`, timestamp: Date.now() }
            slot.setMessages((prev) => [...prev.filter((m) => m.id !== assistantMsgId), errorMsg])
            slot.setPhase('error')
          },
        },
        ac.signal,
      )
    } catch (e) {
      if (!ac.signal.aborted) {
        const errMsg = e instanceof Error ? e.message : String(e)
        const errorMsg: ChatMessage = { id: genId('msg'), role: 'assistant', content: `失败：${errMsg}`, timestamp: Date.now() }
        slot.setMessages((prev) => [...prev.filter((m) => m.id !== assistantMsgId), errorMsg])
        slot.setPhase('error')
      }
    }
  }

  const retryCompareMessage = async (side: 'left' | 'right', msgId: string) => {
    const slot = slotOf(side)
    const messages = slot.messages
    const index = messages.findIndex((m) => m.id === msgId)
    if (index === -1) return
    const msg = messages[index]
    const nodeId = slot.selectedNodeId
    if (!nodeId) return
    const node = availableNodes.find((n) => n.id === nodeId)
    if (!node) return

    let newMessages: ChatMessage[]
    let triggerUser: ChatMessage
    if (msg.role === 'user') {
      newMessages = messages.slice(0, index)
      triggerUser = msg
    } else {
      newMessages = messages.slice(0, index)
      const lastUser = [...newMessages].reverse().find((m) => m.role === 'user')
      if (!lastUser) { message.warning('无法找到触发该回复的用户消息'); return }
      triggerUser = lastUser
    }

    slot.setMessages(newMessages)

    const ac = new AbortController()
    slot.acRef.current = ac
    slot.setPhase('streaming')
    slot.setDebugInfo({ previewBody: null, actualBody: null, sseChunks: [] })

    const assistantMsgId = genId('msg')
    const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', reasoning: '', timestamp: Date.now(), nodeId: node.id, modelName: node.model }
    const allMessages = [...newMessages, triggerUser, assistantMsg]
    slot.setMessages(allMessages)

    const apiMessages: ApiMsg[] = []
    if (activeSystemPrompt.trim()) apiMessages.push({ role: 'system', content: activeSystemPrompt.trim() })
    newMessages.forEach((m) => { apiMessages.push({ role: m.role, content: m.content }) })
    apiMessages.push({ role: 'user', content: triggerUser.content })

    slot.setMessages((prev) => {
      slot.setDebugInfo({ previewBody: { model: node.model, messages: apiMessages, stream: true, ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}), ...(typeof nodeTestForm.topP === 'number' ? { top_p: nodeTestForm.topP } : {}), ...(typeof nodeTestForm.maxTokens === 'number' ? { max_tokens: nodeTestForm.maxTokens } : {}) }, actualBody: null, sseChunks: [] })
      return prev
    })

    await runStream(slot, node, apiMessages, assistantMsgId, ac)
  }

  // 对比模式：单侧生成（支持 reasoning + debug info）
  const handleGenerateSide = async (side: 'left' | 'right') => {
    const slot = slotOf(side)
    const nodeId = slot.selectedNodeId
    if (!nodeId) return

    const node = availableNodes.find(n => n.id === nodeId)
    if (!node) return

    const ac = new AbortController()
    slot.acRef.current?.abort()
    slot.acRef.current = ac
    slot.setPhase('streaming')
    slot.setDebugInfo({ previewBody: null, actualBody: null, sseChunks: [] })

    const userMsg: ChatMessage = {
      id: genId('msg'),
      role: 'user',
      content: nodeTestForm.prompt.trim(),
      timestamp: Date.now(),
      nodeId: node.id,
      modelName: node.model,
    }

    const assistantMsgId = genId('msg')
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
      nodeId: node.id,
      modelName: node.model,
    }

    slot.setMessages(prev => [...prev, userMsg, assistantMsg])

    const apiMessages: ApiMsg[] = []
    if (activeSystemPrompt.trim()) {
      apiMessages.push({ role: 'system', content: activeSystemPrompt.trim() })
    }

    const currentMessages = slot.messages
    currentMessages.forEach(m => {
      apiMessages.push({ role: m.role, content: m.content })
    })
    apiMessages.push({ role: 'user', content: nodeTestForm.prompt.trim() })

    // preview body
    const previewBody = {
      model: node.model,
      messages: apiMessages,
      stream: true,
      ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
      ...(typeof nodeTestForm.topP === 'number' ? { top_p: nodeTestForm.topP } : {}),
      ...(typeof nodeTestForm.maxTokens === 'number' ? { max_tokens: nodeTestForm.maxTokens } : {}),
    }
    slot.setDebugInfo((prev) => ({ ...prev, previewBody }))

    await runStream(slot, node, apiMessages, assistantMsgId, ac)
  }

  // 清空左右对话（父 clearConversation 在对比模式下调用）
  const clearCompare = () => {
    setChatMessagesLeft([])
    setChatMessagesRight([])
  }

  return {
    chatMessagesLeft, chatMessagesRight,
    selectedNodeIdLeft, selectedNodeIdRight,
    setSelectedNodeIdLeftWrapped, setSelectedNodeIdRightWrapped,
    selectedNodeIdLeftRef, selectedNodeIdRightRef,
    phaseLeft, phaseRight,
    debugInfoLeft, debugInfoRight, debugSide, setDebugSide,
    handleGenerateSide, retryCompareMessage,
    editCompareMessage, commitCompareEdit, cancelCompareEdit, deleteCompareMessage,
    clearCompare,
  }
}
