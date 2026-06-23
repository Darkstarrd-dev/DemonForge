import type { FastifyReply } from 'fastify'

/**
 * 共享 SSE hijack 工具——统一注入 CORS 头，解决 reply.hijack() 绕过 @fastify/cors 插件的问题。
 * 返回 { raw, send, ac }，用法与原手动 hijack 样板完全一致。
 */
export function hijackSSE(reply: FastifyReply) {
  reply.hijack()
  const raw = reply.raw
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    'Access-Control-Allow-Credentials': 'true',
  })
  const send = (event: string, data: unknown) => {
    raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  const ac = new AbortController()
  raw.on('close', () => ac.abort())
  return { raw, send, ac }
}
