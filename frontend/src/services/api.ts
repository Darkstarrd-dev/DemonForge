// 统一服务入口：页面只从这里调用。
// M1 清理（startCleanQueue）与 Provider 连通性测试（testProvider）已接真实后端（services/real）；
// M2–M5 仍为 mock（services/mock）。接入后端时进一步替换 mock 项，页面零改动。
export {
  aiSplitChapter,
  extractEntities,
  simulateCharacter,
  generateChapterDraft,
  checkConsistency,
} from './mock/impl'

export { testProvider, startCleanQueue } from './real/llm'
export type { CleanQueueCallbacks, CleanQueueHandle, CleanNode, TestResult } from './real/llm'
