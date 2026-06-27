// 统一服务入口：页面只从这里调用。
// M1 清理（startCleanQueue）、Provider 连通性测试（testProvider）、M0 起源（generateArch/generateBlueprint）已接真实后端；
// M2 提取（extractEntities）已接真实后端（services/real/extract）；
// M3 推演（simulateCharacter）已接真实后端（services/real/simulate）。
// M1 切分（aiSplitChapter）、M4 单章生成（generateChapterDraft）、M5 单章审校（checkConsistency）当前仍走 mock（services/mock）；
// M4/M5 的 real 实现（generateDraft/finalizeChapter/checkConsistency in services/real/generation）目前仅由批量生产 batch.ts 直接调用，不经本入口转出。
export {
  aiSplitChapter,
  generateChapterDraft, // 保留 mock 版本，M4 页面改造时再切换
  checkConsistency, // 暂时保留 mock 版本（包含本地死亡角色规则），阶段 C 完成后再整合真实 LLM 审校
} from './mock/impl'

export { testProvider, startCleanQueue, streamSingleChapter, getDefaultPrompt } from './real/llm'
export type { CleanQueueCallbacks, CleanQueueHandle, CleanNode, TestResult, CleanQueueDebugEvent } from './real/llm'

// M2 提取已接真实后端（services/real/extract）。
export { extractEntities } from './real/extract'
export type { ExtractProgress, ExtractResult } from './real/extract'

// M0 起源流程已接真实后端（services/real/creation）。
export { generateArch, generateBlueprint, generateArchInput } from './real/creation'
export type { ArchParams, ArchInputParams, ArchInputResult, BlueprintParams, CreationProvider } from './real/creation'

// M3 推演已接真实后端（services/real/simulate）。
export { simulateCharacter } from './real/simulate'

// M4/M5 生成与管理的 real 实现见 services/real/generation，由批量生产 batch.ts 直接 import 调用（绕过本入口），
// 故此处不再转出 generateDraft/finalizeChapter/checkConsistency 及其类型；单章 M4/M5 页面当前仍用上方 mock 版本。

// 批量生成（阶段 D）已接真实后端。
export { startBatchGenerate } from './real/batch'
export type { BatchGenTask, BatchGenNode, BatchGenCallbacks, BatchGenHandle } from './real/batch'

// 文生图（文生图 Demo）已接真实后端（ModelScope 异步任务流）。
export { generateImage } from './real/image'
export type { ImageGenParams, ImageGenEvents } from './real/image'

// GPT Image 生图（OpenAI Images API 同步协议）。
export { generateImageGpt } from './real/gptImage'
export type { GptImageParams, GptImageDone, GptImageEvents as GptImageGptEvents, GptImageDebug } from './real/gptImage'

// xAI Imagine 生图（xAI Images API 同步协议）。
export { generateImageXai } from './real/xaiImage'
export type { XaiImageParams, XaiImageDone, XaiImageEvents, XaiImageDebug } from './real/xaiImage'

// 通用对话（文本推理 + 多模态理解）已接真实后端。
export { streamChat, generateTitle } from './real/chat'
export type { ChatMessage, ChatParams, ChatEvents } from './real/chat'

// 节点测试 · 多 session 推理引擎（每 session 独立运行态，切走仍继续）。
export { sendInSession, cancelSession, isSessionRunning } from './sessionEngine'
export type { SendArgs } from './sessionEngine'

// M2 设定卡片 · AI 生成（卡片 + 批量生图提示词）。
export { generateCard, generateCardImagePrompts, serializeCardForEnrich } from './real/cardGen'
export type { GenerateCardArgs, GeneratedCard, ImagePromptItem, CardImagePromptsArgs } from './real/cardGen'

// M2 设定卡片 · 批量生图（三协议派发 + 并发池）。
export { generateOneCardImage, runImageBatch } from './real/cardImage'
export type { CardImageParams, BatchItemStatus, BatchItemUpdate } from './real/cardImage'
