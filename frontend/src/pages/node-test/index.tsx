import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Space, Typography, Upload, Select, Segmented, theme, Tooltip, Image, Collapse, Popconfirm } from 'antd'
import { PictureOutlined, CloseOutlined, MessageOutlined, CopyOutlined, SendOutlined, FileImageOutlined, HistoryOutlined, BulbOutlined, RedoOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { generateImage, streamChat, generateTitle } from '../../services/api'
import { genId, pushSettingsNow } from '../../store/appStore'
import { imageHosts } from '../../services/imageHost'
import type { ProviderNode, ImageInputMode, ChatSession, ChatSessionMessage } from '../../services/types'
import type { NodeTestForm } from '../../store/appStore'
import SystemPromptEditor from './SystemPromptEditor'
import HistoryList from './HistoryList'
import DebugInfoPanel from './DebugInfoPanel'
import type { DebugInfoData } from './DebugInfoPanel'

const RESOLUTIONS = [
  { value: '1024x1024', label: '1024×1024（1:1）' },
  { value: '1280x720', label: '1280×720（16:9）' },
  { value: '720x1280', label: '720×1280（9:16）' },
  { value: '1024x768', label: '1024×768（4:3）' },
  { value: '768x1024', label: '768×1024（3:4）' },
]

type Phase = 'idle' | 'submitted' | 'polling' | 'done' | 'error' | 'streaming'

type TestMode = 'text' | 'image'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  images?: string[]
  reasoning?: string
}

export default function NodeTestPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const providers = useAppStore((s) => s.providers)
  const nodeTestFormPerNode = useAppStore((s) => s.nodeTestFormPerNode)
  const nodeTestGlobalForm = useAppStore((s) => s.nodeTestGlobalForm)
  const nodeGroupExpanded = useAppStore((s) => s.nodeGroupExpanded)
  const setState = useAppStore((s) => s.setState)
  const chatSessions = useAppStore((s) => s.chatSessions)
  const activeChatSessionId = useAppStore((s) => s.activeChatSessionId)
  const createChatSession = useAppStore((s) => s.createChatSession)
  const updateChatSession = useAppStore((s) => s.updateChatSession)
  const renameChatSession = useAppStore((s) => s.renameChatSession)
  const deleteChatSession = useAppStore((s) => s.deleteChatSession)
  const setActiveChatSessionId = useAppStore((s) => s.setActiveChatSessionId)
  const systemPromptPresets = useAppStore((s) => s.systemPromptPresets)
  const systemPromptActiveId = useAppStore((s) => s.systemPromptActiveId)
  const saveSystemPromptPreset = useAppStore((s) => s.saveSystemPromptPreset)
  const deleteSystemPromptPreset = useAppStore((s) => s.deleteSystemPromptPreset)
  const setSystemPromptActiveId = useAppStore((s) => s.setSystemPromptActiveId)

  // 测试模式：根据节点类型自动切换
  const [testMode, setTestMode] = useState<TestMode>('text')

  // 聊天消息列表
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  // 主区域视图：对话 / 历史记录列表
  const [mainView, setMainView] = useState<'chat' | 'history'>('chat')
  // 右侧侧边栏视图：参数设置 / System Instructions / Debug Info
  const [sidebarView, setSidebarView] = useState<'params' | 'sysPrompt' | 'debug'>('params')
  // 底部菜单展开状态
  const [bottomMenuOpen, setBottomMenuOpen] = useState(false)
  // Debug Info（内存态，不持久化；每次发送重置）
  const [debugInfo, setDebugInfo] = useState<DebugInfoData>({ previewBody: null, actualBody: null, sseChunks: [] })
  // 编辑态
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

  // 根据测试模式过滤可用节点
  const availableNodes = useMemo(() => {
    if (testMode === 'image') {
      return providers.filter((p) => p.nodeType === 'image' && p.enabled)
    } else {
      return providers.filter((p) => p.nodeType === 'text' && p.enabled)
    }
  }, [providers, testMode])

  const [phase, setPhase] = useState<Phase>('idle')
  const statusTextRef = useRef('')
  const setStatusText = (v: string) => { statusTextRef.current = v }
  const [currentResult, setCurrentResult] = useState<string | null>(null)
  const currentTextResponseRef = useRef('')
  const setCurrentTextResponse = (v: string) => { currentTextResponseRef.current = v } // 文本或图片 data URL
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const acRef = useRef<AbortController | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => acRef.current?.abort(), [])

  // 自动滚动到聊天底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const effectiveNodeId = nodeTestGlobalForm.nodeId
  const selectedNode: ProviderNode | undefined = effectiveNodeId
    ? availableNodes.find((n) => n.id === effectiveNodeId)
    : undefined

  // 当切换节点时，自动切换测试模式
  useEffect(() => {
    if (selectedNode) {
      setTestMode(selectedNode.nodeType === 'image' ? 'image' : 'text')
      setChatMessages([])
      setCurrentResult(null)
      setActiveChatSessionId(null)
    }
  }, [selectedNode])

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
    temperature: nodeParams?.temperature ?? 0.7,
    topP: nodeParams?.topP ?? 0.9,
    topK: nodeParams?.topK,
    maxTokens: nodeParams?.maxTokens ?? 2000,
  }

  const isModelScope = nodeTestForm.provider === 'modelscope'
  const isImageMode = testMode === 'image'
  const supportsEdit = selectedNode?.supportsImageEdit ?? false
  const isMultimodal = selectedNode?.isMultimodal ?? false

  // 当前激活的 System Prompt 预设（全局共享，发送时取其 content）
  const activeSystemPromptPreset = useMemo(
    () => systemPromptPresets.find((p) => p.id === systemPromptActiveId) ?? null,
    [systemPromptPresets, systemPromptActiveId],
  )
  const activeSystemPrompt = activeSystemPromptPreset?.content ?? ''

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

  // 同步 chatMessages 到 activeChatSession
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

  // 提交编辑
  const commitEdit = () => {
    if (!editingMsgId) return
    if (!editingText.trim()) {
      message.warning('内容不能为空')
      return
    }
    const nextMessages = chatMessages.map((m) =>
      m.id === editingMsgId ? { ...m, content: editingText } : m
    )
    setChatMessages(nextMessages)
    syncSessionMessages(nextMessages)
    setEditingMsgId(null)
    setEditingText('')
  }

  // 取消编辑
  const cancelEdit = () => {
    setEditingMsgId(null)
    setEditingText('')
  }

  // 删除消息
  const deleteMessage = (msgId: string) => {
    const nextMessages = chatMessages.filter((m) => m.id !== msgId)
    setChatMessages(nextMessages)
    syncSessionMessages(nextMessages)
    if (editingMsgId === msgId) {
      setEditingMsgId(null)
      setEditingText('')
    }
  }

  // 重试消息（user 或 assistant）
  const retryMessage = async (msgId: string) => {
    const index = chatMessages.findIndex((m) => m.id === msgId)
    if (index === -1) return
    const msg = chatMessages[index]

    let newMessages: ChatMessage[]
    let triggerUser: ChatMessage

    if (msg.role === 'user') {
      // user 重试：截断到该 user 之前，以该 user 作为触发
      newMessages = chatMessages.slice(0, index)
      triggerUser = msg
    } else {
      // assistant 重试：截断到该 assistant 之前，找触发它的 user
      newMessages = chatMessages.slice(0, index)
      const lastUser = [...newMessages].reverse().find((m) => m.role === 'user')
      if (!lastUser) {
        message.warning('无法找到触发该回复的用户消息')
        return
      }
      triggerUser = lastUser
    }

    if (!selectedNode) {
      message.warning('请先选择一个文本推理节点')
      return
    }

    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac

    setChatMessages(newMessages)
    setPhase('streaming')
    setDebugInfo({ previewBody: null, actualBody: null, sseChunks: [] })

    // 构造消息
    const messages: any[] = []

    // 添加 system prompt
    if (activeSystemPrompt.trim()) {
      messages.push({ role: 'system', content: activeSystemPrompt.trim() })
    }

    // 添加历史消息（即 newMessages）
    newMessages.forEach((m) => {
      if (m.role === 'user' && m.images && m.images.length > 0) {
        const content: any[] = [{ type: 'text', text: m.content }]
        m.images.forEach((url) => {
          content.push({ type: 'image_url', image_url: { url } })
        })
        messages.push({ role: m.role, content })
      } else {
        messages.push({ role: m.role, content: m.content })
      }
    })

    // 添加当前触发 user 消息（重新发送）
    if (triggerUser.images && triggerUser.images.length > 0) {
      const content: any[] = [{ type: 'text', text: triggerUser.content }]
      triggerUser.images.forEach((url) => {
        content.push({ type: 'image_url', image_url: { url } })
      })
      messages.push({ role: 'user', content })
    } else {
      messages.push({ role: 'user', content: triggerUser.content })
    }

    // 新建助手占位消息
    const assistantMsgId = genId('msg')
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    setChatMessages((prev) => [...prev, assistantMsg])

    // Debug Info：预览请求体
    setDebugInfo((prev) => ({
      ...prev,
      previewBody: {
        model: selectedNode!.model,
        messages,
        stream: true,
        ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
        ...(typeof nodeTestForm.topP === 'number' ? { top_p: nodeTestForm.topP } : {}),
        ...(typeof nodeTestForm.maxTokens === 'number' ? { max_tokens: nodeTestForm.maxTokens } : {}),
      },
    }))

    let fullText = ''
    let fullReasoning = ''

    try {
      await streamChat(
        {
          baseURL: selectedNode.baseURL,
          apiKey: selectedNode.apiKey,
          model: selectedNode.model,
          messages,
          includeRaw: true,
          ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
          ...(typeof nodeTestForm.topP === 'number' ? { topP: nodeTestForm.topP } : {}),
          ...(typeof nodeTestForm.maxTokens === 'number' ? { maxTokens: nodeTestForm.maxTokens } : {}),
        },
        {
          reasoningDelta: (delta) => {
            fullReasoning += delta
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, reasoning: fullReasoning } : m
              )
            )
          },
          delta: (delta) => {
            fullText += delta
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: fullText } : m
              )
            )
          },
          requestBody: (body) => {
            setDebugInfo((prev) => ({ ...prev, actualBody: body as object }))
          },
          rawChunk: (raw) => {
            setDebugInfo((prev) => ({ ...prev, sseChunks: [...prev.sseChunks, raw] }))
          },
          done: (finalText) => {
            const finalMessages = newMessages.map((m) => ({ ...m }))
            finalMessages.push({
              id: assistantMsgId,
              role: 'assistant' as const,
              content: finalText,
              timestamp: Date.now(),
              reasoning: fullReasoning || undefined,
            })
            setChatMessages(finalMessages)
            syncSessionMessages(finalMessages)
            setPhase('done')
            setStatusText('')
          },
          error: (err) => {
            const errorMsg: ChatMessage = {
              id: genId('msg'),
              role: 'assistant',
              content: `失败：${err}`,
              timestamp: Date.now(),
            }
            const finalMessages = [...newMessages, errorMsg]
            setChatMessages(finalMessages)
            syncSessionMessages(finalMessages)
            setPhase('error')
            setStatusText('')
          },
        },
        ac.signal,
      )
    } catch (e) {
      if (ac.signal.aborted) {
        setPhase('idle')
        setStatusText('')
        return
      }
      const errMsg = e instanceof Error ? e.message : String(e)
      const errorMsg: ChatMessage = {
        id: genId('msg'),
        role: 'assistant',
        content: `失败：${errMsg}`,
        timestamp: Date.now(),
      }
      const finalMessages = [...newMessages, errorMsg]
      setChatMessages(finalMessages)
      syncSessionMessages(finalMessages)
      setPhase('error')
      setStatusText('')
    } finally {
      if (acRef.current === ac) acRef.current = null
    }
  }

  // 粘贴图片监听（图生图或多模态时启用）
  useEffect(() => {
    if (!supportsEdit && !isMultimodal) return
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        setSelectedImages((prev) => [...prev, ...imageFiles])
        message.success(`已粘贴 ${imageFiles.length} 张图片`)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [supportsEdit, isMultimodal, message])

  const handleGenerate = async () => {
    if (!selectedNode) {
      message.warning(`请先选择一个${isImageMode ? '图片生成' : '文本推理'}节点`)
      return
    }
    if (!nodeTestForm.prompt.trim()) {
      message.warning('请输入提示词')
      return
    }
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac

    setPhase('idle')
    setStatusText('')
    setCurrentResult(null)
    setCurrentTextResponse('')
    setDebugInfo({ previewBody: null, actualBody: null, sseChunks: [] })

    // 处理图片输入（图生图或多模态）
    const imageInputs: string[] = []
    const usedImageMode: ImageInputMode = nodeTestForm.imageInputMode || 'base64'
    if ((supportsEdit || isMultimodal) && selectedImages.length > 0) {
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

    try {
      if (isImageMode) {
        // 图片生成模式
        const size = isModelScope ? nodeTestForm.resolution : undefined
        await generateImage(
          {
            baseURL: selectedNode.baseURL,
            apiKey: selectedNode.apiKey,
            model: selectedNode.model,
            prompt: nodeTestForm.prompt.trim(),
            ...(size ? { size } : {}),
            ...(nodeTestForm.negativePrompt?.trim() ? { negativePrompt: nodeTestForm.negativePrompt.trim() } : {}),
            ...(typeof nodeTestForm.steps === 'number' && nodeTestForm.steps > 0 ? { steps: nodeTestForm.steps } : {}),
            ...(typeof nodeTestForm.guidance === 'number' ? { guidance: nodeTestForm.guidance } : {}),
            ...(typeof nodeTestForm.seed === 'number' ? { seed: nodeTestForm.seed } : {}),
            ...(imageInputs.length > 0 ? { imageInputs } : {}),
          },
          {
            submitted: ({ taskId }) => {
              setPhase('submitted')
              setStatusText(`任务 ${taskId.slice(0, 12)}… 已提交`)
            },
            polling: ({ status, attempt }) => {
              setPhase('polling')
              setStatusText(`${status}（第 ${attempt} 次轮询）`)
            },
            done: ({ image: dataUrl }) => {
              setCurrentResult(dataUrl)
              setPhase('done')
              setStatusText('')
              // 对话记录：追加一轮 user prompt + assistant image
              const userMsg: ChatMessage = {
                id: genId('msg'),
                role: 'user',
                content: nodeTestForm.prompt.trim(),
                timestamp: Date.now(),
                ...(imageInputs.length > 0 ? { images: imageInputs } : {}),
              }
              const assistantMsg: ChatMessage = {
                id: genId('msg'),
                role: 'assistant',
                content: dataUrl,
                timestamp: Date.now(),
              }
              const testType: ChatSession['testType'] = imageInputs.length > 0 ? 'multimodal' : 'image'
              let sessionId = activeChatSessionId
              const isFirst = !sessionId
              if (!sessionId) {
                sessionId = createChatSession({
                  id: genId('cs'),
                  title: nodeTestForm.prompt.trim().slice(0, 20),
                  testType,
                  nodeId: selectedNode!.id,
                  modelName: selectedNode!.model,
                  messages: [userMsg, assistantMsg],
                  ...(size ? { size } : {}),
                  ...(nodeTestForm.negativePrompt?.trim() ? { negativePrompt: nodeTestForm.negativePrompt.trim() } : {}),
                  ...(typeof nodeTestForm.steps === 'number' && nodeTestForm.steps > 0 ? { steps: nodeTestForm.steps } : {}),
                  ...(typeof nodeTestForm.guidance === 'number' ? { guidance: nodeTestForm.guidance } : {}),
                  ...(typeof nodeTestForm.seed === 'number' ? { seed: nodeTestForm.seed } : {}),
                  ...(imageInputs.length > 0 ? { imageInputMode: usedImageMode } : {}),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                })
                setActiveChatSessionId(sessionId)
              } else {
                const cur = chatSessions.find((c: ChatSession) => c.id === sessionId)
                updateChatSession(sessionId, {
                  messages: [...(cur?.messages ?? []), userMsg, assistantMsg],
                  updatedAt: new Date().toISOString(),
                })
              }
              if (isFirst) {
                const sid = sessionId
                generateTitle(
                  { baseURL: selectedNode!.baseURL, apiKey: selectedNode!.apiKey, model: selectedNode!.model },
                  nodeTestForm.prompt.trim(),
                  '',
                ).then((title) => renameChatSession(sid, title)).catch(() => {})
              }
            },
            debug: ({ stage, payload, response, error: dbgError }) => {
              setDebugInfo((prev) => {
                const next = { ...prev }
                if (stage === 'submit') {
                  next.previewBody = { model: selectedNode!.model, size, prompt: nodeTestForm.prompt.trim() }
                  if (payload !== undefined) next.actualBody = payload
                }
                const chunk: { line: string; json: unknown | null } = {
                  line: `${stage}${dbgError ? ' \u26a0 ' + dbgError : ''}`,
                  json: response ?? null,
                }
                return { ...next, sseChunks: [...prev.sseChunks, chunk] }
              })
            },
          },
          ac.signal,
        )
      } else {
        // 文本推理模式（聊天形式）
        setPhase('streaming')
        const userMsg: ChatMessage = {
          id: genId('msg'),
          role: 'user',
          content: nodeTestForm.prompt.trim(),
          timestamp: Date.now(),
          images: imageInputs.length > 0 ? imageInputs : undefined,
        }

        // 立即添加一个助手消息占位符
        const assistantMsgId = genId('msg')
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        }
        setChatMessages((prev) => [...prev, userMsg, assistantMsg])
        setCurrentTextResponse('')

        // 构造消息
        const messages: any[] = []

        // 添加 system prompt（取当前激活预设的已保存内容）
        if (activeSystemPrompt.trim()) {
          messages.push({ role: 'system', content: activeSystemPrompt.trim() })
        }

        // 添加历史消息
        chatMessages.forEach((msg) => {
          if (msg.role === 'user' && msg.images && msg.images.length > 0) {
            // 多模态消息
            const content: any[] = [{ type: 'text', text: msg.content }]
            msg.images.forEach((url) => {
              content.push({ type: 'image_url', image_url: { url } })
            })
            messages.push({ role: msg.role, content })
          } else {
            messages.push({ role: msg.role, content: msg.content })
          }
        })

        // 添加当前用户消息
        if (isMultimodal && imageInputs.length > 0) {
          const content: any[] = [{ type: 'text', text: nodeTestForm.prompt.trim() }]
          imageInputs.forEach((url) => {
            content.push({ type: 'image_url', image_url: { url } })
          })
          messages.push({ role: 'user', content })
        } else {
          messages.push({ role: 'user', content: nodeTestForm.prompt.trim() })
        }

        // Debug Info：预览请求体
        setDebugInfo((prev) => ({
          ...prev,
          previewBody: {
            model: selectedNode!.model,
            messages,
            stream: true,
            ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
            ...(typeof nodeTestForm.topP === 'number' ? { top_p: nodeTestForm.topP } : {}),
            ...(typeof nodeTestForm.maxTokens === 'number' ? { max_tokens: nodeTestForm.maxTokens } : {}),
          },
        }))

        let fullText = ''
        let fullReasoning = ''
        await streamChat(
          {
            baseURL: selectedNode.baseURL,
            apiKey: selectedNode.apiKey,
            model: selectedNode.model,
            messages,
            includeRaw: true,
            ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
            ...(typeof nodeTestForm.topP === 'number' ? { topP: nodeTestForm.topP } : {}),
            ...(typeof nodeTestForm.maxTokens === 'number' ? { maxTokens: nodeTestForm.maxTokens } : {}),
          },
          {
            reasoningDelta: (delta) => {
              fullReasoning += delta
              // 实时更新助手消息的 reasoning
              setChatMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId ? { ...msg, reasoning: fullReasoning } : msg
                )
              )
            },
            delta: (delta) => {
              fullText += delta
              setCurrentTextResponse(fullText)
              // 实时更新助手消息的内容
              setChatMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId ? { ...msg, content: fullText } : msg
                )
              )
            },
            requestBody: (body) => {
              setDebugInfo((prev) => ({ ...prev, actualBody: body as object }))
            },
            rawChunk: (raw) => {
              setDebugInfo((prev) => ({ ...prev, sseChunks: [...prev.sseChunks, raw] }))
            },
            done: (finalText) => {
              // 更新助手消息为最终内容
              setChatMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId ? { ...msg, content: finalText, reasoning: fullReasoning || undefined } : msg
                )
              )
              setCurrentResult(finalText)
              setCurrentTextResponse(finalText)
              setPhase('done')
              setStatusText('')
              setForm({ prompt: '' })
              // 对话记录
              const finalUser: ChatSessionMessage = {
                id: genId('msg'),
                role: 'user',
                content: nodeTestForm.prompt.trim(),
                timestamp: Date.now(),
                ...(imageInputs.length > 0 ? { images: imageInputs } : {}),
              }
              const finalAsst: ChatSessionMessage = {
                id: genId('msg'),
                role: 'assistant',
                content: finalText,
                timestamp: Date.now(),
                ...(fullReasoning ? { reasoning: fullReasoning } : {}),
              }
              const testType2: ChatSession['testType'] = isMultimodal && imageInputs.length > 0 ? 'multimodal' : 'text'
              let sid = activeChatSessionId
              const isFirstRound = !sid
              if (!sid) {
                sid = createChatSession({
                  id: genId('cs'),
                  title: nodeTestForm.prompt.trim().slice(0, 20),
                  testType: testType2,
                  nodeId: selectedNode!.id,
                  modelName: selectedNode!.model,
                  messages: [finalUser, finalAsst],
                  systemPromptContent: activeSystemPrompt.trim() || undefined,
                  ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
                  ...(typeof nodeTestForm.topP === 'number' ? { topP: nodeTestForm.topP } : {}),
                  ...(typeof nodeTestForm.maxTokens === 'number' ? { maxTokens: nodeTestForm.maxTokens } : {}),
                  ...(imageInputs.length > 0 ? { imageInputMode: usedImageMode } : {}),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                })
                setActiveChatSessionId(sid)
              } else {
                const cur = chatSessions.find((c: ChatSession) => c.id === sid)
                updateChatSession(sid, {
                  messages: [...(cur?.messages ?? []), finalUser, finalAsst],
                  updatedAt: new Date().toISOString(),
                })
              }
              if (isFirstRound) {
                const csid = sid
                generateTitle(
                  { baseURL: selectedNode!.baseURL, apiKey: selectedNode!.apiKey, model: selectedNode!.model },
                  nodeTestForm.prompt.trim(),
                  finalText,
                ).then((title) => renameChatSession(csid, title)).catch(() => {})
              }
            },
            error: (err) => {
              // 将错误显示在聊天气泡中
              const errorMsg: ChatMessage = {
                id: genId('msg'),
                role: 'assistant',
                content: `失败：${err}`,
                timestamp: Date.now(),
              }
              setChatMessages((prev) => [...prev, errorMsg])
              setPhase('error')
              setStatusText('')
            },
          },
          ac.signal,
        )
      }
    } catch (e) {
      if (ac.signal.aborted) {
        setPhase('idle')
        setStatusText('')
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      // 将错误显示在聊天气泡中
      const errorMsg: ChatMessage = {
        id: genId('msg'),
        role: 'assistant',
        content: `失败：${msg}`,
        timestamp: Date.now(),
      }
      setChatMessages((prev) => [...prev, errorMsg])
      setPhase('error')
      setStatusText('')
    } finally {
      if (acRef.current === ac) acRef.current = null
    }
  }

  const handleCancel = () => {
    acRef.current?.abort()
    acRef.current = null
    setPhase('idle')
    setStatusText('')
  }

  const handleFileSelect = (file: File) => {
    setSelectedImages((prev) => [...prev, file])
    return false // 阻止自动上传
  }

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey && !busy) {
      e.preventDefault()
      handleGenerate()
    }
  }

  const busy = phase === 'submitted' || phase === 'polling' || phase === 'streaming'
  const displayResult = currentResult

  // 节点池按 baseURL + 节点组名分组
  const groupedProviders = availableNodes.reduce((acc, node) => {
    const groupName = node.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || node.baseURL
    const key = `${node.baseURL}|||${groupName}` // 组合键：URL + 组名
    if (!acc[key]) {
      acc[key] = { groupName, baseURL: node.baseURL, nodes: [] }
    }
    acc[key].nodes.push(node)
    return acc
  }, {} as Record<string, { groupName: string; baseURL: string; nodes: ProviderNode[] }>)

  // 切换分组展开/折叠，并持久化
  const toggleGroup = (groupKey: string) => {
    const newState = { ...nodeGroupExpanded, [groupKey]: !(nodeGroupExpanded[groupKey] ?? true) }
    setState({ nodeGroupExpanded: newState })
    pushSettingsNow()
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: token.colorBgContainer }}>
      {/* 主内容区（去除左侧栏） */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {mainView === 'history' ? (
          <HistoryList
            sessions={chatSessions}
            onSelect={(id) => {
              const s = chatSessions.find((c: { id: string }) => c.id === id)
              if (s) {
                setActiveChatSessionId(id)
                setChatMessages((s.messages ?? []).map((m) => ({
                  id: m.id || genId('msg'),
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp || Date.now(),
                  ...(m.images ? { images: m.images } : {}),
                  ...(m.reasoning ? { reasoning: m.reasoning } : {}),
                })))
                setTestMode(s.testType === 'image' ? 'image' : 'text')
                setMainView('chat')
                setCurrentResult(null)
                setCurrentTextResponse('')
              }
            }}
            onRename={(id, title) => renameChatSession(id, title)}
            onDelete={(id) => deleteChatSession(id)}
            onExit={() => setMainView('chat')}
          />
        ) : (
          <>
            {/* 主展示区 */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              {!selectedNode ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, padding: 24 }}>
              {testMode === 'image' ? (
                <>
                  <PictureOutlined style={{ fontSize: 64, color: token.colorTextSecondary, marginBottom: 16 }} />
                  <Typography.Text style={{ color: token.colorTextSecondary, display: 'block', fontSize: 15 }}>选择图片生成节点开始测试</Typography.Text>
                </>
              ) : (
                <>
                  <MessageOutlined style={{ fontSize: 64, color: token.colorTextSecondary, marginBottom: 16 }} />
                  <Typography.Text style={{ color: token.colorTextSecondary, display: 'block', fontSize: 15 }}>选择文本推理节点开始对话</Typography.Text>
                </>
              )}
            </div>
          ) : isImageMode ? (
            /* 图片模式：中央展示 */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              {displayResult ? (
                <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
                  <img
                    src={displayResult}
                    alt="生成结果"
                    style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12, display: 'block', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                  />
                  {busy && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0,0,0,0.7)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 12,
                    }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        border: '3px solid rgba(88,166,255,0.3)',
                        borderTop: '3px solid #58a6ff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      <Typography.Text style={{ color: token.colorText, marginTop: 12 }}>生成中...</Typography.Text>
                    </div>
                  )}
                </div>
              ) : (
                <Typography.Text style={{ color: token.colorTextSecondary }}>输入提示词生成图片</Typography.Text>
              )}
            </div>
          ) : (
            /* 文本模式：聊天界面 */
            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900, width: '100%', margin: '0 auto', height: '100%', padding: '24px 24px 0' }}>
              {/* 聊天消息 */}
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {chatMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, opacity: 0.5 }}>
                    <MessageOutlined style={{ fontSize: 48, color: token.colorTextSecondary, marginBottom: 16 }} />
                    <Typography.Text style={{ color: token.colorTextSecondary, display: 'block' }}>
                      输入消息开始对话
                    </Typography.Text>
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg) => {
                      const isLastAssistant = lastAssistantMeta?.msgId === msg.id
                      const isEditing = editingMsgId === msg.id
                      const isStreamingLast = msg.role === 'assistant' && phase === 'streaming' && msg.id === chatMessages[chatMessages.length - 1]?.id
                      return (
                        <div
                          key={msg.id}
                          style={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            marginBottom: 16,
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '75%',
                              padding: 12,
                              borderRadius: 12,
                              background: msg.role === 'user' ? (token.colorBgBase === '#ffffff' ? token.colorPrimaryBg : 'rgba(22, 119, 255, 0.15)') : (token.colorBgBase === '#ffffff' ? token.colorBgElevated : 'rgba(255, 255, 255, 0.08)'),
                              border: `1px solid ${msg.role === 'user' ? token.colorPrimaryBorder : token.colorBorder}`,
                              position: 'relative',
                            }}
                          >
                            {/* 图片网格 */}
                            {msg.images && msg.images.length > 0 && (
                              <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {msg.images.map((img, idx) => (
                                  <img key={idx} src={img} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
                                ))}
                              </div>
                            )}
                            {/* 时间戳（移到顶部） */}
                            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </Typography.Text>
                            {/* Reasoning 显示 */}
                            {msg.role === 'assistant' && msg.reasoning && (
                              <div style={{ marginBottom: 8 }}>
                                {msg.content ? (
                                  // 完成后折叠显示
                                  <Collapse
                                    ghost
                                    size="small"
                                    items={[{
                                      key: 'reasoning',
                                      label: (
                                        <Space size={4}>
                                          <BulbOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
                                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>思考过程</Typography.Text>
                                          <Button
                                            type="text"
                                            size="small"
                                            icon={<CopyOutlined />}
                                            title="复制思考过程"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              copyText(msg.reasoning!)
                                            }}
                                            style={{ fontSize: 12, height: 20, padding: '0 4px', marginLeft: 4 }}
                                          />
                                        </Space>
                                      ),
                                      children: (
                                        <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: token.colorTextTertiary, display: 'block' }}>
                                          {msg.reasoning}
                                        </Typography.Text>
                                      ),
                                    }]}
                                    style={{
                                      background: token.colorFillQuaternary,
                                      borderRadius: 8,
                                      padding: '4px 8px',
                                    }}
                                  />
                                ) : (
                                  // 推理中流式显示
                                  <div style={{
                                    background: token.colorFillQuaternary,
                                    borderRadius: 8,
                                    padding: '8px 12px',
                                    marginBottom: 4,
                                  }}>
                                    <Space size={4} style={{ marginBottom: 6 }}>
                                      <BulbOutlined style={{ fontSize: 12, color: token.colorPrimary }} />
                                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>推理中...</Typography.Text>
                                    </Space>
                                    <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: token.colorTextTertiary, display: 'block' }}>
                                      {msg.reasoning}
                                    </Typography.Text>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* 正文区：编辑态 vs 普通显示 */}
                            {isEditing ? (
                              <div>
                                <textarea
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  rows={6}
                                  style={{
                                    width: '100%',
                                    background: token.colorBgContainer,
                                    border: `1px solid ${token.colorBorder}`,
                                    borderRadius: 6,
                                    padding: 8,
                                    color: token.colorText,
                                    fontSize: 14,
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    marginBottom: 8,
                                  }}
                                />
                                <div style={{ textAlign: 'right' }}>
                                  <Space size={8}>
                                    <Button size="small" onClick={cancelEdit}>取消</Button>
                                    <Button size="small" type="primary" onClick={commitEdit}>保存</Button>
                                  </Space>
                                </div>
                              </div>
                            ) : (
                              <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 14, display: 'block' }}>
                                {msg.content}
                              </Typography.Text>
                            )}
                            {/* 底部操作行 */}
                            {!isEditing && (
                              <div style={{ marginTop: 8 }}>
                                {isStreamingLast ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <div style={{
                                      width: 12,
                                      height: 12,
                                      border: `2px solid ${token.colorPrimary}33`,
                                      borderTop: `2px solid ${token.colorPrimary}`,
                                      borderRadius: '50%',
                                      animation: 'spin 1s linear infinite',
                                    }} />
                                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>推理中...</Typography.Text>
                                  </div>
                                ) : (
                                  <Space size={4}>
                                    <Tooltip title="重试">
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<RedoOutlined />}
                                        onClick={() => retryMessage(msg.id)}
                                        disabled={busy}
                                        style={{ fontSize: 12, height: 20, padding: '0 4px' }}
                                      />
                                    </Tooltip>
                                    <Tooltip title="复制">
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<CopyOutlined />}
                                        onClick={() => copyText(msg.content)}
                                        style={{ fontSize: 12, height: 20, padding: '0 4px' }}
                                      />
                                    </Tooltip>
                                    <Tooltip title="编辑">
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<EditOutlined />}
                                        onClick={() => editMessage(msg.id)}
                                        disabled={busy}
                                        style={{ fontSize: 12, height: 20, padding: '0 4px' }}
                                      />
                                    </Tooltip>
                                    <Popconfirm
                                      title="删除该条消息？"
                                      onConfirm={() => deleteMessage(msg.id)}
                                      okText="删除"
                                      cancelText="取消"
                                      okButtonProps={{ danger: true }}
                                    >
                                      <Tooltip title="删除">
                                        <Button
                                          type="text"
                                          size="small"
                                          icon={<DeleteOutlined />}
                                          disabled={busy}
                                          style={{ fontSize: 12, height: 20, padding: '0 4px' }}
                                        />
                                      </Tooltip>
                                    </Popconfirm>
                                  </Space>
                                )}
                              </div>
                            )}
                            {/* 节点·模型名（仅最后一条 assistant） */}
                            {isLastAssistant && !isEditing && !isStreamingLast && lastAssistantMeta && (
                              <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                                {lastAssistantMeta.label}
                              </Typography.Text>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div style={{ borderTop: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
          {/* 图片预览区（展示在文本框上方） */}
          {(supportsEdit || isMultimodal) && selectedImages.length > 0 && (
            <div style={{ padding: '12px 16px', background: token.colorBgElevated, borderBottom: `1px solid ${token.colorBorder}` }}>
              <Space wrap size={8}>
                {selectedImages.map((file, idx) => {
                  const previewUrl = URL.createObjectURL(file)
                  return (
                    <div key={idx} style={{ position: 'relative' }}>
                      <Image
                        src={previewUrl}
                        alt=""
                        width={80}
                        height={80}
                        style={{ objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                        preview={{
                          cover: <div style={{ fontSize: 12 }}>查看</div>
                        }}
                      />
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<CloseOutlined />}
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          background: 'rgba(0,0,0,0.8)',
                          border: 'none',
                          padding: 0,
                          minWidth: 20,
                          height: 20,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff'
                        }}
                        onClick={() => removeImage(idx)}
                      />
                    </div>
                  )
                })}
              </Space>
            </div>
          )}

          {/* 底部选择菜单（向上展开） */}
          {bottomMenuOpen && (
            <div style={{
              borderTop: `1px solid ${token.colorBorder}`,
              background: token.colorBgElevated,
              maxHeight: 400,
              overflowY: 'auto'
            }}>
              {/* 测试模式选择 */}
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}` }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 8 }}>测试模式</Typography.Text>
                <Segmented
                  block
                  value={testMode}
                  onChange={(v) => {
                    setTestMode(v as TestMode)
                    setState({ nodeTestGlobalForm: { ...nodeTestGlobalForm, nodeId: undefined } })
                    setChatMessages([])
                    setCurrentResult(null)
                    setActiveChatSessionId(null)
                  }}
                  options={[
                    { label: '文本推理', value: 'text', icon: <MessageOutlined /> },
                    { label: '图片生成', value: 'image', icon: <PictureOutlined /> },
                  ]}
                />
              </div>

              {/* 节点列表 */}
              <div style={{ padding: '8px 0', maxHeight: 300, overflowY: 'auto' }}>
                {Object.entries(groupedProviders).map(([groupKey, { groupName, baseURL, nodes }]) => {
                  const isExpanded = nodeGroupExpanded[groupKey] ?? true
                  return (
                    <div key={groupKey} style={{ marginBottom: 4 }}>
                      {/* 分组标题 */}
                      <div
                        style={{
                          padding: '8px 16px',
                          cursor: 'pointer',
                          background: isExpanded ? token.colorFillQuaternary : 'transparent',
                          transition: 'background 0.2s',
                        }}
                        onClick={() => toggleGroup(groupKey)}
                      >
                        <Space size={4}>
                          <Typography.Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
                            {isExpanded ? '▼' : '▶'}
                          </Typography.Text>
                          <Typography.Text strong style={{ fontSize: 13 }}>{groupName}</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>({nodes.length})</Typography.Text>
                        </Space>
                        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2, marginLeft: 12 }}>
                          {baseURL}
                        </Typography.Text>
                      </div>

                      {/* 节点列表 */}
                      {isExpanded && nodes.map((node) => (
                        <div
                          key={node.id}
                          style={{
                            padding: '8px 16px 8px 28px',
                            cursor: 'pointer',
                            background: effectiveNodeId === node.id ? token.colorPrimaryBg : 'transparent',
                            borderLeft: effectiveNodeId === node.id ? `3px solid ${token.colorPrimary}` : '3px solid transparent',
                            transition: 'all 0.2s',
                          }}
                          onClick={() => {
                            setState({ nodeTestGlobalForm: { ...nodeTestGlobalForm, nodeId: node.id } })
                            setBottomMenuOpen(false)
                          }}
                        >
                          <Typography.Text style={{ fontSize: 13, display: 'block', fontWeight: effectiveNodeId === node.id ? 500 : 400, color: effectiveNodeId === node.id ? token.colorPrimary : token.colorText }}>
                            {groupName} · {node.model}
                          </Typography.Text>
                          {node.supportsImageEdit && <Typography.Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>🖼️ 图生图</Typography.Text>}
                          {node.isMultimodal && <Typography.Text type="secondary" style={{ fontSize: 11 }}>👁️ 多模态</Typography.Text>}
                        </div>
                      ))}
                    </div>
                  )
                })}
                {availableNodes.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <Typography.Text type="secondary">无可用节点</Typography.Text>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 输入框区域 */}
          <div style={{ display: 'flex', alignItems: 'flex-end', background: token.colorBgContainer }}>
            {/* 左侧按钮组 */}
            <div style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${token.colorBorder}` }}>
              {/* 模式/节点选择按钮 */}
              <Button
                icon={<MessageOutlined style={{ fontSize: 16 }} />}
                onClick={() => setBottomMenuOpen(!bottomMenuOpen)}
                style={{
                  height: 48,
                  width: 48,
                  borderRadius: 0,
                  border: 'none',
                  borderBottom: `1px solid ${token.colorBorder}`,
                  background: bottomMenuOpen ? token.colorPrimaryBg : 'transparent',
                  color: bottomMenuOpen ? token.colorPrimary : token.colorText,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              />

              {/* 图片上传按钮 */}
              {(supportsEdit || isMultimodal) && (
                <Upload
                  accept="image/*"
                  multiple
                  beforeUpload={handleFileSelect}
                  showUploadList={false}
                >
                  <Button
                    icon={<FileImageOutlined style={{ fontSize: 16 }} />}
                    style={{
                      height: 48,
                      width: 48,
                      borderRadius: 0,
                      border: 'none',
                      background: 'transparent',
                      color: token.colorText,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  />
                </Upload>
              )}
            </div>

            {/* 文本输入框 */}
            <textarea
              ref={promptRef}
              value={nodeTestForm.prompt}
              onChange={(e) => setForm({ prompt: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder={
                isImageMode
                  ? (supportsEdit && selectedImages.length > 0
                      ? "描述你想对图片做的修改..."
                      : "输入提示词，描述你想要的画面...")
                  : (isMultimodal && selectedImages.length > 0
                      ? "描述你的问题（已添加 " + selectedImages.length + " 张图片）..."
                      : isMultimodal
                        ? "输入问题开始对话（支持 Ctrl+V 粘贴图片）..."
                        : "输入问题开始对话（Shift+Enter 发送）...")
              }
              disabled={busy}
              rows={3}
              style={{
                flex: 1,
                background: token.colorBgContainer,
                border: 'none',
                padding: '12px 16px',
                color: token.colorText,
                fontSize: 14,
                resize: 'none',
                fontFamily: 'inherit',
                outline: 'none'
              }}
            />

            {/* 发送/取消按钮 */}
            {busy ? (
              <Button
                danger
                onClick={handleCancel}
                style={{
                  height: 96,
                  minWidth: 80,
                  borderRadius: 0,
                  border: 'none',
                  borderLeft: `1px solid ${token.colorBorder}`,
                  fontSize: 14
                }}
              >
                取消
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined style={{ fontSize: 18 }} />}
                onClick={handleGenerate}
                disabled={!selectedNode || !nodeTestForm.prompt.trim()}
                style={{
                  height: 96,
                  minWidth: 80,
                  borderRadius: 0,
                  background: (!selectedNode || !nodeTestForm.prompt.trim()) ? token.colorBgContainerDisabled : '#FF6B35',
                  borderColor: (!selectedNode || !nodeTestForm.prompt.trim()) ? token.colorBorder : '#FF6B35',
                  border: 'none',
                  borderLeft: `1px solid ${token.colorBorder}`,
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#fff'
                }}
              >
                发送
              </Button>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      {/* 右侧设置面板 */}
      <div style={{ width: 320, background: token.colorBgElevated, borderLeft: `1px solid ${token.colorBorder}`, display: 'flex', flexDirection: 'column' }}>
        {sidebarView === 'sysPrompt' ? (
          <SystemPromptEditor
            key={systemPromptActiveId ?? '__new__'}
            presets={systemPromptPresets}
            activeId={systemPromptActiveId}
            activeTitle={activeSystemPromptPreset?.title ?? ''}
            activeContent={activeSystemPromptPreset?.content ?? ''}
            onSave={saveSystemPromptPreset}
            onDelete={deleteSystemPromptPreset}
            onSelect={setSystemPromptActiveId}
            onClose={() => setSidebarView('params')}
          />
        ) : sidebarView === 'debug' ? (
          <DebugInfoPanel data={debugInfo} onClose={() => setSidebarView('params')} />
        ) : (
          <>
            {/* 顶部 header：参数设置标题 + System Instructions 入口 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
              <Typography.Title level={5} style={{ margin: 0, color: token.colorText }}>参数设置</Typography.Title>
              <Space size={8}>
                <Button size="small" onClick={() => setSidebarView('sysPrompt')}>System Instructions</Button>
                <Button size="small" onClick={() => setSidebarView('debug')}>Debug Info</Button>
              </Space>
            </div>
            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>

          {isImageMode ? (
            <>
              {isModelScope && (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>分辨率</Typography.Text>
                  <Select
                    style={{ width: '100%' }}
                    value={nodeTestForm.resolution}
                    onChange={(v) => setForm({ resolution: v })}
                    options={RESOLUTIONS}
                  />
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>反向提示词</Typography.Text>
                <textarea
                  value={nodeTestForm.negativePrompt ?? ''}
                  onChange={(e) => setForm({ negativePrompt: e.target.value })}
                  placeholder="描述要避免的内容"
                  disabled={busy}
                  rows={3}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {(supportsEdit || isMultimodal) && (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>图片输入方式</Typography.Text>
                  <Select
                    value={nodeTestForm.imageInputMode || 'base64'}
                    onChange={(mode) => setForm({ imageInputMode: mode as ImageInputMode })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="base64">Base64 直传（推荐）</Select.Option>
                    <Select.OptGroup label="临时图床中转（适合大图片）">
                      <Select.Option value="catbox">Catbox（永久保留，≤200MB）</Select.Option>
                      <Select.Option value="litterbox">Litterbox（1-72小时，≤1GB）</Select.Option>
                      <Select.Option value="0x0">0x0.st（约30天，数十MB）</Select.Option>
                      <Select.Option value="telegraph">Telegraph（长期，≤5MB）</Select.Option>
                    </Select.OptGroup>
                  </Select>
                </div>
              )}

              {isModelScope && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>采样步数</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.steps ?? ''}
                      onChange={(e) => setForm({ steps: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="如 9"
                      disabled={busy}
                      min={1}
                      max={100}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>引导系数</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.guidance ?? ''}
                      onChange={(e) => setForm({ guidance: e.target.value ? parseFloat(e.target.value) : undefined })}
                      placeholder="如 4.0"
                      disabled={busy}
                      step={0.5}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>随机种子</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.seed ?? ''}
                      onChange={(e) => setForm({ seed: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="留空=随机"
                      disabled={busy}
                      min={0}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Temperature</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.temperature ?? 0.7}
                  onChange={(e) => setForm({ temperature: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="0.7"
                  disabled={busy}
                  min={0}
                  max={2}
                  step={0.1}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Top P</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.topP ?? 0.9}
                  onChange={(e) => setForm({ topP: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="0.9"
                  disabled={busy}
                  min={0}
                  max={1}
                  step={0.05}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Max Tokens</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.maxTokens ?? 2000}
                  onChange={(e) => setForm({ maxTokens: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="2000"
                  disabled={busy}
                  min={1}
                  max={100000}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              {isMultimodal && (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>图片输入方式</Typography.Text>
                  <Select
                    value={nodeTestForm.imageInputMode || 'base64'}
                    onChange={(mode) => setForm({ imageInputMode: mode as ImageInputMode })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="base64">Base64 直传（推荐）</Select.Option>
                    <Select.OptGroup label="临时图床中转（适合大图片）">
                      <Select.Option value="catbox">Catbox（永久保留，≤200MB）</Select.Option>
                      <Select.Option value="litterbox">Litterbox（1-72小时，≤1GB）</Select.Option>
                      <Select.Option value="0x0">0x0.st（约30天，数十MB）</Select.Option>
                      <Select.Option value="telegraph">Telegraph（长期，≤5MB）</Select.Option>
                    </Select.OptGroup>
                  </Select>
                </div>
              )}

              <Button
                block
                danger
                onClick={() => {
                  setChatMessages([])
                  setCurrentResult(null)
                  setCurrentTextResponse('')
                  setActiveChatSessionId(null)
                }}
                style={{ marginTop: 16 }}
              >
                清空对话历史
              </Button>
            </>
          )}
        </div>

        {/* 对话记录入口 */}
        <div style={{ padding: 16, borderTop: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
          <Button block icon={<HistoryOutlined />} onClick={() => setMainView('history')}>
            对话记录 ({chatSessions.length})
          </Button>
        </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

