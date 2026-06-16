// 统一服务入口：页面只从这里调用。
// M1 清理（startCleanQueue）、Provider 连通性测试（testProvider）、M0 起源（generateArch/generateBlueprint）
// 已接真实后端（services/real）；M2–M5 仍为 mock（services/mock）。接入后端时进一步替换 mock 项，页面零改动。
export {
  aiSplitChapter,
  extractEntities,
  simulateCharacter,
  generateChapterDraft,
  checkConsistency,
} from './mock/impl'

export { testProvider, startCleanQueue, getDefaultPrompt } from './real/llm'
export type { CleanQueueCallbacks, CleanQueueHandle, CleanNode, TestResult, CleanQueueDebugEvent } from './real/llm'

// M0 起源流程已接真实后端（services/real/creation）。
export { generateArch, generateBlueprint } from './real/creation'
export type { ArchParams, BlueprintParams, CreationProvider } from './real/creation'
