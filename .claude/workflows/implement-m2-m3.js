export const meta = {
  name: 'implement-m2-m3',
  description: 'M2 设定提取 + M3 角色推演真实 LLM 接入',
  phases: [
    { title: '后端实现', detail: 'M2/M3 端点 + Prompt + Context Assembler' },
    { title: '前端实现', detail: 'M2/M3 服务层 + UI 集成' },
    { title: '验证', detail: '编译检查 + 类型检查' },
  ],
}

phase('后端实现')

// 并行实现 M2 和 M3 的后端部分
const backendResults = await parallel([
  // M2 后端实现
  () => agent(`实现 M2 设定提取后端：

1. 在 server/src/prompts.ts 添加 EXTRACT_ENTITIES_SYSTEM_PROMPT
   - 五类实体：character/location/item/skill/faction
   - 输出格式：JSON 数组，含 type/name/description/fields/excerpt
   - 明确要求不要 \`\`\`json\`\`\` 标记

2. 在 server/src/routes/creation.ts 添加 POST /api/llm/extract-entities 端点
   - 输入：baseURL/apiKey/model/bookId/chapterIds/existingCardNames
   - 流程：
     a. 从 chapters 表读取章节内容
     b. 并行调用 chatStream（每章一次），使用 EXTRACT_ENTITIES_SYSTEM_PROMPT
     c. 解析 JSON 输出，按 (type, name) 合并出处引用
     d. 对每张卡片调用 embed() 生成向量
     e. 计算两两余弦相似度，≥0.85 生成 MergeCandidate
   - 输出：SSE 流式（progress/entity/done/error 事件）
   - 复用 streamChat 辅助函数模式

3. 类型定义检查
   - 确认 EntityCard/MergeCandidate 类型存在
   - 确认 llmClient.embed() 函数可用

参考现有端点：/api/llm/draft、/api/llm/finalize 的实现模式`, {
    label: 'M2 后端',
    phase: '后端实现',
  }),

  // M3 后端实现
  () => agent(`实现 M3 角色推演后端：

1. 在 server/src/prompts.ts 添加 SIMULATE_CHARACTER_SYSTEM_PROMPT
   - 角色一致性：遵循 styleNote/styleExamples
   - 场景适配：考虑在场角色、场景目标、前情摘要
   - 输出格式：200-400 字推演片段，不要 markdown 标记

2. 扩展 server/src/contextAssembler.ts
   - 输入新增 sceneId?: string 参数
   - 若提供 sceneId，从 scenes 表查询 SimScene
   - 从 fragments 表查询该场景的已采纳片段（按 order 排序）
   - 输出新增 scene?: SimScene 和 sceneFragments: string[]

3. 在 server/src/routes/creation.ts 添加 POST /api/llm/simulate 端点
   - 输入：baseURL/apiKey/model/scene/targetCharacterId/candidateCount/rag?
   - 流程：
     a. 调用 assembleContext({ bookId: scene.bookId, sceneId: scene.id, targetCharacterId, rag })
     b. 组装 user prompt（目标角色卡 + 场景描述 + 前情 + 在场角色 + RAG）
     c. 串行生成 candidateCount 个候选（默认 2）
     d. 每个候选调用 chatStream，使用 SIMULATE_CHARACTER_SYSTEM_PROMPT
   - 输出：SSE 流式（delta/candidate-done/done/error 事件）
   - 复用 streamChat 模式，但需支持多候选索引

参考现有端点：/api/llm/draft 的 Context Assembler 调用模式`, {
    label: 'M3 后端',
    phase: '后端实现',
  }),
])

log('后端实现完成，开始前端集成')

phase('前端实现')

// 并行实现 M2 和 M3 的前端部分
const frontendResults = await parallel([
  // M2 前端实现
  () => agent(`实现 M2 设定提取前端：

1. 创建 frontend/src/services/real/extract.ts
   - 导出 extractEntities 函数
   - 签名：(bookId, chapters, existingNames, onProgress?, signal?) => Promise<{cards, mergeCandidates}>
   - 从 settings 读取 provider 配置（baseURL/apiKey/model）
   - 调用 streamSSE('/api/llm/extract-entities', body, ...)
   - 监听 progress 事件 → 调用 onProgress 回调
   - 监听 done 事件 → 返回结果
   - 错误处理：捕获 error 事件，抛 Error

2. 修改 frontend/src/services/api.ts
   - 从 './real/extract' 导入 extractEntities
   - 替换原来从 './mock/impl' 的导入

3. 修改 frontend/src/pages/m2-cards/index.tsx
   - runExtract 函数中添加进度回调
   - 显示进度条（3 阶段：chunk/merge/embed）
   - 成功后：新卡片追加到 cards 数组，若有 mergeCandidates 自动跳转到合并裁决标签页
   - 失败时显示错误 toast

参考现有实现：services/real/creation.ts 的 streamSSE 基础设施`, {
    label: 'M2 前端',
    phase: '前端实现',
  }),

  // M3 前端实现
  () => agent(`实现 M3 角色推演前端：

1. 创建 frontend/src/services/real/simulate.ts
   - 导出 simulateCharacter 函数
   - 签名：(scene, card, onChunk, signal?) => Promise<{id, text}[]>
   - 从 settings 读取 provider 配置
   - 构建请求体：{ baseURL, apiKey, model, scene, targetCharacterId: card.id, candidateCount: 2 }
   - 调用 streamSSE，维护累积文本数组 accTexts[]
   - 监听 delta 事件 → 更新 accTexts[idx]，调用 onChunk(idx, accTexts[idx])
   - 监听 done 事件 → 返回 candidates
   - 错误处理：捕获 error 事件，抛 Error

2. 修改 frontend/src/services/api.ts
   - 从 './real/simulate' 导入 simulateCharacter
   - 替换原来从 './mock/impl' 的导入

3. 修改 frontend/src/pages/m3-simulate/index.tsx
   - run 函数中调用真实 simulateCharacter
   - 流式更新 candidates 状态（实时吐字）
   - 保持现有 UI 逻辑（两个 Tab + 采纳按钮）

参考现有实现：services/real/creation.ts 的 generateArch/generateBlueprint`, {
    label: 'M3 前端',
    phase: '前端实现',
  }),
])

log('前端实现完成，开始验证')

phase('验证')

// 编译检查
const verifyResult = await agent(`验证实现完整性：

1. 后端编译检查
   cd server && npx tsc --noEmit
   检查是否有类型错误

2. 前端编译检查
   cd frontend && npx tsc --noEmit
   检查是否有类型错误

3. 关键文件检查
   - server/src/prompts.ts 是否新增了两个 prompt
   - server/src/routes/creation.ts 是否新增了两个端点
   - server/src/contextAssembler.ts 是否扩展了 sceneId 支持
   - frontend/src/services/real/extract.ts 是否创建
   - frontend/src/services/real/simulate.ts 是否创建
   - frontend/src/services/api.ts 是否正确导出

4. 输出验证报告：
   - 编译状态（成功/失败 + 错误数量）
   - 文件清单（已创建/已修改）
   - 下一步建议（如需修复错误，列出修复方向）`, {
  label: '编译验证',
  phase: '验证',
})

return {
  backendResults,
  frontendResults,
  verifyResult,
  summary: 'M2/M3 LLM 接入实现完成',
}
