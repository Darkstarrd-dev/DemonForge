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

- **最后更新**：2026-06-13（第四次会话）
- **阶段**：正式开发启动（后端已建）——M1 与设置页接真实 LLM；M2–M5 仍 mock；数据仍存 localStorage
- **摘要**：在 mock 前端基础上**进入实现阶段**：新增后端 `server/`（Fastify 最小 LLM 网关，
  无状态、不引入 SQLite）——`/api/llm/test`（转发 GET /v1/models）、`/api/llm/clean`
  （SSE 转发流式 chat，内置 §3.7 v2 清理 prompt）、Provider 抽象 `src/llmClient.ts`。
  前端兑现 mock→real 切换：`services/api.ts` 把 `testProvider`/`startCleanQueue` 切到
  `services/real/llm.ts`，页面契约不变。**M1 第三步双路径**（AI 真实流式 / 规则本地
  `ruleClean`，两路径产出都进现有审核步 diff）；**设置页真实测试**（展示模型列表/错误、
  可一键填入模型）。
  自动化验证全过：后端 typecheck、前端 lint/build、smoke(13)/ruleclean-smoke(43)、后端 health
  与 test 错误路径。运行：后端 `cd server && npm run dev`（:8787）+ 前端 `cd frontend && npm run dev`。
  **待用户**：用真实 endpoint 端到端试 AI 清理流式与设置页测试成功路径。

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

### 进行中 / 等待用户

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
- [~] P1 = M1 文本预处理：**清理双路径（AI 真实流式 + 规则 `ruleClean`）已落地**；编码检测/切分/
      审核入库沿用既有；切分 AI 兜底（`aiSplitChapter`）仍 mock、整本长任务队列/重试增强待后续
- [ ] P2 = M2 设定提取
- [ ] P3 = M3 单角色推演
- [ ] P4 = M4 章节生成
- [ ] P5 = M5 管理与一致性

## 交接备注（最近一次会话）

- **日期**：2026-06-13（第四次会话）
- **本次完成**：进入正式开发阶段（用户拍板解除「frontend 外不建代码」、后端 Fastify、
  本轮最小 LLM 网关）。新增后端 `server/`（无状态 LLM 网关：test / clean(SSE) / embed 预留，
  Provider 抽象 + §3.7 v2 prompt）；前端兑现 mock→real 切换（`services/real/llm.ts`，页面零改动契约）；
  M1 第三步「AI 真实流式 / 规则本地」双路径，两路径产出共用审核步；设置页真实测试（模型列表/错误）。
  自动化验证全过（typecheck / lint / build / smoke×2 / 后端 health + 错误路径）。
- **下一步建议**：① **用户用真实 endpoint 端到端试**：先 `cd server && npm run dev`，
  再 `cd frontend && npm run dev`；设置页配 endpoint → 测试看模型列表；M1 导入演示文本 →
  切分 → 第三步选 AI 路径看真实流式 / 选规则路径看瞬时清理 → 审核入库。
  ② 反馈交互调整；③ 后续可推进：SQLite 数据层迁移、M2–M5 真实化、Step2 AI 拆章真实化、
  混合模式（规则载荷注入 LLM §3.10）、429/重试增强。④ 仍待拍板：DESIGN §7 问题 2/3/4/6/7。
- **阻塞项**：无（等待用户端到端试用与反馈）。
- **环境备注**：临时约束「subagent 暂停」仍生效（见顶部 ⚠️ 小节）；后端依赖已装于 `server/node_modules`。

## 更新本文档的约定

1. **完成任务**：勾选对应 checklist 项；产生新任务则新增条目。
2. **会话结束前**：刷新"项目状态快照"与"交接备注"（日期、完成内容、下一步、阻塞项）。
3. **新决策产生**：同步写入 `CLAUDE.md` 已确认决策表与 `DESIGN.md` 对应章节，本文档只记进展不重复细节。
