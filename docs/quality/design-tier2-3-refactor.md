# 第二、三梯队重构设计稿

> 关联审核：`docs/quality/logs/2026-06-27-audit-01.md`（行动项 A-5 ~ A-9）
> 状态：设计稿（待评审 → 实施）　|　建立日期：2026-06-27　|　基线 commit：`d58883c`

## 总则（所有项共用）

1. **对外契约不变**：每项重构后，调用方（页面/services 入口）零改动或仅改 import 路径。
2. **测试先行（characterization test）**：动结构前，先对现有行为写"刻画测试"锁住现状，重构中保持全绿——尤其 A-6 调度器、A-7 持久化这类竞态敏感逻辑。
3. **每项独立可提交、可回滚**：一项一 PR，互不阻塞。
4. **每步验收**：`tsc -b` 0 错误 + `vitest run` 全绿 + 关联模块手测。

**建议实施顺序**：A-5 →（A-6 / A-9 并行）→ A-7 → A-8。A-5 收益最大且最独立，先做；A-7 是大手术，需独立排期。

---

# 第二梯队

## A-5　统一 SSE 解析层 `services/sse.ts`

### 现状问题
前端 9 个 `real/*.ts` 各写一份 SSE 解析，且**实现不一致**：
- `llm.ts:168-205` 按 `\n\n` 标准帧分割，帧内多 `data:` 行拼接（SSE 规范做法）。
- `chat.ts:81-119` 按 `\n` 单行分割，**假设 `event:` 与 `data:` 严格相邻单行** → 上游若插入注释行、心跳、多行 `data:` 会**漏解析**（潜在 bug，非仅重复）。
- 各文件 `JSON.parse(data)` 多数无保护（`llm.ts:185`），坏帧抛到外层 catch。

### 目标结构
```
services/
  sse.ts            # 新增：纯传输层，标准 SSE 帧解析
  sse.test.ts       # 新增：喂构造字节流验证分帧/多行 data/坏帧容错
  real/*.ts         # 改：删手写 reader 循环，改用 for-await 消费 parseSSE
```

### 关键接口（示意）
```ts
// services/sse.ts —— 只负责"字节流 → 结构化事件"，不含任何业务语义
export interface SseEvent { event: string; data: unknown }

export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += value ? decoder.decode(value, { stream: !done }) : ''
      const frames = buffer.split('\n\n')      // 标准帧分隔
      buffer = frames.pop() ?? ''
      for (const f of frames) {
        const evt = parseFrame(f)              // 帧内：event: 取最后一个，data: 多行拼接
        if (evt) yield evt
      }
      if (done) break
    }
  } finally {
    reader.releaseLock()                       // 防止流未释放
  }
}

// 帧内解析：event 缺省 'message'，data 多行用 '\n' 连接，JSON.parse 失败兜底为原始字符串
function parseFrame(frame: string): SseEvent | null { /* … */ }
```

业务侧（以 `chat.ts` 为例）收缩为：
```ts
for await (const { event, data } of parseSSE(res.body, signal)) {
  switch (event) {
    case 'delta':           events.delta((data as any).delta); break
    case 'reasoning-delta': events.reasoningDelta?.((data as any).delta); break
    case 'raw':             events.rawChunk?.(data as any); break
    case 'request-body':    events.requestBody?.(data); break
    case 'done':            events.done((data as any).text); return
    case 'error':           events.error((data as any).message); return
  }
}
```
> `parseSSE` 只管传输；各模块的 event 类型差异（chat 的 6 种 vs llm 的 3 种）、llm 的 `CHAPTER_SEP` 批量拆分都留在业务层，不下沉。

### 迁移步骤
1. 写 `sse.ts` + `sse.test.ts`（构造含多行 data、注释行、坏 JSON 帧的字节流断言）。
2. 逐个迁移，**每个独立提交**：`chat → llm（含 streamSingleChapter/streamBatch 两处）→ image → gptImage → xaiImage → simulate → extract → creation → roleChat`。
3. 每迁一个，跑对应模块手测（节点测试发消息 / M1 清理 / 生图）。

### 风险与回滚
- **风险**：`chat.ts` 旧的"相邻行"解析比标准帧更宽松地容错某些非常规上游 → 迁到标准帧后行为更正确，但需对实际在用的模型节点回归一次。
- **回滚**：每个文件独立提交，单文件 revert 即可。

### 验收
- 9 个 `real/*.ts` 不再出现 `getReader()` / 手写 `split('\n\n')`。
- `sse.test.ts` 覆盖多行 data、坏帧容错、提前 abort。
- 节点测试、M1 清理、三协议生图行为不变。

---

## A-6　调度器类化 `CleanScheduler`

### 现状问题
`llm.ts:392-744` 的 `startCleanQueue` 是 350 行巨型闭包：10+ 闭包状态（`pendingQueue/retryQueue/failCounts/activeBatches/nodeOverrides/disabledNodes/nodeConsecFails/chapterAvoidNodes/workerBatchSeq/spawnedSlots`）+ 全部调度逻辑内联。最该测的逻辑（重试预算、熔断阈值、batch 部分成功）无法单测。

### 目标结构
```
services/cleanScheduler/
  CleanScheduler.ts     # 类：状态=字段，逻辑=方法
  NodeCircuitBreaker.ts # 熔断独立（连续失败计数/阈值/恢复）
  dequeue.ts            # 纯函数：按字数累积组 batch（最易测，先抽）
  types.ts              # CleanNode/Callbacks/Handle/Task（从 llm.ts 迁出）
  index.ts              # export startCleanQueue = (...) => new CleanScheduler(...).start()
```
`llm.ts` 仅保留 `streamSingleChapter/streamBatch`（流式传输）与 `testProvider/getDefaultPrompt`；`api.ts` 的 `startCleanQueue` 导出改为从 `cleanScheduler` 转出，**调用方（Step3Clean / book-reader）零改动**。

### 类骨架（示意）
```ts
export class CleanScheduler {
  private pending: ChapterTask[]
  private retry: ChapterTask[] = []
  private readonly failCounts = new Map<string, number>()
  private readonly breaker: NodeCircuitBreaker
  private readonly avoid = new Map<string, Set<string>>()
  // …

  constructor(
    private chapters: ChapterTask[],
    private nodes: CleanNode[],
    private cb: CleanQueueCallbacks,
    private opts: CleanQueueOpts = {},
  ) { /* init breaker、pending = [...chapters] */ }

  start(): CleanQueueHandle {
    this.spawnWorkers()
    return {
      pause: () => { this.paused = true },
      resume: () => { this.paused = false },
      stop: () => this.stopAll(),
      updateNodes: (n) => this.hotUpdateNodes(n),
      switchBatchNode: (b, n) => this.switchBatchNode(b, n),
    }
  }

  private dequeueBatch(maxChars: number): ChapterTask[] { /* 调 dequeue.ts 纯函数 */ }
  private async executeBatch(batch, node, workerId) { /* … */ }
  private async workerLoop(node, slot) { /* … */ }
}
```

### 迁移步骤
1. **先建测试网（characterization）**：对现有 `startCleanQueue` 黑盒测 4 场景——① 单节点串行全成功；② 多节点并发分配；③ 节点失败 → 重试到其他节点；④ 连续失败 → 熔断 + 章节回流。用 mock 的 `streamSingleChapter`（注入假流）。
2. 抽纯函数 `dequeueBatch` → `dequeue.ts` + 单测（边界：首章超 maxChars、retry 优先、字数累积停止）。
3. 抽 `NodeCircuitBreaker` + 单测（阈值触发、成功归零、手动恢复）。
4. 整体类化，保持步骤 1 的测试全绿。

### 风险与回滚
- **风险**：worker 并发/`active` 计数/`maybeFinish` 时序微妙，纯靠肉眼易引入竞态。**必须**先有步骤 1 的测试网才动。
- **回滚**：保留 `llm.ts` 旧实现到迁移验证通过后再删；`api.ts` 一行切换导出即可回退。

### 验收
- `dequeueBatch`、熔断、重试预算各有单测。
- Step3 清理（含暂停/停止/热更新节点/模型切换）行为不变。

---

# 第三梯队

## A-7　`appStore` 切片化 + 持久化抽离

### 现状问题
`appStore.ts` 1152 行：状态定义 + 30 个 action + 三套持久化引擎（business/settings/importSession，各含 debounce 订阅 + `pushXxxNow` + flush）+ `bootstrapStore` 引导 + 向后兼容迁移。订阅里 13 项手写 `s.xxx === prev.xxx` 脏检查（`:885-905, :1004-1027`），新增字段需多处手工同步。

### 目标结构
```
store/
  slices/
    booksSlice.ts      # books/chapters/cards/outline/scenes/fragments/stateEvents/issues/architectures/mergeCandidates + deleteBook
    nodeTestSlice.ts   # testHistory/chatSessions/sessionRuntimes/systemPrompt* + 相关 action
    m1ImportSlice.ts   # importSession/cleanRun/cleanNodeOverrides/splitPatterns/m1*
    roleChatSlice.ts   # roleChat*
    providerSlice.ts   # providers/moduleMapping/consumeProviderUsage
    uiPrefsSlice.ts    # theme/enable4KScale/scaleBaseWidth/showMenuBar/nodeGroupExpanded/sidebarMode
  persistence.ts       # 注册式持久化引擎（selector → endpoint），取代手写脏检查
  bootstrap.ts         # bootstrapStore + 向后兼容迁移（从 store 主体剥离）
  index.ts             # create() 组合所有 slice
```

### 关键改造点
```ts
// store/persistence.ts —— 用 selector 声明式注册，告别 13 项手写比较
registerPersister(useAppStore, businessSelector,  '/api/store',          { debounce: 1000, serialize })
registerPersister(useAppStore, settingsSelector,  '/api/settings',       { debounce: 1000 })
registerPersister(useAppStore, importSessionSel,  '/api/import-session', { debounce: dynamicByCleanRun })

// 每个 slice：
export const createBooksSlice: StateCreator<AppState, [], [], BooksSlice> = (set, get) => ({
  books: [], chapters: [], /* … */
  deleteBook: (id) => { /* 迁移现有级联逻辑 */ },
})
```
> 向后兼容字段别名（`imageGallery`/`imageDemoForm*`）在对应 slice 内保留 getter，对外行为不变。

### 迁移步骤（分两阶段，降低风险）
1. **阶段 1 — 只抽持久化，不动状态结构**：把三套订阅/`pushXxxNow`/`flush`/`bootstrap` 搬到 `persistence.ts` + `bootstrap.ts`，`appStore.ts` 仅 import 调用。先为持久化写单测（脏检查命中、debounce、串行队列 enqueueWrite 顺序）。验收：行为完全不变。
2. **阶段 2 — 切 slice**：按域逐个抽 slice，每抽一个 `tsc -b` + 手测对应模块。

### 风险与回滚
- **风险**：持久化的 `storeReady` 时序、`enqueueWrite` 串行、`bootstrapStore` 的"空库不回填种子"逻辑（`:801-833`）极易在搬迁中破坏 → 阶段 1 必须有单测护住。
- **回滚**：两阶段各自独立提交；阶段 1 不改状态结构，回滚无数据风险。

### 验收
- `appStore.ts`（或 `store/index.ts`）< 200 行，仅组合。
- 新增一个业务字段只需改对应 slice + selector 一处。
- 持久化/引导/删除级联行为不变（含"删光不复活""空库不回种"既有契约）。

---

## A-8　`node-test`/`settings` 组件拆分 + 建立 `hooks/` 层

### 现状问题
`node-test/index.tsx` 2355 行 / **39 处 hooks**（已拆出 HistoryList/DebugInfoPanel/SystemPromptEditor/SessionSidebar/ResultImage，但主逻辑仍在）；`settings/index.tsx` 1868 行 / 24 hooks，承担 8+ 类配置职责；项目**无 `hooks/` 公共层**。

### 目标结构
```
frontend/src/hooks/                 # 新建公共自定义 hook 层
node-test/
  hooks/useInferenceSession.ts      # 推理收发 + sessionEngine 桥接（消化最多 useState/useEffect）
  hooks/useNodeTestForm.ts          # 表单草稿 + per-node 参数读写
  panels/TextParamsPanel.tsx        # temperature/topP/maxTokens
  panels/ImageParamsPanel.tsx       # 三协议参数分支（modelscope/gpt/xai）
  ChatTranscript.tsx                # 消息流渲染
  index.tsx                         # 仅布局编排（目标 < 300 行）
settings/
  panels/NodePoolPanel.tsx / ModuleMappingPanel.tsx / SplitRulePanel.tsx /
  TitleTemplatePanel.tsx / SystemPromptPanel.tsx / GeneralPanel.tsx
  index.tsx                         # 仅 Tabs/Collapse 容器
```

### 迁移步骤
1. **接续已有进度**：先读 `docs/node_test_refactor_progress.md` 对齐已完成部分，避免重复。
2. node-test：先抽 `hooks/`（把成组的 `useState/useEffect` 迁入 custom hook，组件只调用），再抽 `panels/`。
3. settings：按职责逐块抽 `panels/`，`index` 收为容器。
4. 每抽一块 `tsc -b` + 手测该面板。

### 风险与回滚
- **风险**：hook 抽离需保持与 `sessionEngine`、`appStore` 运行态订阅的桥接不变；StrictMode 双调用下副作用要幂等。建议引入 React Testing Library 做冒烟测试（项目目前 vitest 仅 node 环境，需加 jsdom 环境配置）。
- **回滚**：组件级拆分，逐块提交可回退。

### 验收
- `index.tsx` < 300 行；任一组件 hooks < 10。
- 节点测试多 session 并行、切走继续、Debug Info、System Prompt 行为不变。

---

## A-9　服务层 mock 收口

### 现状问题
`api.ts:7-33` mock/real 混杂导出：`checkConsistency`(mock) 与 `checkConsistencyReal`(real) 靠重命名并存、`generateChapterDraft`/`aiSplitChapter` 仍 mock，调用方靠记忆区分。

### 目标结构与步骤
1. **盘点**：grep 各 mock 导出的调用方，确认哪些页面仍依赖（重点 `generateChapterDraft` 是否已被 M4 的 `generateDraft` 取代 → 若是则属死代码可删；`checkConsistency` 的"本地死亡角色规则"是否还需保留）。
2. **收口**：
   - 已被 real 取代的 mock → 删除，统一用 real 名（去掉 `Real` 后缀歧义）。
   - 仍需 mock 的（若有）→ 定义统一 `interface`，mock/real 作为同一契约的两个实现，由开关选择，而非两个可见函数名。
3. **验收**：`api.ts` 无 `xxx`/`xxxReal` 并存；调用方无需区分 mock/real。

### 风险
- `generateChapterDraft`/`checkConsistency` 可能仍被某些页面引用 → 删除前必须 grep 确认，避免断引用。属低风险但需先盘点。

---

## 附：跨项通用准备

- **测试环境扩展**：A-8 需要组件测试 → 届时为 vitest 增加 `jsdom` 环境（当前为纯 node）；可在 `vite.config.ts` 用 `test.environmentMatchGlobs` 或单独 project 区分 node/jsdom。
- **纪律固化**：A-5/A-6 完成后，把"必须监听 reply.raw 断连""syncAll 永不删除"等关键注释对应的行为补成断言。
- **进度回填**：每完成一项，更新 `logs/2026-06-27-audit-01.md` 第 5 节追踪表的状态与 commit。
