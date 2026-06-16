# DESIGN.md — novelhelper 工程设计文档

> 状态：草稿 v0.1（2026-06-12），待用户确认。
> 标注 `【待确认】` 的内容为推演建议，尚未经用户拍板。

## 1. 项目概述

- **定位**：综合小说创作辅助工具——覆盖素材整理、设定管理、AI 辅助推演与生成、章节管理的完整创作流水线。
- **形态**：本地 Web 应用（Node.js 后端 + React 前端，浏览器访问，单用户本地使用）。
- **核心理念**：
  - **AI 辅助而非 AI 代笔**：每个 AI 介入点的产出都是"候选/建议"，由人审核采纳。
  - **聚焦注意力**：不一次性生成整段多角色剧情，而是单点生成（单角色推演）+ 人工编排，规避多角色混淆与语言风格趋同。

## 2. 总体数据流

```
raw 文本 ──M1 清洗切分──▶ 干净章节
干净章节 ──M2 设定提取──▶ 设定卡片库（素材库 / 作品库）
                              │ 向量检索召回
大纲 + 场景设定 ──M3 单角色推演──▶ 推演片段（多候选，人工采纳）
采纳片段 + 大纲 ──M4 章节生成──▶ 章节草稿（人工编辑定稿）
定稿章节 ──M5 管理与一致性──▶ 章节库 + 动态状态更新 ──▶ 反哺 M2 卡片库 / M3 上下文
```

## 3. 数据模型：素材库与作品库分离

| | 素材库（reference） | 作品库（project） |
|---|---|---|
| 来源 | 他人作品导入 | 自己的创作（含旧稿整理） |
| 用途 | 提取设定作参考，只读 | 大纲、章节、设定、推演的完整工作区 |
| 共性 | 共用同一套实体卡片结构，以 book 的类型字段区分；检索时可指定范围（仅本作品 / 含素材库） | |

核心实体（SQLite，初稿）：

- `book`：作品，类型 reference / project；`globalSummary` 滚动摘要（长篇记忆，定稿时增量更新）
- `chapter`：章节，属 book，含正文与状态（raw / cleaned / draft / final）；`summary` 本章定稿摘要（喂下一章生成）
- `entity_card`：设定卡片——人物 / 地点 / 物品 / 技能 / 势力等，结构化字段 + 自由文本描述 + 出处引用（章节 + 原文片段）
- `entity_embedding`：卡片向量，供语义检索
- `outline`：作品大纲（分卷 / 章节点）；扩节奏字段 positioning/role/suspenseDensity/foreshadow/twistLevel（对齐 novel-blueprint 目录格式）
- `architecture`：小说架构（book 级，一本一条）——雪花法四步：seed（核心种子）/ characterDynamics（角色动力学）/ worldBuilding（世界观）/ plotStructure（三幕式）；novel-generator 集成新增
- `simulation`：推演记录——场景描述、目标角色、输入上下文快照、生成候选、采纳标记
- `state_event`：【待确认】动态状态时间线，见 M5

> 业务实体在资产库以文档式 `(id, data-JSON)` 存储（`server/src/store/db.ts`），字段演进无需迁移。
> RAG 向量另设独立 schema：`vec_chunks`（sqlite-vec 虚拟表）+ `chunk_meta`（来源/正文），不走文档式同步。

## 4. 模块设计

### M1 文本预处理（章节切分 + 清洗）

- **输入**：raw TXT 文档（编码混杂、广告穿插、章节标题格式不一）。
- **流程**：编码识别 → 规则切分（正则匹配常见章节标题模式）→ AI 兜底（规则无法处理的非常规格式）→ 广告清洗（规则匹配 + AI 判定可疑段落）→ 人工审核 → 入库。
- **输出**：结构化干净章节。
- **要点**：
  - **规则优先、AI 兜底**：整本书逐段过 LLM 成本高，AI 只处理规则不确定的部分。
  - **清洗可审核**：AI 只"标记建议删除"并提供 diff 预览，不直接删正文，防误伤。
  - 整本处理是长任务，需要后台任务队列 + 进度上报。
- **详细设计**：`docs/M1_text_cleaning.md`——抽象自已验证可用的单页应用原型
  `10_novel_cleaner.html`（编码检测、切分正则、批处理协议、多节点调度、行级审核 diff
  等机制均已实测）。raw 文件特征参考：`docs/M1_raw_features.md`（模板已建，待用户填充）。

### M2 设定提取与素材库

- **输入**：M1 产出的干净章节（或作品库已有章节）。
- **流程**：分块 LLM 抽取实体 → 生成/更新设定卡片 → 合并去重 → embedding 入库。
- **要点**：
  - **实体合并是难点**：同一人物的别名、称谓变化（"林惊羽 / 林师兄 / 小羽"）需要 embedding 相似度初筛 + LLM 判定辅助合并，并保留人工裁决入口。
  - 卡片必须带**出处引用**，可回溯原文核对。
  - 增量抽取：新章节入库后只处理新内容，更新已有卡片而非重建。

### M3 单角色推演（核心创新点）

- **理念**：一次只推演一个角色——给定场景后，生成该角色在此设定下应有的反应、语言、动作。
- **核心组件——上下文组装器（Context Assembler）**：决定喂给 LLM 哪些内容：
  - 目标角色卡（全量，含语言风格描述）
  - 在场其他角色卡（摘要级）
  - 场景相关设定（向量检索召回：地点、技能、势力等）
  - 前情摘要 + 本场目标
  - **实现**：`server/src/contextAssembler.ts`——M3/M4/M5 共用核心复用组件，组装 6 个上下文组件（详见 §4.1）
- **输出**：该角色的推演片段，支持多候选生成，人工挑选采纳。
- **交互**：排练式界面——同一场景可轮流推演多个角色，再人工编排成场景序列。

### M4 章节生成

- **输入**：本章大纲 + 已采纳的推演片段（作为**硬约束**）+ 前章摘要 + 相关设定。
- **流程**：
  - **主流程（人审）**：M3 推演片段 → M4 串联器（DRAFT prompt 带「保留片段原文」约束）
  - **高速档（整章）**：跳过 M3，直接由 Context Assembler 喂架构+蓝图+摘要 → 整章生成，产出仍进草稿状态待人工编辑
- **端点**：`POST /api/llm/draft`——接收 Context Assembler 输入，输出章节正文（SSE 流式）
- **输出**：章节草稿，进入人工编辑，定稿后流转 M5。

### M5 章节管理与一致性检查

- **章节管理**：CRUD、草稿/定稿状态流转、与大纲节点关联。
- **定稿流程**（`POST /api/llm/finalize`）：
  - 生成本章摘要（200-300 字）
  - 增量更新全局滚动摘要（`Book.globalSummary`）
  - 抽取角色状态变更事件（物品/能力/身体/心理/关系）
  - 章节正文入 RAG 库
- **一致性检查**（`POST /api/llm/consistency`）：
  - 三维度审校：角色一致性 / 世界观逻辑 / 剧情连贯性
  - 输出 JSON 报告（严重/警告/提示三级）
  - 本地真规则兜底（如已死角色出场检测）
- **静态/动态设定分离**：
  - 静态设定：出身、外貌、性格底色——基本不变。
  - 动态状态：当前位置、人物关系、伤势、持有物——随剧情演进。
  - 章节定稿后由 finalize 端点抽取"状态变更事件"记入时间线（`state_event`），一致性检查据此比对，同时反哺 M3/M4 的上下文组装（推演时取角色"当前状态"而非初始设定）。

### M0 立项与架构（novel-generator 集成·阶段 B）

- **输入**：点子（主题/类型/章数/梗概）
- **流程**：
  1. **架构设计**（`POST /api/llm/arch`）：雪花法四步（核心种子 / 角色动力学 / 世界观 / 三幕式情节）→ 流式生成 → 四分区可编辑 → 采纳建新书
  2. **章节蓝图**（`POST /api/llm/blueprint`）：架构 + 总章数 → 流式生成目录（节奏曲线 + 悬念单元）→ 写入 `OutlineNode[]`
- **输出**：`NovelArchitecture`（book 级）+ `OutlineNode[]`（含节奏字段）
- **页面**：`pages/m0-architecture/`——架构区 + 蓝图区

### 批量生产（novel-generator 集成·阶段 D）

- **调度器**：`services/real/batch.ts` 的 `startBatchGenerate`
  - 复用 M1 多节点池、并发控制、worker 循环架构
  - 任务单位：章节生成（draft → finalize 串行子流程）
  - 失败策略：某章失败立即停止（避免剧情崩坏）
- **UI 面板**：`pages/batch-generate/`
  - 章节范围选择（勾选大纲节点）
  - 实时进度监控（状态 + 字数 + 错误）
  - 控制按钮（开始/暂停/停止）

### 4.1 Context Assembler（M3/M4/M5 共用核心组件）

**文件**：`server/src/contextAssembler.ts`

**功能**：给定 `{bookId, chapterIndex, sceneId?, targetCharacterId?, rag?}`，组装创作所需的全部上下文，返回结构化对象供端点消费。

**6 个上下文组件**：
1. **架构**（`NovelArchitecture`）：雪花法四步，静态长时记忆
2. **本章 + 下章蓝图**（`OutlineNode`）：定位/作用/悬念密度/伏笔/认知颠覆，承上启下
3. **滚动摘要 + 前章摘要**（`Book.globalSummary` + 前章 `summary`）：剧情连贯性保障
4. **角色当前状态**：由 `StateEvent` 时间线推导「当前态」（非初始设定）
5. **RAG 召回**：`vector/query`，关键词由 LLM 或调用方提供
6. **已采纳片段**（M4 专用）：`SimFragment.adoptedText`，硬约束保留原文

**调用方**：
- `POST /api/llm/draft`：组装 6 个组件 → 拼装 user prompt
- `POST /api/llm/simulate`（M3，未来）：组装角色卡 + RAG + 摘要
- `POST /api/llm/consistency`：组装架构 + 状态 + 摘要用于审校

## 5. 技术架构

| 层 | 选型 | 说明 |
|---|---|---|
| 后端 | Node.js + Fastify | 已确认 Fastify（2026-06-13）；最小 LLM 网关已落地 `server/`（无状态，数据层 SQLite 待后续） |
| 数据库 | SQLite（better-sqlite3）+ sqlite-vec | 向量检索走 sqlite-vec 扩展，无需独立向量库 |
| 前端 | React + Vite + TypeScript | 已确认；UI 组件库 Ant Design（v6），状态管理 zustand |
| 前端演进策略 | mock 先行 | 设计期已建 `frontend/`（mock 前端=正式前端起点）：页面统一经 `services/api.ts` 调用，当前委托 `services/mock/` 假实现（假数据+模拟流式）；接真后端时替换该层、页面零改动。详见 `docs/frontend_mock.md` |
| LLM 接入 | Provider 抽象层 | 统一按 OpenAI 兼容格式封装；可配置多个 provider（baseURL + key + 模型名），**各模块可分别指定使用的 provider/模型**；支持流式输出 |
| Embedding | 同 Provider 抽象 | 走 `/v1/embeddings`，本地（llama.cpp 等）或云端均可 |
| 任务系统 | 进程内队列 + SSE 进度推送 | 不引入 Redis 等重型组件 |
| 鉴权 | 无 | 单用户本地使用【待确认】 |

### 5.1 RAG 检索与上下文组装（novel-generator 集成·阶段 A 地基）

- **RAG 检索层**（`server/src/store/vector.ts`）：`splitText` 递归分块（chunk 3000 / overlap 500，
  分隔符 `\n\n \n 。！？` 空格 字符，对齐 langchain RecursiveCharacterTextSplitter）→ `embed`
  批量向量化 → 写 `vec_chunks`（sqlite-vec vec0 虚拟表，float32 BLOB）+ `chunk_meta`。
  `queryVectorStore` 对 query 向量做 KNN（子查询 `MATCH ... ORDER BY distance LIMIT k` 再 join 元数据）。
  维度由首个 embedding 决定并记入 `settings.embeddingDim`，换模型维度变更则报错提示重建。
- **embedding**：`llmClient.embed()` 走 `/v1/embeddings`（OpenAI 兼容）；端点 `POST /api/llm/embed`、
  入库/检索 `POST /api/store/vector/{add,query}`，provider 由前端按 `moduleMapping.embedding` 传入。
- **上下文组装器**（`server/src/contextAssembler.ts`，DESIGN §4 点名的 M3/M4/M5 共用组件）：
  `assembleContext({bookId, chapterIndex?, sceneId?, targetCharacterId?, rag?})` 从资产库收集
  架构 / 当前+下章蓝图 / 滚动摘要 + 前章摘要 / 角色状态时间线（由 state_event 推导当前态）/
  RAG 召回 / 已采纳推演片段，返回结构化对象（阶段 A 只收集不拼 prompt，创作端点在阶段 B/C 消费）。

## 6. 开发阶段规划（按依赖链）

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| P0 | 项目骨架、SQLite 初始化、Provider 抽象层、配置界面 | 能配置并连通至少一个本地 + 一个云端 provider，跑通对话与 embedding 调用 |
| P1 | M1 文本预处理 | 导入一本真实 raw TXT，正确切分章节、清洗广告，人工审核后入库 |
| P2 | M2 设定提取 | 对 P1 的书完成实体抽取，卡片可浏览/检索/人工修正 |
| P3 | M3 单角色推演 | 手工或基于卡片构建场景，生成可用的单角色推演片段 |
| P4 | M4 章节生成 | 大纲 + 片段生成完整章节草稿 |
| P5 | M5 管理与一致性 | 章节定稿流转、一致性检查报告、动态状态时间线 |

## 7. 待讨论问题

1. **M1 样本**：~~能否提供典型 raw 文件特征？~~ → 用户已提供素材，已整理为
   `docs/M1_raw_features.md` v0.1（§1 基本情况余少量**待确认**项：编码、文件规模、卷结构等）。
2. **语言风格控制**：M3 推演时角色语言风格如何约束——卡片中维护"语言风格描述 + 台词例句"是否足够？
3. **一致性检查时机**：章节定稿时自动触发，还是手动触发？
4. **静态/动态设定分离**（M5 推演建议）是否采纳？
5. ~~**后端框架**：Fastify 还是 Express？~~ → **已拍板 Fastify**（2026-06-13），最小 LLM 网关落地于 `server/`。
6. **M1 编码损坏段（mojibake）处理**：损坏字符串占位着原文、机械删除即丢句子内容
   （样本见 `M1_raw_features.md` §4.5）——让 LLM 尝试重写修复（靠 diff 审核把关），
   还是仅标记待人工处理？拍板前默认保留不动。
7. **M1 作者求票/请假内容去留**：ps 求月票、请假条、求鲜花等为作者本人所写
   （样本见 `M1_raw_features.md` §3.3）——删除还是保留？（也可做成清理选项）拍板前默认保留。
