# 计划：将 novel-generator skill 结合进 novelhelper

## Context（为什么做这件事）

novelhelper 目前是一个**自底向上的辅助工具**：从已有 raw 文本出发（M1 清洗 → M2 设定提取 → M3 推演 → M4 生成 → M5 管理）。它假设用户手里已经有参考素材，缺三块原创长篇创作的关键能力：

1. **原创起源流程**——从一个点子推导出小说架构（雪花法）和章节蓝图。项目完全没有，M4 生成假设大纲已存在。
2. **长篇记忆**——滚动摘要（`global_summary`）在数据模型里没有承载字段，超出上下文窗口的剧情记忆无处安放。
3. **RAG 检索 + 批量生产**——DESIGN §5 规划了 sqlite-vec 但未实现；M4 无批量编排。

`C:\Users\Houpy\.config\opencode\skill\novel-generator` 这个 opencode skill 用**雪花法 + 三幕式 + 滚动摘要 + 角色状态追踪 + FAISS RAG + 批量草稿→定稿循环**实现了上述全部能力，并附带 8 个经过设计的创作 agent 提示词（位于 `Z:\Playground\.opencode\agents\novel-*.md`）。

**集成原则（关键判断）**：skill 是 **opencode subagent + Python CLI** 形态，与 novelhelper 的 web 应用形态、Provider 抽象、当前「subagent 暂停」约束都不兼容**直接调用**。因此「结合」= **把 skill 的创作方法论与 prompt 资产，内化为 novelhelper 的原生 web 功能**（后端 LLM 网关端点 + SQLite 数据模型 + 前端流程页），而非运行 skill 本身。skill 的 8 个 agent `.md` 是设计依据与 prompt 基底。

**预期结果**：novelhelper 具备 `架构设计 → 章节蓝图 → (单角色推演 / 整章草稿) → 定稿归档 → 一致性审校 → 批量生产` 的完整原创闭环，带 RAG 检索与滚动摘要长篇记忆；全程维持「AI 辅助而非代笔、每步产出皆候选待人审」的产品理念。

**用户已拍板的范围决策**：四块全做（起源 + M4/M5 真实化 + RAG + 批量）；RAG 走 **Node + sqlite-vec**（非 Python sidecar）；**增设可选「整章/批量」高速档**，与「单角色推演→人工编排」主流程并存，高速档产出仍进草稿待人工编辑。

---

## skill → novelhelper 完整映射

| skill 产物/agent | novelhelper 对应 | 落地动作 |
|---|---|---|
| `novel-arch`（雪花法：种子/角色动力学/世界观/三幕） | 无对应 | **新建** 架构数据模型 + 起源端点 + 起源页 |
| `Novel_architecture.txt` | 无统一文档 | **新增** `NovelArchitecture`（book 级实体） |
| `character_state.txt`（物品/能力/状态/关系/事件） | `StateEvent` 时间线 + `EntityCard` | 复用，无需新增（项目设计更结构化） |
| `novel-blueprint`（节奏曲线/悬念单元） | `OutlineNode`（字段薄） | **扩字段** + 蓝图生成端点 |
| `global_summary.txt`（滚动摘要） | 无字段 | **新增** book 级 `globalSummary` + chapter 级 `summary` |
| `novel-draft`（整章 3000 字 + RAG） | `generateChapterDraft`（M4，mock） | **真实化** + prompt 改造为「保留已采纳片段的串联器」+ 整章高速档 |
| `novel-finalize`（扩写/摘要/状态/入库） | M5 + StateEvent（mock） | **真实化** finalize 端点 |
| `novel-consistency`（逻辑审校） | `ConsistencyIssue`（mock，1 条真规则） | **真实化** consistency 端点 |
| `novel-batch`（草稿→定稿循环） | 无对应 | **新建** 批量编排（复用 M1 调度器思路） |
| `vector_store.py`（FAISS RAG） | sqlite-vec（DESIGN §5，未实现） | **新建** Node + sqlite-vec 检索层 |
| `novel-knowledge-import` | M2 素材导入 | 并入 RAG 入库流程 |
| `novel-role-library` / `asset_manager.py` | M2 `EntityCard` CRUD / `resetDemo` 种子 | 已有，无需新增 |

---

## 一、数据模型变更

### 1.1 类型（`frontend/src/services/types.ts`）

- **新增 `NovelArchitecture`**（book 级，一本一条）：
  ```ts
  interface NovelArchitecture {
    id: string; bookId: string
    seed: string                 // 核心种子（单句公式）
    characterDynamics: string    // 角色动力学（驱动力三角 + 关系网）
    worldBuilding: string        // 世界观（物理/社会/隐喻三维度）
    plotStructure: string        // 三幕式情节架构
    updatedAt: string
  }
  ```
- **`Book` 加** `globalSummary?: string`（滚动摘要，定稿时增量更新）。
- **`Chapter` 加** `summary?: string`（本章定稿摘要，喂给下一章生成）。
- **`OutlineNode` 扩节奏字段**（对齐 novel-blueprint 目录格式）：`positioning?`（本章定位）、`role?`（核心作用）、`suspenseDensity?`（悬念密度）、`foreshadow?`（伏笔操作）、`twistLevel?`（认知颠覆 1–5）。
- **新增 embedding 检索相关类型**：`EntityEmbedding` / chunk 元数据（见 §三）。

### 1.2 SQLite 资产库（`server/src/store/db.ts`）

- `ENTITIES` 数组**新增表**：`architecture`、`embeddings`（chunk 级）。`chapters` 行内 JSON 自动带上新增的 `summary` 字段（文档式存储无需迁移）；`books` 行内 JSON 带 `globalSummary`。
- embeddings 表不走 `(id, data)` 通用结构，需独立 schema（向量列），见 §三。

### 1.3 前端 store（`frontend/src/store/appStore.ts`）

- `AppState` 加 `architectures: NovelArchitecture[]`；`businessPayload()` 把它纳入 `/api/store` 同步集合（与现有 9 个业务切片同样的 debounce 回写机制）。

---

## 二、后端 LLM 网关端点（复用现有 SSE 骨架）

现有 `server/src/routes/llm.ts` 的 `/api/llm/clean` 已是成熟范式：`reply.hijack()` + SSE delta 转发 + `reply.raw` close 检测（注意已踩过的断连陷阱）+ 复用 `chatStream`（`llmClient.ts:57`）。**所有创作端点照此模式**，差异仅在 system prompt 与上下文组装。

### 2.1 Prompt 内化（`server/src/prompts.ts`）

把 5 个 agent 的工作流提示词整理为常量导出（去掉 opencode subagent/Python CLI 细节，保留方法论）：
- `ARCH_SYSTEM_PROMPT`（← novel-arch：雪花法四步 + character_state 格式）
- `BLUEPRINT_SYSTEM_PROMPT`（← novel-blueprint：节奏曲线 + 目录格式）
- `DRAFT_SYSTEM_PROMPT`（← novel-draft：写作原则；**改造**——novelhelper 主流程要求「保留已采纳的 M3 推演片段原文」，新增此约束）
- `FINALIZE_SYSTEM_PROMPT`（← novel-finalize：摘要 200–300 字 + 状态变更抽取）
- `CONSISTENCY_SYSTEM_PROMPT`（← novel-consistency：三维度交叉质询 + 报告格式）

### 2.2 新增端点（`server/src/routes/llm.ts` 或拆分新 route 文件）

| 端点 | 输入 | 输出 | prompt |
|---|---|---|---|
| `POST /api/llm/arch` | 主题/类型/章节数/梗概 | SSE 流式架构文本 | ARCH |
| `POST /api/llm/blueprint` | 架构文本 + 已有目录（续写） | SSE 流式章节目录 | BLUEPRINT |
| `POST /api/llm/draft` | 组装后的上下文（见 §四） | SSE 流式正文 | DRAFT |
| `POST /api/llm/finalize` | 章节正文 + 现有摘要/状态 | SSE：摘要 + 状态变更事件 | FINALIZE |
| `POST /api/llm/consistency` | 章节 + 架构/状态/摘要 | SSE：审校报告（解析为 `ConsistencyIssue[]`） | CONSISTENCY |

所有端点的 provider 走前端传入的 `{baseURL, apiKey, model}`（来自 `moduleMapping` 对应节点），与 clean 端点一致。

### 2.3 moduleMapping 扩展（`types.ts` 的 `ModuleKey`）

新增键：`m0Arch`、`m0Blueprint`、`m5Finalize`（`m4Generate`/`m5Check`/`m3Simulate`/`embedding` 已有，复用）。设置页「模块→模型映射」自动多出对应行（现有 UI 按 `ModuleKey` 遍历渲染）。

---

## 三、RAG 检索层（Node + sqlite-vec）

### 3.1 依赖与建表

- `server/package.json` 加 `sqlite-vec`（better-sqlite3 已在）。
- `db.ts` 加载 sqlite-vec 扩展（`sqliteVec.load(db)`），建虚拟表：
  ```sql
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
    embedding float[<dim>]
  );
  CREATE TABLE IF NOT EXISTS chunk_meta (
    rowid INTEGER PRIMARY KEY, source TEXT, chapterId TEXT, text TEXT
  );
  ```
  `<dim>` 由首次 embedding 返回长度确定（不同模型维度不同，存进 settings）。

### 3.2 embedding 端点

- 把现有占位 `POST /api/llm/embed`（`llm.ts:71`，当前 501）**实现**：调用 provider `/v1/embeddings`（`llmClient.ts` 加 `embed()` 函数，复用 `normalizeBase`/`authHeaders`）。
- embedding provider 走 `moduleMapping.embedding` 节点。

### 3.3 入库与检索（`server/src/store/vector.ts`，新建）

- `addToVectorStore(texts, meta)`：参照 `vector_store.py` 的 `RecursiveCharacterTextSplitter`（chunk 3000 / overlap 500，分隔符 `\n\n \n 。！？`）——用 JS 实现等价分块 → 批量 embed → 写 `vec_chunks` + `chunk_meta`。
- `queryVectorStore(queryText, k)`：embed query → `vec_chunks` KNN（`vec_distance_cosine` / `MATCH`）→ join `chunk_meta` 返回 top-k 文本。
- 路由：`POST /api/store/vector/add`、`POST /api/store/vector/query`。

### 3.4 接入点

- **M2 设定提取真实化时**：章节/素材入库走 `vector/add`（取代 `novel-knowledge-import`）。
- **draft/推演上下文组装**：调 `vector/query` 召回相关设定（见 §四）。

---

## 四、上下文组装器（Context Assembler，核心复用组件）

DESIGN §4 已点名这是 **M3/M4/M5 共用核心组件**；skill 的 `novel-draft` Phase 1（读架构 + 蓝图 + 摘要 + 状态 + 前章结尾 + RAG 检索）本质就是它。

- **新建 `server/src/contextAssembler.ts`**：给定 `{bookId, chapterIndex/sceneId, targetCharacterId?}`，组装：
  1. 架构（`NovelArchitecture`，静态长时记忆）
  2. 本章 + 下章蓝图（`OutlineNode`，承上启下）
  3. 滚动摘要（`Book.globalSummary`）+ 前章 `summary`
  4. 角色当前状态（由 `StateEvent` 时间线推导「当前态」而非初始设定——对齐 DESIGN §4 M5 静态/动态分离）
  5. RAG 召回（`vector/query`，关键词由 LLM 或调用方给）
  6. M4 专用：已采纳的 M3 推演片段（`SimFragment.adoptedText`，硬约束）
- `draft`/`finalize`/`consistency`/`simulate` 端点统一调它，避免上下文逻辑分散。

---

## 五、前端流程层

### 5.1 新模块「M0 立项 / 架构」（新页 `frontend/src/pages/m0-architecture/`）

- 交互式输入主题/类型/章节数/梗概 → 调 `/api/llm/arch` 流式生成架构（四步分区展示）→ 人工编辑采纳 → 存 `NovelArchitecture`。
- 架构采纳后「一键生成蓝图」→ `/api/llm/blueprint` 流式 → 写入 `OutlineNode[]`（分块续写，对齐 blueprint 的 20 章/块策略）。
- 架构中的角色动力学/世界观可**一键导出为 M2 `EntityCard` 候选**（人物/地点等），打通起源 → 设定库。
- 侧边栏路由加该页（`frontend/src/main.tsx` 路由表 + `AppLayout` 菜单）。

### 5.2 M4 章节生成真实化（`frontend/src/services/api.ts` 切 real）

- `generateChapterDraft` 从 mock 切到调 `/api/llm/draft`（复用 `real/llm.ts` 的 SSE 解析骨架）。
- **两种模式并存**：
  - **主流程（人审）**：M3 推演片段 → M4 串联器（DRAFT prompt 带「保留片段原文」约束）。
  - **高速档（整章）**：跳过 M3，直接由 Context Assembler 喂架构+蓝图+摘要 → 整章生成。产出**仍进草稿状态**（`ChapterStatus='draft'`）待人工编辑，不自动定稿。

### 5.3 M5 真实化（finalize + consistency）

- `checkConsistency` 切 `/api/llm/consistency`，解析报告为 `ConsistencyIssue[]`（保留现有「已死角色出场」本地真规则作为确定性兜底，与 LLM 结果合并）。
- 新增「定稿」动作 → `/api/llm/finalize`：生成本章 `summary`、增量更新 `Book.globalSummary`、抽取 `StateEvent`、章节正文入 RAG 库。全部产出人工确认后落库。

### 5.4 批量生产编排（高速档）

- **复用 `real/llm.ts:360` 的 `startCleanQueue` 中央调度器思路**（多节点/并发/重试/热调），改造为 `startBatchGenerate`：任务 = 章节，每章 `draft → finalize` 串行子流程，多节点并行不同章。
- 异常处理对齐 novel-batch：某章失败**停止后续**（避免剧情崩坏），报错待人工介入。
- UI：在 M4 或新「批量」面板选章节范围 + 节点，进度/实时流式复用 M1 Step3 的活跃任务列表组件思路。

---

## 六、分阶段实施顺序（建议）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **A. 地基** | 数据模型变更（§一）+ embedding 端点 + sqlite-vec 检索层（§三）+ Context Assembler 骨架（§四） | 能 add/query 向量；新类型/表就位，typecheck 过 |
| **B. 起源** | prompt 内化 + arch/blueprint 端点（§2.1–2.2）+ M0 起源页（§5.1） | 从点子生成架构→蓝图→落 OutlineNode，人工可编辑采纳 |
| **C. 生成/管理真实化** | draft/finalize/consistency 端点 + M4/M5 切 real（§5.2–5.3）+ Context Assembler 接入 | 单章主流程（推演串联）与整章高速档均产出可用草稿；定稿更新摘要/状态/RAG |
| **D. 批量** | startBatchGenerate 编排 + 批量面板（§5.4） | 指定范围批量草稿→定稿，失败即停可恢复 |

每阶段独立验证后再进下一阶段；阶段间无强耦合可调整顺序（B 可先于 A 的 RAG 部分，但 C 依赖 A 的 Context Assembler）。

---

## 七、可复用的现有资产（避免重写）

- **SSE 流式网关范式**：`server/src/routes/llm.ts:23`（`/api/llm/clean` 的 hijack + delta 转发 + close 检测陷阱注释）——所有新创作端点照搬。
- **`chatStream` / `listModels`**：`server/src/llmClient.ts:57` / `:28`——embedding 加 `embed()` 同文件。
- **中央调度器**：`frontend/src/services/real/llm.ts:360` `startCleanQueue`（多节点/并发/重试/热调/批次切换）——批量生产直接改造复用。
- **SSE 客户端解析**：`real/llm.ts:144`（`streamSingleChapter` 的 reader/decoder/event 解析）——新端点客户端复用。
- **文档式 SQLite 存储**：`server/src/store/db.ts` 的 `ENTITIES` + `readAll/syncAll`——新实体加进数组即可。
- **moduleMapping 节点选择 + 设置页渲染**：`frontend/src/pages/settings/index.tsx` 按 `ModuleKey` 遍历——加键即自动出 UI 行。
- **StateEvent 时间线** = skill 的 character_state，**已存在且更优**，无需移植。
- **种子/演示数据机制** `resetDemo` = asset_manager 注入。

---

## 八、需同步更新的文档（实施时）

- `DESIGN.md`：新增 M0 起源模块设计、NovelArchitecture/globalSummary 数据模型、Context Assembler 章节、RAG sqlite-vec 实现；§7 待讨论问题 2（语言风格）/3（一致性时机）随真实化拍板。
- `CLAUDE.md`：决策表加「起源流程 / RAG sqlite-vec / 整章高速档」。
- `HANDOFF.md`：按阶段 A–D 更新 checklist。
- skill 提示词来源标注：注明 prompt 基底来自 `Z:\Playground\.opencode\agents\novel-*.md`。

---

## 九、约束与风险提示

- **subagent 暂停约束**：全部为 web 应用原生代码，不调用 skill 的 opencode subagent，不引入 Python。skill 仅作设计依据与 prompt 基底。
- **哲学一致性**：所有 AI 产出（架构/蓝图/草稿/摘要/审校）均为候选待人审；整章高速档产出停在 draft 状态，绝不自动定稿。
- **报告解析风险**：consistency 端点返回的是自然语言报告，解析为结构化 `ConsistencyIssue[]` 需约定输出格式（prompt 内固定 JSON 或标记分隔）；建议 prompt 要求模型输出可解析结构，本地真规则作兜底。
- **sqlite-vec 维度**：不同 embedding 模型维度不同，换模型需重建向量表——需在设置页提示并记录当前维度。

---

## 验证方式（端到端）

1. **地基（A）**：`cd server && npm run typecheck`；启动后端，`curl POST /api/store/vector/add`（喂一段设定）→ `/api/store/vector/query`（关键词召回该段）验证 RAG 闭环。
2. **起源（B）**：前端 M0 页输入一个点子 → 观察架构流式生成 → 采纳 → 蓝图生成 → 确认 `OutlineNode[]` 落库（刷新页面仍在，验证 SQLite 持久化）。
3. **生成（C）**：
   - 主流程：建场景→M3 推演采纳片段→M4 串联，确认草稿保留片段原文。
   - 高速档：直接整章生成，确认产出为 `draft` 状态。
   - 定稿：触发 finalize，确认 `Chapter.summary` / `Book.globalSummary` / 新 `StateEvent` 生成且入 RAG 库。
   - 一致性：制造一处冲突（如已死角色出场），确认 consistency 端点 + 本地真规则均报出。
4. **批量（D）**：选 3–5 章范围批量生成，确认多节点并行、逐章 draft→finalize、中途失败即停。
5. **前端整体**：`cd frontend && npm run build`（tsc + vite）+ eslint 通过；既有 smoke / ruleclean-smoke 不回归。
