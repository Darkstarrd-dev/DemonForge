# 阶段 B 实施计划：novel-generator 集成「起源流程」

> **状态：已规划，待实施**（2026-06-16 评审决定归档为待办，未实施代码）。
> 后续会话接手时按本文档实施，完成后更新 `HANDOFF.md`。
> 上游：阶段 A 地基已完成并提交（`ba1c802`）。总体集成计划见 `docs/novel_generator_integration_plan.md`。

## Context

阶段 A 地基已完成：数据模型 + sqlite-vec RAG + Context Assembler 骨架。
阶段 B 在地基上落「原创起源流程」——novelhelper 当前缺从一个点子推导小说架构与章节蓝图的能力
（M4 假设大纲已存在）。本阶段把 novel-generator 的 `novel-arch`（雪花法四步）与 `novel-blueprint`
（节奏化章节目录）**内化为原生 web 功能**：后端两个 SSE 创作端点 + 前端新建「M0 立项·架构」页，
打通 `点子 → 架构 → 蓝图 → OutlineNode` 闭环，全程产出皆候选待人审。

prompt 基底：`ref/agents/novel-arch.md`、`ref/agents/novel-blueprint.md`（去 subagent/Python/落盘细节，保留方法论）。

**已确认决策**：① 采纳架构时**新建一本 project 作品**并设为当前作品（从零起源）；
② 一键生成蓝图解析出的章节**仅当目标书大纲为空时写入**，分块续写为显式「继续生成」追加；
③ 架构生成后拆四块分区可编辑（对齐 `NovelArchitecture` 字段）。

**约束**：subagent 暂停（主 agent 直接编码）；不引入 Python；AI 产出皆候选。

---

## 一、后端：prompt 内化 + 两个创作端点

### `server/src/prompts.ts`
新增两常量（输出格式固定，便于前端解析）：
- `ARCH_SYSTEM_PROMPT`（← novel-arch）：雪花法四步，**强制输出四个固定二级标题分区**
  `## 核心种子` / `## 角色动力学` / `## 世界观` / `## 三幕式情节`，每区内容自由。去掉文件落盘/询问交互。
- `BLUEPRINT_SYSTEM_PROMPT`（← novel-blueprint）：**每章固定块格式**——
  `第N章 标题` 行 + `定位：` / `核心作用：` / `悬念密度：` / `伏笔：` / `认知颠覆：★…` / `简述：` 六行；
  单次 ≤20 章、续写须与已有目录连贯。

### `server/src/routes/creation.ts`（新建，创作类端点集中处；阶段 C 的 draft/finalize/consistency 同此文件）
- 本地辅助 `streamChat(reply, provider, messages)`：复刻 `routes/llm.ts:23` clean 端点的
  `reply.hijack()` + `reply.raw` close 检测（**带已踩过的断连陷阱注释**）+ `chatStream` + delta/done/error 事件。
- `POST /api/llm/arch`：`{baseURL,apiKey,model, topic, genre, chapters, guidance}` → 拼 user prompt → `streamChat`。
- `POST /api/llm/blueprint`：`{baseURL,apiKey,model, architecture, existingDirectory?, totalChapters, startChapter?}`
  → 拼 user prompt（架构全文 + 续写上下文 + 本次范围）→ `streamChat`。
- `server/src/index.ts` 注册 `creationRoutes`。

provider 由前端按 `moduleMapping.m0Arch` / `m0Blueprint` 传入（阶段 A 已加这两键 + 设置页 UI 行）。

---

## 二、前端：服务层 + 解析 + M0 页 + 路由

### `services/real/creation.ts`（新建）+ `services/api.ts` 导出
- 通用 `streamSSE(url, body, onDelta, signal?): Promise<string>`——复用 `real/llm.ts:144` 的
  reader/decoder/`\n\n` event 解析（delta 累积 + done 收尾 + error 抛出）。
- `generateArch(params, onDelta)`、`generateBlueprint(params, onDelta)`。
- `api.ts` re-export 二者。

### `pages/m0-architecture/parse.ts`（新建）——纯函数，可单测
- `parseArchitecture(text) → { seed, characterDynamics, worldBuilding, plotStructure }`：按 `## ` 四分区切分。
- `parseBlueprint(text) → Array<{order,title,summary,positioning,role,suspenseDensity,foreshadow,twistLevel}>`：
  正则按 `第N章` 分块，逐字段提取；`认知颠覆` 数 ★ → twistLevel(1–5)。

### `pages/m0-architecture/index.tsx`（新建）
布局参照 `pages/m4-generate/index.tsx`（Row/Col + Card + Space + `.stream-pane` 流式框）。分两区：

1. **架构区**：输入 主题/类型/章节数/梗概 + 节点 Select（默认 `moduleMapping.m0Arch`）→「生成架构」
   流式到右栏 → 完成 `parseArchitecture` 填四个可编辑 `TextArea` →「采纳架构」：
   `genId('book')` 建新 project 书 + 存 `NovelArchitecture`(bookId=新书) + `setState({currentBookId})` + 提示。
2. **蓝图区**（采纳架构后显示）：「生成蓝图」传架构四块拼回的全文 + `totalChapters`（=输入章节数）
   → 流式 → `parseBlueprint` 预览 Table →「采纳蓝图（写入大纲）」（新书大纲空，直接写 `OutlineNode[]`，
   volume 默认「正文卷」，order/title/summary + 节奏字段）；「继续生成后续章节」传已采纳大纲重组文本 +
   `startChapter` 续写并**追加**。

### 路由/菜单
- `main.tsx`：import `M0ArchitecturePage` + 加 `<Route path="/m0" .../>`。
- `layouts/AppLayout.tsx`：`MENU_ITEMS` 在 `/m1` 前插 `{ key:'/m0', icon:<DeploymentUnitOutlined/>, label:'M0 立项·架构' }`。

---

## 三、本阶段不做（边界）

- 不动 M4/M5 切 real（阶段 C）；不接 RAG 召回到生成（阶段 C）；不写 draft/finalize/consistency。
- 架构中的角色/世界观「一键导出 M2 卡片候选」（计划 §5.1 提及）留作阶段 B 可选增强，先不做，保持范围聚焦。
- AppLayout 顶部「mock 演示模式」Tag 暂不动（阶段 C 整体真实化时统一处理）。

---

## 关键复用资产

- SSE 网关范式 + 断连陷阱：`server/src/routes/llm.ts:23`（clean 端点）。
- `chatStream`：`server/src/llmClient.ts:57`。
- SSE 客户端解析：`real/llm.ts:144`（streamSingleChapter 的 reader/event 循环）。
- 页面布局/store/services 用法模板：`pages/m4-generate/index.tsx`、`genId`(`store/appStore.ts`)。
- 数据模型（阶段 A 已就位）：`NovelArchitecture`、`OutlineNode` 节奏字段、`ModuleKey.m0Arch/m0Blueprint`。

## 验证（端到端）

1. **后端 typecheck**：`cd server && npm run typecheck`。
2. **端点冒烟**：启动后端，`curl` arch/blueprint 缺参→400；路由注册确认。无真实 endpoint 则止于校验。
3. **解析单测**：临时脚本喂样例架构/蓝图文本 → 验证 `parseArchitecture`/`parseBlueprint` 输出结构正确。
4. **前端**：`cd frontend && npm run build && npm run lint`；smoke/ruleclean 不回归。
5. **端到端（有真实 endpoint，用户实机）**：输入点子 → 架构流式 → 采纳建新书 → 蓝图流式 → 写大纲 →
   刷新页面架构与大纲仍在（SQLite 持久化）→ 切到 M4 见新书大纲节点可用。

## 文档同步（实施后）

- `HANDOFF.md`：勾选阶段 B，刷新快照/焦点/交接备注。
- `DESIGN.md`：补 M0 起源模块设计、arch/blueprint 端点与输出格式约定。
- `CLAUDE.md`：server 文件结构行补 `/api/llm/{arch,blueprint}` + `routes/creation.ts`。
