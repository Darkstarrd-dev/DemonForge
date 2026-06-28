import type { FastifyReply } from 'fastify'

/**
 * 共享 SSE hijack 工具——统一注入 CORS 头，解决 reply.hijack() 绕过 @fastify/cors 插件的问题。
 * 返回 { raw, send, ac }，用法与原手动 hijack 样板完全一致。
 */
// 与 index.ts 主 CORS 白名单保持一致——hijackSSE 经 reply.hijack() 绕过 @fastify/cors 的
// onSend 注入，需在此自行回显 ACAO。放行：开发服务器、file:// 的 'null'、无 Origin（同源/非浏览器）。
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

export function hijackSSE(reply: FastifyReply) {
  reply.hijack()
  const raw = reply.raw
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Credentials': 'true',
  }
  // 回显白名单内的 Origin（含 file:// 的 'null'），替代原硬编码 localhost:5173——
  // 改端口或非 Electron 环境下硬编码会令浏览器拒收 SSE。无 Origin / 白名单外则不设 ACAO。
  const origin = reply.request.headers.origin
  if (origin && (origin === 'null' || ALLOWED_ORIGINS.has(origin))) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  raw.writeHead(200, headers)
  const send = (event: string, data: unknown) => {
    raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  const ac = new AbortController()
  raw.on('close', () => ac.abort())
  return { raw, send, ac }
}
