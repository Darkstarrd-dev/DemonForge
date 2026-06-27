// 角色交流 · 多参与者推理引擎（模块级单例）。
//
// 设计要点（独立 session + 命中缓存）：
//   - 单一数据源：群聊只有一条 append-only 消息流 roleChatMessages。
//   - 每个参与者用纯函数 buildParticipantMessages 从这条流「派生」各自的对话前缀：
//     自己说过的话 → assistant，其他人（含用户）→ 合并进 user。前缀确定且 append-only，
//     故同一参与者多轮调用时，除尾部新增外前缀逐字节一致 → 命中 prompt cache、降费用。
//   - 不同参与者复用同一节点也互不串扰：各自的 system（角色卡）不同 → 各自独立缓存前缀。
//   - 每参与者一个在途 AbortController，跨参与者并发、互不干扰（移植自 sessionEngine 语义）。
//   - 运行态写 appStore.roleChatRuntimes[participantId]，结果写 roleChatMessages，UI 只订阅——
//     「显示哪个参与者 session」与「哪个参与者在跑」完全解耦：切走仍继续，回来仍看到实时流。

import { useAppStore, genId } from '../store/appStore'
import type { EntityCard, RoleChatParticipant, RoleChatMessage, RoleChatRuntime } from './types'
import type { ChatMessage } from './real/chat'
import { streamChat } from './real/chat'

/** 每参与者的在途请求句柄（不可序列化，留模块级，不进 store）。 */
const inflight = new Map<string, AbortController>()

/** 某参与者是否正在推理。 */
export function isParticipantRunning(id: string): boolean {
  return inflight.has(id)
}

/** 中止某参与者的在途推理（其它参与者不受影响）。 */
export function cancelParticipant(id: string): void {
  inflight.get(id)?.abort()
  inflight.delete(id)
  useAppStore.getState().patchRoleChatRuntime(id, { status: 'idle' })
}

const store = () => useAppStore.getState()
const rt = (id: string, patch: Partial<RoleChatRuntime>) => store().patchRoleChatRuntime(id, patch)
const curDebug = (id: string) =>
  store().roleChatRuntimes[id]?.debug ?? { previewBody: null, actualBody: null, sseChunks: [] }

/** 由角色卡 + 场景设定构建固定 system 提示词（确定性：同卡同场景逐字节一致 → 缓存前缀稳定）。 */
export function buildRoleSystemPrompt(card: EntityCard, sceneSetting: string): string {
  const lines: string[] = []
  lines.push(`你正在扮演「${card.name}」。请始终以该角色的身份、性格、语言风格进行对话，不要跳出角色，不要解释你是 AI。`)
  if (card.aliases?.length) lines.push(`别名：${card.aliases.join('、')}`)
  if (card.description?.trim()) lines.push(`\n【角色设定】\n${card.description.trim()}`)
  const fieldEntries = Object.entries(card.fields ?? {}).filter(([, v]) => v && v.trim())
  if (fieldEntries.length) lines.push('\n【属性】\n' + fieldEntries.map(([k, v]) => `${k}：${v}`).join('\n'))
  if (card.styleNote?.trim()) lines.push(`\n【语言风格】\n${card.styleNote.trim()}`)
  if (card.styleExamples?.length) lines.push('\n【台词示例】\n' + card.styleExamples.map((e) => `- ${e}`).join('\n'))
  if (sceneSetting.trim()) lines.push(`\n【当前场景】\n${sceneSetting.trim()}`)
  lines.push(`\n请用简洁自然的对话回应，只输出「${card.name}」本人的发言内容，不要添加旁白或括号说明，不要替其他人发言。`)
  return lines.join('\n')
}

/**
 * 纯函数：把群聊消息流派生为「某参与者视角」的对话消息数组（OpenAI 兼容）。
 * - 自己发过的消息 → assistant；其他人（含用户）→ 以「发言者：内容」累积进同一条 user。
 * - 连续的「他人」发言合并为一条 user，保证 user/assistant 严格交替、前缀确定。
 */
export function buildParticipantMessages(
  card: EntityCard,
  sceneSetting: string,
  messages: RoleChatMessage[],
  participant: RoleChatParticipant,
): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: buildRoleSystemPrompt(card, sceneSetting) }]
  let userBuf: string[] = []
  const flush = () => {
    if (userBuf.length) {
      out.push({ role: 'user', content: userBuf.join('\n') })
      userBuf = []
    }
  }
  for (const m of messages) {
    if (m.participantId === participant.id) {
      flush()
      out.push({ role: 'assistant', content: m.content })
    } else {
      const speaker = m.isUser ? m.participantName || '用户' : m.participantName
      userBuf.push(`${speaker}：${m.content}`)
    }
  }
  flush()
  // 兜底：若没有任何他人发言（开局即让本角色先说），给一条确定性的引导 user，避免无 user 消息被上游拒绝。
  if (!out.some((m) => m.role === 'user' || m.role === 'assistant')) {
    out.push({ role: 'user', content: '（请根据你的角色设定，开启对话）' })
  }
  return out
}

/**
 * 让某参与者基于当前群聊流生成一条回复。返回 Promise，在完成/失败/中止时 resolve（供主界面串行 await）。
 * 全程写 roleChatRuntimes[participant.id]（流式文本/推理/Debug），完成时把成稿 append 到 roleChatMessages。
 */
export function respondParticipant(participant: RoleChatParticipant): Promise<void> {
  const st = store()
  const pid = participant.id
  const card = st.cards.find((c) => c.id === participant.cardId)
  const node = st.providers.find((p) => p.id === participant.nodeId)

  if (!node) {
    rt(pid, { status: 'error', error: '未找到该参与者的推理节点（可能已在设置中删除）' })
    return Promise.resolve()
  }
  if (!card) {
    rt(pid, { status: 'error', error: '未找到该参与者的角色卡（可能已删除）' })
    return Promise.resolve()
  }

  // 同一参与者旧任务先中止
  inflight.get(pid)?.abort()
  const ac = new AbortController()
  inflight.set(pid, ac)

  const messages = buildParticipantMessages(card, st.roleChatSceneSetting, st.roleChatMessages, participant)

  rt(pid, {
    status: 'streaming',
    streamingText: '',
    streamingReasoning: '',
    error: undefined,
    debug: {
      previewBody: {
        model: node.model,
        messages,
        stream: true,
      },
      actualBody: null,
      sseChunks: [],
    },
  })

  let fullText = ''
  let fullReasoning = ''

  return new Promise<void>((resolve) => {
    streamChat(
      { baseURL: node.baseURL, apiKey: node.apiKey, model: node.model, messages, includeRaw: true },
      {
        reasoningDelta: (d) => {
          fullReasoning += d
          rt(pid, { streamingReasoning: fullReasoning })
        },
        delta: (d) => {
          fullText += d
          rt(pid, { streamingText: fullText })
        },
        requestBody: (body) => {
          rt(pid, { debug: { ...curDebug(pid), actualBody: body as object } })
        },
        rawChunk: (raw) => {
          const cur = curDebug(pid)
          rt(pid, { debug: { ...cur, sseChunks: [...cur.sseChunks, raw] } })
        },
        done: (finalText) => {
          const msg: RoleChatMessage = {
            id: genId('rcmsg'),
            participantId: pid,
            participantName: participant.name,
            content: finalText,
            timestamp: Date.now(),
          }
          useAppStore.setState((s) => ({ roleChatMessages: [...s.roleChatMessages, msg] }))
          // status=done；保留 streamingReasoning 供底部推理面板折叠展示，清空在途正文。
          rt(pid, { status: 'done', streamingText: '' })
          inflight.delete(pid)
          resolve()
        },
        error: (err) => {
          rt(pid, { status: 'error', error: err })
          inflight.delete(pid)
          resolve()
        },
      },
      ac.signal,
    ).catch((e) => {
      if (ac.signal.aborted) {
        rt(pid, { status: 'idle' })
        inflight.delete(pid)
        return resolve()
      }
      rt(pid, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      inflight.delete(pid)
      resolve()
    })
  })
}
