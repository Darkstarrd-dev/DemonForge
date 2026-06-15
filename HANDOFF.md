# HANDOFF.md — 项目进展与任务交接

> **用途**：用户在两个办公场所之间通过 git 手动同步本项目。本文档是任一场所
> 拉取代码后**恢复工作的唯一入口**——新会话从这里了解进展、接续任务。
> **约定**：每完成一项任务即更新本文档（勾选 checklist、更新快照与交接备注），
> 之后由用户手动执行 git 同步。

## 快速恢复（新会话从这里开始）

1. **阅读顺序**：`CLAUDE.md`（工程约束与已确认决策）→ 本文档（进展与下一步）→
   `DESIGN.md`（总体设计）→ 当前任务涉及的 `docs/*.md`。
2. **当前阶段**：正式开发启动——已解除「frontend 之外不建代码」约束，新增后端 `server/`
   （Fastify 最小 LLM 网关）；M1 清理与设置页接真实 LLM，其余模块（M2–M5）暂仍 mock。
3. **当前任务焦点**：① M1 第三步双路径（AI 真实流式 / 规则本地）+ 设置页真实测试 endpoint
   已落地并通过自动化验证，**待用户用真实 endpoint 端到端试用**；
   ② raw 特征样本余项与 DESIGN §7 问题 2/3/4/6/7 仍待拍板（问题 5 后端框架已定 Fastify）。

## ⚠️ 当前临时约束（2026-06-13 起）

- **subagent 暂停使用**：当前 Agent 工具调用有问题。凡需调用 subagent 做信息
  汇总 / 搜集 / 并行探查的场合，**不实际调用**，改为将完整提示词导出为 markdown
  文件——保存到根目录 `subagent_tasks/`，命名 `YYYYMMDD-NN-<主题>.md`，一任务一文件，
  内容含「任务目标 / 完整提示词 / 期望输出格式」；随后暂停并交还用户，由用户用外部
  进程跑完后回填结果，再据此续作。
- **解除条件**：subagent 调用恢复正常、经用户确认后，删除本小节。

## 项目状态快照

- **最后更新**：2026-06-15（第七次会话·Step3 + 设置页四项增强）
- **阶段**：正式开发启动（后端已建）——**M1 AI 清理端到端跑通**；设置页接真实 LLM；M2–M5 仍 mock；数据仍存 localStorage
- **摘要**：在 mock 前端基础上**进入实现阶段**。
  运行方式：双击根目录 `start.bat`（一键启动后端 :8787 + 前端 :5173 并打开浏览器）；
  退出：侧边栏底部「退出系统」按钮（关闭前后端所有进程 + 浏览器窗口）。
  **M1 第三步**：AI 路径真实流式已跑通；节点选择 & 并发参数（最大并发/单次章节数/请求间隔）在 Step3 控制栏。
  自动化验证全过：后端 typecheck、前端 eslint/build(tsc+vite)。
  **本轮新增（第七次会话·四项增强）**：
  - ① 请求/响应日志增强（过滤/清空/输入输出字数/首字节延迟/耗时/响应体展示）
  - ② 节点下拉默认选设置页「M1 文本清理」映射节点
  - ③ 清理提示词双面板：设置页持久化默认 + Step3 单次覆盖（优先级：本次 > 设置页默认 > 后端内置）
  - ④ 模块→模型映射去除「模型名」输入框，模型名从节点池读取（只读展示）
  - 修复项：`server/src/routes/llm.ts` 新增 `GET /api/llm/prompt`；`services/real/llm.ts` 新增 `getDefaultPrompt` + `systemPrompt` 透传 + `outputLength`/`firstBytesAt` 字段；store 新增 `m1SystemPrompt` 持久化
  - **历史修复（第六次会话）**：
    - ✅ **`/api/llm/clean` 空响应 bug 已定位并修复**：根因是 SSE 客户端断连检测挂在了**错误的信号源**
      （详见下方「AI 对接排障记录」）。经真实端点（`deepseek/deepseek-v4-flash`）端到端验证：SSE 正常转发、
      广告删除 + 人名复原 + 正文保留均符合 §3.7 v2 prompt 预期。
    - 历史新增项：设置页服务端持久化、布局修复、Step3 调试面板、baseURL 归一化（均沿用）

## Checklist

### 已完成

- [x] 项目初始化：`CLAUDE.md`（阶段约束、工作方式、已确认决策）
- [x] `DESIGN.md` 总体设计 v0.1：五模块设计、素材库/作品库分离数据模型、技术架构、P0–P5 阶段规划
- [x] 关键决策确认：Node.js + React + Vite、SQLite（含向量检索）、Provider 抽象（本地+云端）、两库分离、按依赖链 M1→M5 开发
- [x] 待讨论问题 1：分析原型 `10_novel_cleaner.html` → 产出 `docs/M1_text_cleaning.md`（M1 详细设计，含原型缺陷修复清单）；建立 `docs/M1_raw_features.md` 模板
- [x] 建立本交接文档
- [x] mock 前端决策确认：正式前端起点 / Ant Design / 全流程六页（2026-06-12 用户拍板）
- [x] **mock 前端 v0.1 落地**（`frontend/`，详见 `docs/frontend_mock.md`）：
  - 脚手架：Vite + React 19 + TS + antd v6 + zustand(persist) + 路由 + 种子数据（两本假书全链路数据）
  - M1 四步流水线：上传/演示文本、真编码检测与切分、mock 并发清理（流式监控）、双栏对齐 diff + 行级决策、应用决策入库（修复原型缺陷 §6.1）
  - M2 卡片库：筛选/详情/出处回溯/编辑、mock 提取（伪规则提取器）、合并裁决
  - M3 推演：场景管理、上下文组装预览、双候选流式、场景序列编排
  - M4 生成：大纲节点 + 片段硬约束 + 假流式草稿 → 存 draft
  - M5 管理：状态流转、定稿自动+手动一致性检查（含「已死角色出场」真规则）、报告处理、状态时间线
  - 设置页：Provider 节点池 CRUD/测试、模块→模型映射、重置演示数据
  - 验证：`npm run build` 与 eslint 通过；`scripts/smoke.mts` 13 项核心逻辑断言全过；dev server 冒烟正常
- [x] 文档同步：CLAUDE.md（阶段约束+决策表+文档结构）、DESIGN.md §5（前端选型与演进策略）、新建 `docs/frontend_mock.md`
- [x] **raw 特征样本整理与 M1 规则细化**（2026-06-12 第三次会话）：
  - `docs/M1_raw_features - raw.md`（原件保留）→ 归类填充 `docs/M1_raw_features.md` v0.1：
    标题变体（前导零/纯数字行/标题内穿插乱码）、广告四类、正文穿插乱码五类
    （数字碎片直插/变体字混淆字符表/行首竖排藏号/不可见字符+符号杂讯/编码损坏段 mojibake）、
    格式问题、易误删清单；不可见零宽字符已用正则实证、文件无 U+FFFD
  - `M1_text_cleaning.md` 细化：§3.2 样本驱动调整（行首空白容差、纯数字标题预设、
    章节号连续性检查）、新增 §3.9 确定性预清理（不可见字符/HTML 标签剥离）、
    §3.10 清理 prompt 特征追加规则
  - DESIGN.md §7 新增问题 6（mojibake 处理策略）、问题 7（作者求票/请假去留），
    拍板前默认均保留不删
- [x] **M1 特征识别完善：清理 prompt v2 + 非 LLM 规则清理引擎**（2026-06-12 第三次会话·续）：
  - 关键洞察入档：广告混淆针对 TTS（谐音字会被念出、零宽符不会，目的是让听书用户
    听到群号）→ `M1_raw_features.md` §4 机制分析；推论"群号必在文件内明文出现"
    即规则引擎的**自锚定原理**
  - `M1_text_cleaning.md`：§3.7 清理 prompt v2（TTS 机制说明 + 默读测试 + 词语复原 +
    保留红线，v1 存档）；§3.9 规则清理引擎完整设计（块级广告→自锚定载荷提取→数字
    影子序列匹配→变体字噪声段→行首藏号→自指语料复原验证；通用性三层论证 + 实测局限）；
    §3.10 噪声库与 prompt 动态注入（规则层提取的群号喂给 LLM，两层协同）
  - **原型实证**：`frontend/src/utils/ruleClean.ts`（纯 TS 零依赖，噪声库表可配置）+
    `frontend/scripts/ruleclean-smoke.mts`——真实 raw 样本 43 项断言全过（载荷提取
    5/5 无污染、删除 75 处、低置信仅标记 18 处、人名/真实数字/mojibake/作者 ps 零误删）；
    既有 smoke、eslint、build 全过
- [x] **进入正式开发：最小 LLM 网关后端 + M1/设置页真实化**（2026-06-13 第四次会话）：
  - 用户拍板进入实现阶段、后端框架 **Fastify**、本轮范围 **最小 LLM 网关**（无状态、不引入 SQLite）
  - 新增 `server/`：`src/index.ts`（Fastify，:8787）、`src/llmClient.ts`（Provider 抽象，
    OpenAI 兼容 listModels + chatStream，baseURL 规范化）、`src/routes/llm.ts`
    （`/api/llm/test` GET models；`/api/llm/clean` 单章单请求 SSE，§3.8 输出过短判失败；
    预留 `/embed`）、`src/prompts.ts`（内置 §3.7 v2 清理 prompt）
  - 前端：`vite.config.ts` proxy `/api`→8787；新增 `services/real/llm.ts`（testProvider + 真实
    startCleanQueue，保留 worker 并发/暂停/停止骨架、SSE 解析、新增 onError）；`api.ts` 切换；
    `Step3Clean.tsx` 加「AI 路径 / 规则路径」Segmented（规则路径调 `ruleClean` 瞬时 + 统计）；
    `settings` 真实测试反馈（模型列表一键填入 / 错误详情）
   - 验证：后端 typecheck、前端 eslint/build、smoke(13)/ruleclean-smoke(43)、后端 health 与
     test 错误路径全过（真实 endpoint 端到端待用户试）
- [x] **M1 Step3 交互重构 + 一键启动/退出**（2026-06-15 第五次会话）：
  - M1 第三步移除「AI 路径 / 规则路径」Segmented 切换，仅保留 AI 路径（规则路径效果不佳移除）；
    `ruleClean.ts` 工具/测试保留不动
  - 并发参数（最大并发 / 单次章节数 / 请求间隔）从设置页「节点池编辑」移至 Step3 控制栏；
    `ProviderNode` 类型移除 `maxConcurrency`/`batchSize`/`intervalSec`；后端 `startCleanQueue`
    改为 opts 对象入参、worker 循环实现 `intervalSec` 延迟
  - Step3 新增节点下拉选择（替代设置页 moduleMapping.m1Clean 固定节点）
  - **一键启动**：新增根目录 `start.bat`（双击启动后端+前端两个 cmd 窗口，自动打开浏览器）
  - **一键退出**：侧边栏底部「退出系统」按钮 → `POST /api/shutdown`（后端三级退避 kill：PID 文件 /
    窗口标题 / Get-CimInstance 杀 node 进程）→ `window.close()`
   - 前端 `package.json` 新增 `tsx` devDependency（修复 smoke 测试运行依赖）
- [x] **设置持久化 + 布局修复 + Step3 调试面板**（2026-06-15 第五次会话·续）：
  - 设置数据自动同步到 `server/data/settings.json`：新增 `server/src/routes/settings.ts`（GET/POST `/api/settings`），
    store 启动时从服务端拉取优先于 localStorage，`setState` 变更 debounce 1s 写回；`settings.json` 纳入 `.gitignore`
  - AppLayout 高度修复：外层 `height: '100%'`→`'100vh'`，内层加 `overflow: 'hidden'`
  - M1 Step3 文字修正：`"AI / 规则双路径"`→`"AI"`
  - Step3 可折叠调试面板（`Collapse`）：实时记录每次请求（时间戳/节点/模型/章节/原文长度）与响应（chunks 数/状态/错误），
    不重复实时窗口已有内容
  - Sider 退出按钮对齐修复（`height: '100%'`）
  - 调试日志增强：REQ 显示脱敏请求体（`{baseURL, model, apiKey}` JSON）/ RES 显示 HTTP 状态码 + chunks 数 / ERR 显示
     状态码 + 服务端原始响应体前 2000 字 + 已接收 SSE 原始数据；修复 SSE error 双重日志 bug
- [x] **baseURL 智能归一化 + 读取循环修复 + Fastify body 解析修复**（2026-06-15 第五次会话·再续）：
  - `server/src/llmClient.ts` `normalizeBase`：`URL.origin` 提取域名+端口统一拼 `/v1`（覆盖纯域名/带v1/带完整路径三种输入）
  - `frontend/src/services/real/llm.ts` `streamClean`：读取循环从「先判 done→后累积」改为「先累积→处理 SSE→最后判 done」，确保服务端返回的任意文本都进入 rawChunks 供调试面板展示
  - `server/src/routes/llm.ts` `/api/llm/clean`：handler 从同步改为 `async`，**body 验证移到 `reply.hijack()` 之前**（Fastify 对 hijacked handler 的 body 解析有同步/异步差异，与正常工作的 `/api/llm/test` 对齐）
- [x] **✅ M1 AI 清理流程端到端打通**（2026-06-15 第六次会话）：
  - **定位真正根因**：`/api/llm/clean` 空响应不是 body 解析问题，而是**客户端断连检测挂错信号源**——
    `req.raw.on('close')` 在请求体读取完毕后**立即触发**（这是 HTTP 正常行为，不代表客户端断开），
    从而在 chatStream 收到首个 delta 前（实测 ~24ms）就 `ac.abort()`，取消上游 fetch → 空响应。
    上一会话误判为 body 解析问题，async 改造并未解决。
  - **修复**（`server/src/routes/llm.ts`）：断连检测改挂到 **`reply.raw`（响应流）的 `close`** 事件——
    响应流只在客户端真正断开或响应结束时 close（probe 实证：req.raw close 在首数据后即触发，
    而 reply.raw close 在 end() 后才触发）。注释已写入此陷阱。
  - **真实端点端到端验证通过**（deepseek/deepseek-v4-flash via `https://runanytime.hxi.me`）：
    - `/api/llm/test` → 正常返回 17 个模型列表（baseURL 归一化生效）
    - `/api/llm/clean` → SSE 正常流式（21 delta + 1 done，730 字节）
    - 清理效果：微信公众号广告行整段删除；TTS 谐音片段 `毛小説羣89利兰`→`毛利兰`（变体字+数字删除+人名复原）；正文零误删

### 进行中 / 等待用户

- [x] **Step3 / 设置页四项增强**（2026-06-15 第七次会话）
  - [x] ① 请求/响应日志增强：过滤（全部/请求/响应/错误）+ 清空按钮 + 输入→输出字数对比 + 首字节延迟 + 耗时 + 响应体预览
  - [x] ② 节点下拉框默认选设置页「M1 文本清理」映射节点（`effectiveNodeId` 优先级：selNodeId → moduleMapping.m1Clean.nodeId → 首个已启用节点）
  - [x] ③ 清理提示词双面板：设置页持久化默认（`m1SystemPrompt`，含「载入内置默认」按钮）+ Step3 本次覆盖面板（优先级：本次 > 设置页默认 > 后端内置）
  - [x] ④ 模块→模型映射去除「模型名」输入框，模型名从节点池 `provider.model` 只读展示；节点 Select 的 label 显示模型名
  - [x] 后端：新增 `GET /api/llm/prompt` 返回内置默认提示词；`/api/llm/clean` 支持可选 `systemPrompt` 字段
  - [x] 前端：`services/real/llm.ts` 新增 `getDefaultPrompt` + `systemPrompt` 透传 + `outputLength`/`firstBytesAt` 字段
  - [x] 验证：后端 typecheck ✅、前端 eslint ✅、前端 build(tsc+vite) ✅
- [ ] **用户补充 raw 特征余项并拍板新问题**：`M1_raw_features.md` §1 基本情况
      （编码/文件规模/是否一文件多本）与 §2（卷结构、序章番外）待确认；
      DESIGN.md §7 问题 6（mojibake 处理）、问题 7（作者求票去留）待拍板
- [ ] **用户试用 mock 前端**（`cd frontend && npm install && npm run dev`），反馈交互调整意见

### 待办（设计阶段）

- [ ] 待讨论问题 2：M3 角色语言风格约束方式（卡片维护"风格描述 + 台词例句"是否足够）
      ——mock 已按"描述 + 例句"实装卡片与推演演示，可在试用后结合体感拍板
- [ ] 待讨论问题 3：一致性检查触发时机（定稿自动 / 手动）——mock 演示默认"定稿自动 + 随时手动、不阻断定稿"
- [ ] 待讨论问题 4：静态/动态设定分离建议是否采纳——mock 已演示 state_event 时间线的形态
- [x] ~~待讨论问题 5：后端框架 Fastify vs Express~~ → **已拍板 Fastify**（2026-06-13）
- [ ] 待讨论问题 6：M1 编码损坏段（mojibake）处理策略——LLM 重写修复 vs 仅标记人工（默认保留不动）
- [ ] 待讨论问题 7：M1 作者求票/请假内容去留（默认保留，可做成清理选项）
- [ ] 基于 mock 试用反馈迭代页面交互；沉淀确认后的交互到各模块详细设计
- [ ] M2 设定提取详细设计（实体合并策略、卡片字段、增量抽取）
- [ ] M3 单角色推演详细设计（上下文组装器、排练界面交互）
- [ ] M4 章节生成详细设计（片段硬约束 prompt 方案）
- [ ] M5 管理与一致性详细设计（状态时间线、检查规则）
- [x] ~~设计定稿评审 → 解除"后端不编码"约束，进入实现阶段~~ → **已解除**（2026-06-13，用户拍板从 M1/设置页切入正式开发）

### 待办（实现阶段，设计定稿后启动）

- [~] P0 基础设施：**Provider 抽象层 + 配置界面（设置页真实测试）已落地**（`server/src/llmClient.ts`）；
      后端骨架（Fastify）已建；**SQLite 初始化 / 数据层迁移仍待办**（本轮数据暂留 localStorage）
- [~] P1 = M1 文本预处理：**AI 路径（真实 LLM 流式）已落地并通过真实端点端到端验证**（规则路径已从 UI 移除）；
      编码检测/切分/审核入库沿用既有；切分 AI 兜底（`aiSplitChapter`）仍 mock、整本长任务队列/重试增强待后续
- [ ] P2 = M2 设定提取
- [ ] P3 = M3 单角色推演
- [ ] P4 = M4 章节生成
- [ ] P5 = M5 管理与一致性

## 交接备注（最近一次会话）

- **日期**：2026-06-15（第七次会话·Step3 + 设置页四项增强）
- **本次完成**：四项前端增强全部落地并通过验证：
  ① 请求/响应日志增强：过滤（全部/请求/响应/错误）+ 清空按钮 + 输入→输出字数对比（RES 行显示 `原文N字 → 输出M字`）+ 首字节延迟 + 耗时（按 chapterId 配对计算）+ 响应体预览（done 显示前 500 字，error 显示错误体）
  ② 节点下拉默认选设置页「M1 文本清理」映射节点：`effectiveNodeId` 优先级为 `selNodeId → moduleMapping.m1Clean.nodeId → 首个已启用节点`，用户仍可临时下拉切换
  ③ 清理提示词双面板：设置页 `m1SystemPrompt`（持久化到 settings.json，含「载入内置默认」按钮查看后端内置） + Step3 可折叠「清理提示词（本次）」面板（TextArea + 清空按钮，优先级：本次 > 设置页默认 > 后端内置，经 `startCleanQueue` opts → `streamClean` → `/api/llm/clean` body 透传）
  ④ 模块→模型映射去除「模型名」输入列，改为「将使用模型」只读展示（Tag 显示 `provider.model`）；节点 Select label 追加模型名（如 `本地llama · qwen3-32b-q4`）；底部说明文案
  - 后端配合：`server/src/routes/llm.ts` 新增 `GET /api/llm/prompt`（返回 `M1_CLEAN_SYSTEM_PROMPT`）；`/api/llm/clean` body 新增可选 `systemPrompt` 字段，为空则回退内置
  - 前端新增：`store/appStore.ts` 新增 `m1SystemPrompt` 状态（含 persist + `/api/settings` 同步）；`services/api.ts` 导出 `getDefaultPrompt`；`services/real/llm.ts` 新增 `getDefaultPrompt()` 函数 + `CleanQueueDebugEvent` 新增 `outputLength`/`firstBytesAt` 字段 + `streamClean`/`startCleanQueue` 透传 `systemPrompt`
- **阻塞项**：无。
  下一步可选：① 用户用真实 raw 样本整本试跑 M1 四步流水线；② SQLite 数据层迁移；
  ③ M2–M5 真实化、Step2 AI 拆章真实化、429/重试增强。
  仍待拍板：DESIGN §7 问题 2/3/4/6/7。
- **环境备注**：后端已在 :8787 运行（tsx watch 自动重载）；后端依赖装于 `server/node_modules`，前端依赖装于 `frontend/node_modules`。
- **关键陷阱备忘**（供后续 SSE 相关代码参考）：Fastify `reply.hijack()` 下做 SSE 转发时，
  **客户端断连检测必须监听 `reply.raw`（响应）的 close，绝不能用 `req.raw`（请求）**——
  请求流在 body 读取完毕后即 close，与客户端是否断开无关。`server/src/routes/llm.ts` 已写注释。

## 更新本文档的约定

1. **完成任务**：勾选对应 checklist 项；产生新任务则新增条目。
2. **会话结束前**：刷新"项目状态快照"与"交接备注"（日期、完成内容、下一步、阻塞项）。
3. **新决策产生**：同步写入 `CLAUDE.md` 已确认决策表与 `DESIGN.md` 对应章节，本文档只记进展不重复细节。
