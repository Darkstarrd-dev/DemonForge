// 创作类端点 · barrel（B-8 拆分收口）。
// 原 731 行单文件按领域拆为三块：起源（origin）/ 生成（generate, 含 M3 推演）/ M2 设定库。
// 共享 helper（stripJsonFence/collectText/streamChat）落 creation.shared.ts。
// 对外契约不变：index.ts 仍 `import { creationRoutes }` 并 `app.register(creationRoutes)`。
import type { FastifyInstance } from 'fastify'
import { originRoutes } from './creation.origin'
import { generateRoutes } from './creation.generate'
import { m2Routes } from './creation.m2'

export async function creationRoutes(app: FastifyInstance) {
  await app.register(originRoutes)
  await app.register(generateRoutes)
  await app.register(m2Routes)
}
