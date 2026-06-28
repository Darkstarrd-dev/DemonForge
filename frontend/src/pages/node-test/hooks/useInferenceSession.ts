// 节点测试 · 推理收发 hook（A-8 最高风险块，从 index.tsx 逐字搬入）。
//
// 消化全部推理逻辑，与 UI 视图态解耦：
//   - 单栏：经引擎 sendInSession 发起，运行态/消息派生自 sessionRuntimes + chatSessions（切走仍继续）。
//   - 对比：委托 useCompareSession（本地 state + 直调 streamChat，双侧并发、各自 AbortController、卸载清理）。
//   - 共享：编辑态（单栏 + 对比，editingCompareSide 注入对比 hook）、elapsed 计时、自动滚动两个 effect。
// store 订阅在 hook 内部完成；UI 视图态（testMode/mainView/sidebar/bottomMenu/节点类型拦截/paste）留在 index。
//
// 注：本 hook 行为与原 index 内联实现逐字一致——重构安全网为 index.test.tsx。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { App } from 'antd'
import { useAppStore } from '../../../store/appStore'
import { genId } from '../../../store/appStore'
import { sendInSession, cancelSession } from '../../../services/api'
import { imageHosts } from '../../../services/imageHost'
import type { ProviderNode, ImageInputMode, ChatSession } from '../../../services/types'
import type { NodeTestForm } from '../../../store/appStore'
import type { DebugInfoData } from '../DebugInfoPanel'
import type { ChatMessage, Phase } from '../types'
import { useCompareSession } from './useCompareSession'

export interface InferenceSessionArgs {
  testMode: 'text' | 'image'
  selectedNode: ProviderNode | undefined
  availableNodes: ProviderNode[]
  isImageMode: boolean
  isGpt: boolean
  isXai: boolean
  isMultimodal: boolean
  supportsEdit: boolean
  nodeProtocol: string
  nodeTestForm: NodeTestForm
  activeSystemPrompt: string
  compareMode: boolean
  selectedImages: File[]
  setSelectedImages: Dispatch<SetStateAction<File[]>>
  setForm: (patch: Partial<NodeTestForm>) => void
}

export function useInferenceSession(args: InferenceSessionArgs) {
  const {
    testMode, selectedNode, availableNodes, isImageMode, isGpt, isXai, isMultimodal,
    supportsEdit, nodeProtocol, nodeTestForm, activeSystemPrompt, compareMode,
    selectedImages, setSelectedImages, setForm,
  } = args

  const { message } = App.useApp()

  // ===== store 订阅（推理所需） =====
  const providers = useAppStore((s) => s.providers)
  const chatSessions = useAppStore((s) => s.chatSessions)
  const activeChatSessionId = useAppStore((s) => s.activeChatSessionId)
  const sessionRuntimes = useAppStore((s) => s.sessionRuntimes)
  const createChatSession = useAppStore((s) => s.createChatSession)
  const updateChatSession = useAppStore((s) => s.updateChatSession)
  const setActiveChatSessionId = useAppStore((s) => s.setActiveChatSessionId)

  // ===== 编辑态（单栏与对比共享） =====
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [editingCompareSide, setEditingCompareSide] = useState<'left' | 'right' | null>(null)

  // ===== 对比模式 session（委托 useCompareSession：本地 state + 直调 streamChat + 卸载清理） =====
  const compare = useCompareSession({
    availableNodes, activeSystemPrompt, nodeTestForm,
    editingMsgId, editingText, editingCompareSide,
    setEditingMsgId, setEditingText, setEditingCompareSide,
  })

  const chatEndRef = useRef<HTMLDivElement>(null)

  // ===== 多 session 运行态派生（单实例 phase/acRef/流式累积 已下沉到 sessionEngine + sessionRuntimes）=====
  const activeSession = useMemo(
    () => chatSessions.find((s: ChatSession) => s.id === activeChatSessionId) ?? null,
    [chatSessions, activeChatSessionId],
  )
  const activeRuntime = activeChatSessionId ? sessionRuntimes[activeChatSessionId] : undefined
  // 派生 phase（兼容旧渲染判断）：streaming/done/error/idle
  const phase: Phase = activeRuntime?.status === 'streaming' ? 'streaming'
    : activeRuntime?.status === 'done' ? 'done'
    : activeRuntime?.status === 'error' ? 'error'
    : 'idle'
  const busy = activeRuntime?.status === 'streaming'
  const statusText = activeRuntime?.statusText ?? ''
  const debugInfo: DebugInfoData = activeRuntime?.debug ?? { previewBody: null, actualBody: null, sseChunks: [] }
  // 当前会话展示消息 = 已落库 messages +（文本流式中）实时 assistant 气泡
  const chatMessages: ChatMessage[] = useMemo(() => {
    const base: ChatMessage[] = (activeSession?.messages ?? []).map((m) => ({ ...m }))
    if (activeRuntime?.status === 'streaming' && testMode === 'text') {
      base.push({
        id: activeRuntime.pendingAssistantMsgId ?? 'streaming',
        role: 'assistant',
        content: activeRuntime.streamingText,
        reasoning: activeRuntime.streamingReasoning || undefined,
        timestamp: activeRuntime?.startedAt ?? 0,
        nodeId: activeSession?.nodeId,
        modelName: activeSession?.modelName,
      })
    }
    return base
  }, [activeSession, activeRuntime, testMode])

  // 生成计时：busy 时按 startedAt 每秒派生 elapsed（替代每 session 独立计时器）
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busy 状态切换时一次性复位计时
    if (!busy || !activeRuntime?.startedAt) { setElapsed(0); return }
    const base = activeRuntime.startedAt
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - base) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [busy, activeRuntime?.startedAt])

  // 自动滚动到聊天底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // 最后一条 assistant 消息的元信息（节点名·模型名）
  const lastAssistantMeta = useMemo(() => {
    const lastAsst = [...chatMessages].reverse().find((m) => m.role === 'assistant')
    if (!lastAsst) return null
    const session = chatSessions.find((s: ChatSession) => s.id === activeChatSessionId)
    let nodeName = ''
    let modelName = ''
    if (session) {
      modelName = session.modelName || ''
      const node = providers.find((p) => p.id === session.nodeId)
      if (node) nodeName = node.name
    } else if (selectedNode) {
      nodeName = selectedNode.name
      modelName = selectedNode.model
    }
    const label = nodeName ? `${nodeName} · ${modelName}` : modelName
    return { msgId: lastAsst.id, label }
  }, [chatMessages, chatSessions, activeChatSessionId, providers, selectedNode])

  // 检测模型切换点：返回需要显示模型标记的消息ID及其标签
  const modelChanges = useMemo(() => {
    const changes: { msgId: string; label: string }[] = []
    for (let i = 0; i < chatMessages.length; i++) {
      const msg = chatMessages[i]
      if (msg.role !== 'assistant') continue

      // 检查下一条 assistant 消息是否有不同的模型
      const nextAssistant = chatMessages.slice(i + 1).find((m) => m.role === 'assistant')
      if (nextAssistant) {
        const currentModel = msg.modelName || msg.nodeId
        const nextModel = nextAssistant.modelName || nextAssistant.nodeId
        if (currentModel && nextModel && currentModel !== nextModel) {
          // 找到切换点：当前消息是切换前的最后一条
          const nodeName = msg.nodeId ? providers.find((p) => p.id === msg.nodeId)?.name || '' : ''
          const label = nodeName ? `${nodeName} · ${msg.modelName}` : msg.modelName || ''
          changes.push({ msgId: msg.id, label })
        }
      }
    }
    return changes
  }, [chatMessages, providers])

  // 同步 chatMessages 到 activeChatSession
  // 把一组消息写回当前激活 session（编辑/删除用；session 即唯一真相源）
  const syncSessionMessages = (nextMessages: ChatMessage[]) => {
    const sid = activeChatSessionId
    if (!sid) return
    updateChatSession(sid, {
      messages: nextMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        ...(m.images ? { images: m.images } : {}),
        ...(m.reasoning ? { reasoning: m.reasoning } : {}),
        ...(m.nodeId ? { nodeId: m.nodeId } : {}),
        ...(m.modelName ? { modelName: m.modelName } : {}),
        ...(m.revisedPrompt ? { revisedPrompt: m.revisedPrompt } : {}),
        ...(typeof m.genMs === 'number' ? { genMs: m.genMs } : {}),
      })),
      updatedAt: new Date().toISOString(),
    })
  }

  // 编辑消息
  const editMessage = (msgId: string) => {
    const msg = chatMessages.find((m) => m.id === msgId)
    if (!msg) return
    setEditingMsgId(msgId)
    setEditingText(msg.content)
  }

  // 提交编辑（写回当前 session 的 messages）
  const commitEdit = () => {
    if (!editingMsgId) return
    if (!editingText.trim()) {
      message.warning('内容不能为空')
      return
    }
    const nextMessages = (activeSession?.messages ?? []).map((m) =>
      m.id === editingMsgId ? { ...m, content: editingText } : m
    )
    syncSessionMessages(nextMessages as ChatMessage[])
    setEditingMsgId(null)
    setEditingText('')
  }

  // 取消编辑
  const cancelEdit = () => {
    setEditingMsgId(null)
    setEditingText('')
    setEditingCompareSide(null)
  }

  // 删除消息（从当前 session 的 messages 移除）
  const deleteMessage = (msgId: string) => {
    const nextMessages = (activeSession?.messages ?? []).filter((m) => m.id !== msgId)
    syncSessionMessages(nextMessages as ChatMessage[])
    if (editingMsgId === msgId) {
      setEditingMsgId(null)
      setEditingText('')
    }
  }

  // 重试消息（user 或 assistant）：截断当前 session 到触发 user 之前，再经引擎在该 session 重发
  const retryMessage = (msgId: string) => {
    if (!activeChatSessionId || !activeSession) return
    const msgs = activeSession.messages
    const index = msgs.findIndex((m) => m.id === msgId)
    if (index === -1) return
    const msg = msgs[index]

    let triggerUser: typeof msgs[number]
    if (msg.role === 'user') {
      triggerUser = msg
    } else {
      const lastUser = [...msgs.slice(0, index)].reverse().find((m) => m.role === 'user')
      if (!lastUser) {
        message.warning('无法找到触发该回复的用户消息')
        return
      }
      triggerUser = lastUser
    }

    if (!selectedNode) {
      message.warning('请先选择一个节点')
      return
    }

    // 截断到触发 user 之前（其后所有消息移除——引擎会重新追加该 user + 新回复）
    const triggerIndex = msgs.findIndex((m) => m.id === triggerUser.id)
    const truncated = msgs.slice(0, triggerIndex)
    updateChatSession(activeChatSessionId, { messages: truncated, updatedAt: new Date().toISOString() })

    sendInSession({
      sessionId: activeChatSessionId,
      node: selectedNode,
      testMode,
      protocol: nodeProtocol as 'modelscope' | 'gpt' | 'xai',
      isMultimodal,
      userText: triggerUser.content,
      imageInputs: triggerUser.images ?? [],
      systemPrompt: activeSystemPrompt,
      form: nodeTestForm,
      isFirstRound: truncated.length === 0,
    })
  }

  const handleGenerate = async () => {
    // 对比模式：并行调用左右生成（仅支持文本推理）
    if (compareMode) {
      if (isImageMode) {
        message.warning('对比模式下不支持图片生成，请切换到文本推理模式')
        return
      }
      if (!compare.selectedNodeIdLeft && !compare.selectedNodeIdRight) {
        message.warning('请先选择左右两侧的节点')
        return
      }
      if (!nodeTestForm.prompt.trim()) {
        message.warning('请输入提示词')
        return
      }

      // 并行调用左右生成
      const promises: Promise<void>[] = []
      if (compare.selectedNodeIdLeft) promises.push(compare.handleGenerateSide('left'))
      if (compare.selectedNodeIdRight) promises.push(compare.handleGenerateSide('right'))

      await Promise.all(promises)
      return
    }

    // 单栏模式：原有逻辑
    if (!selectedNode) {
      message.warning(`请先选择一个${isImageMode ? '图片生成' : '文本推理'}节点`)
      return
    }
    if (!nodeTestForm.prompt.trim()) {
      message.warning('请输入提示词')
      return
    }
    // 处理图片输入（图生图或多模态）：base64 直传 or 上传图床
    const imageInputs: string[] = []
    const usedImageMode: ImageInputMode = nodeTestForm.imageInputMode || 'base64'
    if ((supportsEdit || isMultimodal || isGpt || isXai) && selectedImages.length > 0) {
      if (usedImageMode === 'base64') {
        for (const file of selectedImages) {
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
            imageInputs.push(dataUrl)
          } catch (e) {
            message.error(`图片读取失败：${e instanceof Error ? e.message : String(e)}`)
            return
          }
        }
      } else {
        const host = imageHosts[usedImageMode]
        if (!host) {
          message.error('未知图床')
          return
        }
        message.loading({ content: `正在上传到 ${host.name}...`, key: 'upload' })
        try {
          for (const file of selectedImages) {
            const url = await host.upload(file)
            imageInputs.push(url)
          }
          message.success({ content: '图片上传成功', key: 'upload', duration: 2 })
        } catch (e) {
          message.error({ content: `上传失败：${e instanceof Error ? e.message : String(e)}`, key: 'upload', duration: 3 })
          return
        }
      }
    }

    const prompt = nodeTestForm.prompt.trim()

    // 确保有激活 session（无则按当前节点新建空 session 并激活）——保证每次发送都有 sessionId
    let sessionId = activeChatSessionId
    const isFirstRound = !sessionId || (activeSession?.messages.length ?? 0) === 0
    if (!sessionId) {
      const testType: ChatSession['testType'] = isImageMode
        ? (imageInputs.length > 0 ? 'multimodal' : 'image')
        : (isMultimodal && imageInputs.length > 0 ? 'multimodal' : 'text')
      sessionId = createChatSession({
        id: genId('cs'),
        title: prompt.slice(0, 20) || '新对话',
        testType,
        nodeId: selectedNode.id,
        modelName: selectedNode.model,
        messages: [],
        ...(activeSystemPrompt.trim() ? { systemPromptContent: activeSystemPrompt.trim() } : {}),
        ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
        ...(typeof nodeTestForm.topP === 'number' ? { topP: nodeTestForm.topP } : {}),
        ...(typeof nodeTestForm.maxTokens === 'number' ? { maxTokens: nodeTestForm.maxTokens } : {}),
        ...(isImageMode && nodeTestForm.resolution ? { size: nodeTestForm.resolution } : {}),
        ...(imageInputs.length > 0 ? { imageInputMode: usedImageMode } : {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setActiveChatSessionId(sessionId)
    }

    // 经引擎在该 session 发起一轮推理（写 sessionRuntimes[sessionId]，切走仍继续）
    sendInSession({
      sessionId,
      node: selectedNode,
      testMode,
      protocol: nodeProtocol as 'modelscope' | 'gpt' | 'xai',
      isMultimodal,
      userText: prompt,
      imageInputs,
      imageInputMode: usedImageMode,
      systemPrompt: activeSystemPrompt,
      form: nodeTestForm,
      isFirstRound,
    })

    // 清空输入区，便于继续操作其它 session
    setForm({ prompt: '' })
    setSelectedImages([])
  }

  const clearConversation = () => {
    // 新对话：取消激活 session（派生 chatMessages 随之清空）。运行中的其它 session 不受影响。
    setActiveChatSessionId(null)
    if (compareMode) compare.clearCompare()
  }

  const handleCancel = () => {
    if (activeChatSessionId) cancelSession(activeChatSessionId)
  }

  // 复制全部对话内容
  const copyAllMessages = () => {
    if (compareMode) {
      const parts: string[] = []
      if (compare.chatMessagesLeft.length > 0) {
        parts.push('=== 左侧对话 ===')
        compare.chatMessagesLeft.forEach((m) => {
          const role = m.role === 'user' ? '用户' : '助手'
          parts.push(`[${role}] ${new Date(m.timestamp).toLocaleTimeString()}`)
          if (m.reasoning) parts.push(`[思考过程]\n${m.reasoning}`)
          parts.push(m.content)
          parts.push('')
        })
      }
      if (compare.chatMessagesRight.length > 0) {
        parts.push('=== 右侧对话 ===')
        compare.chatMessagesRight.forEach((m) => {
          const role = m.role === 'user' ? '用户' : '助手'
          parts.push(`[${role}] ${new Date(m.timestamp).toLocaleTimeString()}`)
          if (m.reasoning) parts.push(`[思考过程]\n${m.reasoning}`)
          parts.push(m.content)
          parts.push('')
        })
      }
      const text = parts.join('\n')
      navigator.clipboard.writeText(text).then(() => message.success('已复制全部对话')).catch(() => message.error('复制失败'))
    } else {
      const parts = chatMessages.map((m) => {
        const role = m.role === 'user' ? '用户' : '助手'
        let block = `[${role}] ${new Date(m.timestamp).toLocaleTimeString()}`
        if (m.reasoning) block += `\n[思考过程]\n${m.reasoning}`
        block += `\n${m.content}`
        return block
      })
      const text = parts.join('\n\n')
      navigator.clipboard.writeText(text).then(() => message.success('已复制全部对话')).catch(() => message.error('复制失败'))
    }
  }

  // 复制文本到剪贴板
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制')
    }).catch(() => {
      message.error('复制失败')
    })
  }

  // 处理 Shift+Enter 发送
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey && !busy) {
      e.preventDefault()
      handleGenerate()
    }
  }

  return {
    // 派生展示态
    chatMessages, phase, busy, statusText, debugInfo, elapsed,
    activeSession, activeRuntime, activeChatSessionId,
    lastAssistantMeta, modelChanges,
    chatEndRef,
    // 编辑态
    editingMsgId, editingText, setEditingText, editingCompareSide,
    editMessage, commitEdit, cancelEdit, deleteMessage,
    // 对比态（委托 useCompareSession：chatMessagesLeft/Right、节点选择、phase、debug、对比编辑/重试等）
    ...compare,
    // 推理动作
    handleGenerate, handleCancel, clearConversation, retryMessage,
    copyAllMessages, copyText, handleKeyDown,
  }
}
