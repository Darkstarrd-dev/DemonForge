// 节点测试 · 多 session 推理引擎（模块级单例）。
//
// 设计：把推理执行从 React 组件下沉到这里。每个 session 一个在途 AbortController，
// 跨 session 并发、互不干扰（移植自 opencode run-coordinator 的"每 key 串行、跨 key 并发"语义）。
// 所有运行态写到 appStore.sessionRuntimes[sessionId]，结果写到 chatSessions[sessionId]，UI 只订阅——
// 故"当前显示哪个 session"与"哪个 session 正在跑"完全解耦：切走仍继续，回来仍能看到实时流。
//
// 后端无状态、每条 SSE 独立 AbortController，故多 session = 前端并发多条流，后端零改造。

import { useAppStore, genId } from '../store/appStore'
import type { NodeTestForm } from '../store/appStore'
import type { ProviderNode, ChatSessionMessage, ImageInputMode, SessionRuntime } from './types'
import { streamChat, generateTitle } from './real/chat'
import { generateImageGpt } from './real/gptImage'
import { generateImage } from './real/image'
import { generateImageXai } from './real/xaiImage'

/** 每 session 的在途请求句柄（不可序列化，留模块级，不进 store）。 */
const inflight = new Map<string, AbortController>()

/** 某 session 是否正在推理。 */
export function isSessionRunning(id: string): boolean {
  return inflight.has(id)
}

/** 中止某 session 的在途推理（其它 session 不受影响）。 */
export function cancelSession(id: string): void {
  inflight.get(id)?.abort()
  inflight.delete(id)
  useAppStore.getState().patchSessionRuntime(id, { status: 'idle', statusText: '' })
}

const store = () => useAppStore.getState()
const rt = (id: string, patch: Partial<SessionRuntime>) => store().patchSessionRuntime(id, patch)

/** 追加消息到指定 session（读最新 messages 再 append，避免覆盖并发写入）。 */
function appendMessages(sessionId: string, msgs: ChatSessionMessage[]): void {
  const cur = store().chatSessions.find((c) => c.id === sessionId)
  if (!cur) return
  store().updateChatSession(sessionId, {
    messages: [...cur.messages, ...msgs],
    updatedAt: new Date().toISOString(),
  })
}

/** 追加一条 SSE/阶段调试 chunk（图片模式用）。 */
function pushDebug(
  sessionId: string,
  line: string,
  json: unknown | null,
  preview?: object | null,
  actual?: unknown,
): void {
  const cur = store().sessionRuntimes[sessionId]?.debug ?? { previewBody: null, actualBody: null, sseChunks: [] }
  rt(sessionId, {
    debug: {
      previewBody: preview !== undefined ? preview : cur.previewBody,
      actualBody: actual !== undefined ? (actual as object) : cur.actualBody,
      sseChunks: [...cur.sseChunks, { line, json }],
    },
  })
}

export interface SendArgs {
  sessionId: string
  node: ProviderNode
  testMode: 'text' | 'image'
  /** 图片协议（testMode==='image' 时有意义） */
  protocol: 'modelscope' | 'gpt' | 'xai'
  /** 文本节点是否多模态（附图理解） */
  isMultimodal: boolean
  /** 本轮用户输入文本（prompt） */
  userText: string
  /** 已解析好的输入图片（base64 dataUrl 或图床 URL）；图生图/多模态用 */
  imageInputs: string[]
  imageInputMode?: ImageInputMode
  /** 当前激活的 system prompt 内容（文本模式用） */
  systemPrompt?: string
  /** 节点参数快照（温度/topP/maxTokens + 图片参数） */
  form: NodeTestForm
  /** 是否本会话首轮（用于异步生成标题） */
  isFirstRound: boolean
}

/**
 * 在指定 session 中发起一轮推理。调用方需保证 sessionId 对应的 chatSession 已存在。
 * 立即返回；推理在后台进行，全程写 sessionRuntimes[sessionId] 与 chatSessions[sessionId]。
 */
export function sendInSession(args: SendArgs): void {
  const { sessionId, node, testMode, protocol, isMultimodal, userText, imageInputs, systemPrompt, form, isFirstRound } = args

  // 同一 session 旧任务先中止
  inflight.get(sessionId)?.abort()
  const ac = new AbortController()
  inflight.set(sessionId, ac)

  const assistantMsgId = genId('msg')
  rt(sessionId, {
    status: 'streaming',
    startedAt: Date.now(),
    streamingText: '',
    streamingReasoning: '',
    statusText: '',
    error: undefined,
    pendingAssistantMsgId: assistantMsgId,
    debug: { previewBody: null, actualBody: null, sseChunks: [] },
  })

  // 读历史（append user 之前），再把本轮 user 写入 session（切走也能看到在途轮次）
  const history = store().chatSessions.find((c) => c.id === sessionId)?.messages ?? []
  const userMsg: ChatSessionMessage = {
    id: genId('msg'),
    role: 'user',
    content: userText,
    timestamp: Date.now(),
    ...(imageInputs.length > 0 ? { images: imageInputs } : {}),
    nodeId: node.id,
    modelName: node.model,
  }
  appendMessages(sessionId, [userMsg])

  const finishTitle = () => {
    if (!isFirstRound) return
    generateTitle({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model }, userText, '')
      .then((title) => store().renameChatSession(sessionId, title))
      .catch(() => {})
  }

  const onErr = (msg: string) => {
    appendMessages(sessionId, [{
      id: genId('msg'), role: 'assistant', content: `失败：${msg}`,
      timestamp: Date.now(), nodeId: node.id, modelName: node.model,
    }])
    rt(sessionId, { status: 'error', error: msg, statusText: '' })
    inflight.delete(sessionId)
  }

  /** 中止后的统一收尾（不写错误气泡）。 */
  const onAbort = () => {
    rt(sessionId, { status: 'idle', statusText: '' })
    inflight.delete(sessionId)
  }

  // ===== 文本 / 多模态推理 =====
  if (testMode === 'text') {
    const messages: any[] = []
    if (systemPrompt && systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt.trim() })
    for (const m of history) {
      if (m.role === 'user' && m.images && m.images.length > 0) {
        const content: any[] = [{ type: 'text', text: m.content }]
        m.images.forEach((url) => content.push({ type: 'image_url', image_url: { url } }))
        messages.push({ role: m.role, content })
      } else {
        messages.push({ role: m.role, content: m.content })
      }
    }
    if (isMultimodal && imageInputs.length > 0) {
      const content: any[] = [{ type: 'text', text: userText }]
      imageInputs.forEach((url) => content.push({ type: 'image_url', image_url: { url } }))
      messages.push({ role: 'user', content })
    } else {
      messages.push({ role: 'user', content: userText })
    }

    rt(sessionId, {
      debug: {
        previewBody: {
          model: node.model, messages, stream: true,
          ...(typeof form.temperature === 'number' ? { temperature: form.temperature } : {}),
          ...(typeof form.topP === 'number' ? { top_p: form.topP } : {}),
          ...(typeof form.maxTokens === 'number' ? { max_tokens: form.maxTokens } : {}),
        },
        actualBody: null,
        sseChunks: [],
      },
    })

    let fullText = ''
    let fullReasoning = ''
    streamChat(
      {
        baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, messages, includeRaw: true,
        ...(typeof form.temperature === 'number' ? { temperature: form.temperature } : {}),
        ...(typeof form.topP === 'number' ? { topP: form.topP } : {}),
        ...(typeof form.maxTokens === 'number' ? { maxTokens: form.maxTokens } : {}),
      },
      {
        reasoningDelta: (d) => { fullReasoning += d; rt(sessionId, { streamingReasoning: fullReasoning }) },
        delta: (d) => { fullText += d; rt(sessionId, { streamingText: fullText }) },
        requestBody: (body) => {
          const cur = store().sessionRuntimes[sessionId]?.debug ?? { previewBody: null, actualBody: null, sseChunks: [] }
          rt(sessionId, { debug: { ...cur, actualBody: body as object } })
        },
        rawChunk: (raw) => {
          const cur = store().sessionRuntimes[sessionId]?.debug ?? { previewBody: null, actualBody: null, sseChunks: [] }
          rt(sessionId, { debug: { ...cur, sseChunks: [...cur.sseChunks, raw] } })
        },
        done: (finalText) => {
          appendMessages(sessionId, [{
            id: assistantMsgId, role: 'assistant', content: finalText, timestamp: Date.now(),
            ...(fullReasoning ? { reasoning: fullReasoning } : {}), nodeId: node.id, modelName: node.model,
          }])
          rt(sessionId, { status: 'done', streamingText: '', streamingReasoning: '', statusText: '' })
          inflight.delete(sessionId)
          finishTitle()
        },
        error: (err) => onErr(err),
      },
      ac.signal,
    ).catch((e) => {
      if (ac.signal.aborted) return onAbort()
      onErr(e instanceof Error ? e.message : String(e))
    })
    return
  }

  // ===== 图片生成（三协议）=====
  const onDoneImage = (url: string, revisedPrompt?: string) => {
    appendMessages(sessionId, [{
      id: assistantMsgId, role: 'assistant', content: url, timestamp: Date.now(),
      nodeId: node.id, modelName: node.model, ...(revisedPrompt ? { revisedPrompt } : {}),
    }])
    rt(sessionId, { status: 'done', statusText: '' })
    inflight.delete(sessionId)
    finishTitle()
  }

  if (protocol === 'gpt') {
    const gptSize = form.resolution
    generateImageGpt(
      {
        baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, prompt: userText,
        ...(gptSize ? { size: gptSize } : {}),
        ...(form.gptQuality ? { quality: form.gptQuality } : {}),
        ...(form.gptBackground ? { background: form.gptBackground } : {}),
        ...(form.gptModeration ? { moderation: form.gptModeration } : {}),
        ...(imageInputs.length > 0 ? { imageInputs } : {}),
      },
      {
        start: () => rt(sessionId, { statusText: 'GPT Image 生成中…' }),
        downloading: () => rt(sessionId, { statusText: '下载图片中…' }),
        done: ({ image, revisedPrompt }) => onDoneImage(image, revisedPrompt),
        debug: ({ stage, payload, response, error: dbgError }) => {
          const preview = stage === 'submit' ? { model: node.model, size: gptSize, prompt: userText } : undefined
          const actual = stage === 'submit' && payload !== undefined ? payload : undefined
          pushDebug(sessionId, `${stage}${dbgError ? ' ⚠ ' + dbgError : ''}`, response ?? null, preview, actual)
        },
      },
      ac.signal,
    ).catch((e) => {
      if (ac.signal.aborted) return onAbort()
      onErr(e instanceof Error ? e.message : String(e))
    })
    return
  }

  if (protocol === 'xai') {
    generateImageXai(
      {
        baseURL: node.baseURL, apiKey: node.apiKey ?? '', model: node.model, prompt: userText,
        ...(form.xaiAspectRatio ? { aspectRatio: form.xaiAspectRatio } : {}),
        ...(form.xaiResolution ? { resolution: form.xaiResolution } : {}),
        ...(form.xaiN && form.xaiN > 1 ? { n: form.xaiN } : {}),
        ...(imageInputs.length > 0 ? { imageInputs } : {}),
      },
      {
        start: () => rt(sessionId, { statusText: 'xAI Imagine 生成中…' }),
        done: ({ image }) => onDoneImage(image),
        debug: ({ stage, payload, response, error: dbgError }) => {
          const preview = stage === 'submit' ? { model: node.model, prompt: userText } : undefined
          const actual = stage === 'submit' && payload !== undefined ? payload : undefined
          pushDebug(sessionId, `${stage}${dbgError ? ' ⚠ ' + dbgError : ''}`, response ?? null, preview, actual)
        },
      },
      ac.signal,
    ).catch((e) => {
      if (ac.signal.aborted) return onAbort()
      onErr(e instanceof Error ? e.message : String(e))
    })
    return
  }

  // modelscope（默认）
  const msSize = form.resolution
  generateImage(
    {
      baseURL: node.baseURL, apiKey: node.apiKey ?? '', model: node.model, prompt: userText,
      ...(msSize ? { size: msSize } : {}),
      ...(form.negativePrompt?.trim() ? { negativePrompt: form.negativePrompt.trim() } : {}),
      ...(typeof form.steps === 'number' && form.steps > 0 ? { steps: form.steps } : {}),
      ...(typeof form.guidance === 'number' ? { guidance: form.guidance } : {}),
      ...(typeof form.seed === 'number' ? { seed: form.seed } : {}),
      ...(imageInputs.length > 0 ? { imageInputs } : {}),
    },
    {
      submitted: ({ taskId }) => rt(sessionId, { statusText: `任务 ${taskId.slice(0, 12)}… 已提交` }),
      polling: ({ status, attempt }) => rt(sessionId, { statusText: `${status}（第 ${attempt} 次轮询）` }),
      done: ({ image }) => onDoneImage(image),
      debug: ({ stage, payload, response, error: dbgError }) => {
        const preview = stage === 'submit' ? { model: node.model, size: msSize, prompt: userText } : undefined
        const actual = stage === 'submit' && payload !== undefined ? payload : undefined
        pushDebug(sessionId, `${stage}${dbgError ? ' ⚠ ' + dbgError : ''}`, response ?? null, preview, actual)
      },
    },
    ac.signal,
  ).catch((e) => {
    if (ac.signal.aborted) return onAbort()
    onErr(e instanceof Error ? e.message : String(e))
  })
}
