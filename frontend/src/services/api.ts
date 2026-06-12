// 统一服务入口：页面只从这里调用。当前全部委托 mock 实现；
// 接入真实后端时，仅替换本文件的 re-export 指向（或改为 fetch 实现），页面零改动。
export {
  aiSplitChapter,
  startCleanQueue,
  extractEntities,
  simulateCharacter,
  generateChapterDraft,
  checkConsistency,
  testProvider,
} from './mock/impl'
export type { CleanQueueCallbacks, CleanQueueHandle } from './mock/impl'
