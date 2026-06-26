// 统一服务入口：页面只从这里调用。
// M1 清理（startCleanQueue）、Provider 连通性测试（testProvider）、M0 起源（generateArch/generateBlueprint）已接真实后端；
// M2 提取（extractEntities）已接真实后端（services/real/extract）；
// M3 推演（simulateCharacter）已接真实后端（services/real/simulate）；
// M4 生成（generateDraft）、M5 管理（finalizeChapter/checkConsistency）已接真实后端（services/real/generation）；
// M4 旧接口（generateChapterDraft）仍为 mock（services/mock）。
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

// M4/M5 生成与管理已接真实后端（services/real/generation）。
// generateDraft/finalizeChapter/checkConsistencyReal 为新接口，供 M4/M5 页面改造时使用。
export {
  generateDraft,
  finalizeChapter,
  checkConsistency as checkConsistencyReal, // 重命名以区分 mock 版本
} from './real/generation'
export type {
  DraftContext,
  DraftParams,
  FinalizeParams,
  FinalizeResult,
  ConsistencyParams,
  ConsistencyResult,
  ConsistencyIssueRaw,
} from './real/generation'

// 批量生成（阶段 D）已接真实后端。
export { startBatchGenerate } from './real/batch'
export type { BatchGenTask, BatchGenNode, BatchGenCallbacks, BatchGenHandle } from './real/batch'

// 文生图（文生图 Demo）已接真实后端（ModelScope 异步任务流）。
export { generateImage } from './real/image'
export type { ImageGenParams, ImageGenEvents } from './real/image'

// GPT Image 生图（OpenAI Images API 同步协议）。
export { generateImageGpt } from './real/gptImage'
export type { GptImageParams, GptImageDone, GptImageEvents as GptImageGptEvents, GptImageDebug } from './real/gptImage'

// 通用对话（文本推理 + 多模态理解）已接真实后端。
export { streamChat, generateTitle } from './real/chat'
export type { ChatMessage, ChatParams, ChatEvents } from './real/chat'
