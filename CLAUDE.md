# CLAUDE.md — novelhelper

## 项目状态

- **当前阶段**：novel-generator 集成全部完成（2026-06-16）——阶段 A 地基 + 阶段 B 起源 + 阶段 C 生成/管理 + 阶段 D 批量生产
- **本阶段约束**：
  - 设计文档（DESIGN.md 等）与配置（CLAUDE.md）照常读写
  - **已进入实现阶段**：按 DESIGN.md 正式架构（Node.js + Fastify 后端、React/Vite 前端）落地
  - 本轮完成：M0 立项·架构（arch/blueprint）+ M4/M5 真实化（draft/finalize/consistency）+ 批量生产（startBatchGenerate + UI 面板）+ Context Assembler（6 个组件）+ sqlite-vec RAG
  - 接真实 LLM：M0/M1/M4/M5 已接真实后端；M2 提取、M3 推演仍为 mock
  - 需求决策仍以与用户沟通为主，多解时列选项由用户拍板

## 项目定位

- **项目名称**：novelhelper
- **核心用途**：综合小说创作辅助工具——raw 文本清洗切分、AI 设定提取与素材库、单角色推演、章节生成、章节管理与一致性检查（详见 `DESIGN.md`）
- **目标用户**：单用户本地使用（作者本人）
- **产品形态**：本地 Web 应用

## 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 技术栈 | Node.js 后端 + React + Vite 前端 |
| 数据库 | SQLite（含向量检索） |
| LLM 接入 | Provider 抽象，本地与云端 API 都支持，各模块可指定不同模型 |
| 数据模型 | 素材库（他人作品参考）与作品库（自己创作）分开建模 |
| 开发顺序 | 按依赖链 M1→M2→M3→M4→M5，先做 P0 基础设施 |
| UI 组件库 | Ant Design（实装 v6，原生兼容 React 19） |
| 前端状态 | zustand（业务数据持久化到后端 SQLite 资产库；Provider/设置存 `server/src/data/settings.json`） |
| mock 定位 | mock 前端即正式前端起点：页面只调 `services/api.ts`，mock 实现集中于 `services/mock/`，接真后端时整层替换、页面零改动 |
| 后端框架 | **Fastify**（2026-06-13 拍板，DESIGN §7 问题 5） |
| RAG 检索 | **Node + sqlite-vec**（2026-06-16 拍板，非 Python sidecar）；向量虚拟表 `vec_chunks` + 元数据表 `chunk_meta`，维度记入 `settings.embeddingDim`，换 embedding 模型需重建 |
| novel-generator 集成 | 把 skill 方法论与 prompt 资产**内化为原生 web 功能**（非运行 skill）；范围四块全做（起源/M4·M5 真实化/RAG/批量），分 A→D 四阶段（详见 `docs/novel_generator_integration_plan.md`）；**已全部完成**（2026-06-16） |
| Context Assembler | M3/M4/M5 共用核心组件（`server/src/contextAssembler.ts`），组装 6 个上下文组件：架构/蓝图/摘要/状态时间线/RAG/已采纳片段 |
| 创作端点 | 5 个 SSE 流式端点：`/api/llm/{arch,blueprint,draft,finalize,consistency}`；draft 接收 Context Assembler 输入；finalize/consistency 输出 JSON |
| 批量生产 | 复用 M1 调度器架构（`services/real/batch.ts`），draft→finalize 串行，失败即停；UI 面板：`pages/batch-generate/` |
| 本轮实现范围 | **novel-generator 四阶段全部完成**：A（地基·数据模型+RAG）+ B（起源·arch/blueprint+M0页）+ C（生成/管理·draft/finalize/consistency）+ D（批量·调度器+UI）；M0/M1/M4/M5 已接真实后端，M2/M3 仍 mock |

## 工作方式

1. **会话开始先读 `HANDOFF.md`**：项目在两个办公场所间通过 git 手动同步，`HANDOFF.md`
   是恢复工作的唯一入口（进展 checklist、下一步、交接备注）。**每完成一项任务必须更新它**；
   会话结束前刷新其状态快照与交接备注。git 同步由用户手动执行，Claude 不执行 git 操作。
2. **设计先行**：所有功能需求先在 `DESIGN.md` 中以文本形式确定，经用户确认后才进入实现阶段。
3. **不做无依据假设**：需求不明确时向用户提问，多种理解并存时列出选项由用户决策。
4. **简洁优先**：设计与实现均以解决问题的最小方案为准，不引入未被要求的功能与抽象。
5. **AI 辅助而非代笔**：产品内所有 AI 介入点的产出均为候选/建议，由用户审核采纳。

## 文档结构

| 文件 | 用途 |
|------|------|
| `CLAUDE.md` | 工程配置、阶段约束、已确认决策 |
| `HANDOFF.md` | **跨场所交接入口**：进展 checklist、下一步任务、交接备注（随任务更新） |
| `DESIGN.md` | 工程设计文档：模块设计、数据模型、架构、阶段规划 |
| `docs/M1_text_cleaning.md` | M1 详细设计（抽象自单页应用原型 `10_novel_cleaner.html`） |
| `docs/M1_raw_features.md` | raw 文件特征样本模板（**待用户填充**，M1 规则设计依据） |
| `docs/frontend_mock.md` | mock 前端说明：页面交互要点、mock 边界、运行方式 |
| `docs/novel_generator_integration_plan.md` | **【实施中】** novel-generator skill 结合进项目的详细计划（2026-06-16）；阶段 A 地基 + 阶段 B 起源已完成 |
| `docs/phase_B_origin_plan.md` | **【已完成】** 阶段 B 起源流程详细实施计划（arch/blueprint 端点 + M0 立项页），代码已落地并验证全过 |
| `ref/` | 只读外部参考资料备份（不参与构建）：novel-generator skill 说明/脚本/示例数据 + 8 个创作 agent 提示词（见 `ref/README.md`）；M1 原型 `10_novel_cleaner.html` |
| `frontend/` | 前端工程（Vite + React + TS + antd）；服务层 `services/api.ts` → mock(`services/mock/`) / real(`services/real/`) |
| `server/` | 后端工程（Fastify）：`/api/llm/{test,clean,embed,arch,blueprint}`、Provider 抽象层 `src/llmClient.ts`（含 `embed()`）、prompt 资产 `src/prompts.ts`；路由 `src/routes/creation.ts`（arch/blueprint SSE）；数据层 `src/store/db.ts`（SQLite 资产库 + sqlite-vec）+ RAG 检索层 `src/store/vector.ts` + 上下文组装器 `src/contextAssembler.ts`；路由 `/api/store`（含 `/vector/{add,query}`）、`/api/settings`、`/api/shutdown` |
