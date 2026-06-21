import { readFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { chatStream } from '../llmClient'
import { getDb } from '../store/db'

interface RoleChatBody {
  cardId: string
  nodeId: string
  conversationHistory: Array<{
    participantName: string
    content: string
    isUser?: boolean
  }>
}

export async function chatRoutes(app: FastifyInstance) {
  // 本地模式：角色对话（SSE 流式）
  app.post('/api/chat/role', async (req, reply) => {
    const { cardId, nodeId, conversationHistory } = (req.body ?? {}) as RoleChatBody

    if (!cardId || !nodeId || !Array.isArray(conversationHistory)) {
      reply.status(400).send({ error: '缺少 cardId / nodeId / conversationHistory' })
      return
    }

    // 从资产库读取 EntityCard
    const db = getDb()
    let card: any
    try {
      const row = db.prepare('SELECT data FROM cards WHERE id = ?').get(cardId) as { data: string } | undefined
      if (!row) {
        reply.status(404).send({ error: `角色卡 ${cardId} 不存在` })
        return
      }
      card = JSON.parse(row.data)
    } catch (e) {
      reply.status(500).send({ error: `读取角色卡失败: ${e instanceof Error ? e.message : String(e)}` })
      return
    }

    // 从 settings.json 读取 ProviderNode
    const settingsPath = new URL('../data/settings.json', import.meta.url).pathname
    let provider: any
    try {
      const settingsText = readFileSync(settingsPath, 'utf-8')
      const settings = JSON.parse(settingsText)
      provider = settings.providers?.find((p: any) => p.id === nodeId)
      if (!provider) {
        reply.status(404).send({ error: `节点 ${nodeId} 不存在` })
        return
      }
    } catch (e) {
      reply.status(500).send({ error: `读取节点配置失败: ${e instanceof Error ? e.message : String(e)}` })
      return
    }

    // 构建 System Prompt
    const systemPrompt = `你是 ${card.name}。

角色设定：
${card.description || '（无设定描述）'}

${card.styleNote ? `语言风格：\n${card.styleNote}\n` : ''}
${card.styleExamples?.length ? `台词例句：\n${card.styleExamples.join('\n')}\n` : ''}
请严格按照角色设定和语言风格回复，不要跳出角色。`

    // 将对话历史转换为 OpenAI 格式
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    for (const msg of conversationHistory) {
      // 用户消息 or 其他 Agent 的消息都视为 user（当前角色回复它们）
      if (msg.isUser || msg.participantName !== card.name) {
        messages.push({ role: 'user', content: `[${msg.participantName}]: ${msg.content}` })
      } else {
        // 当前角色自己的历史消息
        messages.push({ role: 'assistant', content: msg.content })
      }
    }

    // SSE 流式返回
    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    const send = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const ac = new AbortController()
    raw.on('close', () => ac.abort())

    chatStream(
      {
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        model: provider.model,
        messages,
        signal: ac.signal,
      },
      (delta) => send('delta', { delta }),
    )
      .then((full) => {
        if (full.trim().length < 5) {
          send('error', { message: `角色回复过短（${full.trim().length} 字符），判为失败` })
        } else {
          send('done', { text: full })
        }
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        send('error', { message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => raw.end())
  })
}
