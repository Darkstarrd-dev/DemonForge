# CLAUDE.md — novelhelper

## 项目状态

- **当前阶段**：正式开发启动（2026-06-13 起）——M1 文本清理与系统设置接真实后端
- **本阶段约束**：
  - 设计文档（DESIGN.md 等）与配置（CLAUDE.md）照常读写
  - **已进入实现阶段**：解除「frontend 之外不建代码」约束，按 DESIGN.md 正式架构（Node.js + Fastify 后端、React/Vite 前端）落地
  - 本轮范围：最小 LLM 网关后端（`server/`）+ M1/设置页真实化；**业务数据已落 SQLite 资产库**（可配置资产目录，`server/src/store/db.ts`），向量检索待 M2 真实化接入
  - 接真实 LLM：M1 AI 清理与 Provider 测试经后端调用真实 endpoint（M2–M5 暂仍 mock）
  - 需求决策仍以与用户沟通为主，多解时列选项由用户拍板
  - **临时约束（2026-06-13）**：subagent 调用暂停——需 subagent 的场合改为导出提示词 md 交用户外部执行（详见 `HANDOFF.md`）

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
| 本轮实现范围 | 最小 LLM 网关（`server/`）+ M1 AI 真实流式清理 + 设置页真实测试 endpoint；**业务数据 SQLite 资产库已落地**（可配置资产目录，图片留存路径预留），设置/密钥存 `server/src/data/settings.json` |

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
| `frontend/` | 前端工程（Vite + React + TS + antd）；服务层 `services/api.ts` → mock(`services/mock/`) / real(`services/real/`) |
| `server/` | 后端工程（Fastify）：`/api/llm/{test,clean,embed}`、Provider 抽象层 `src/llmClient.ts`、清理 prompt `src/prompts.ts`；数据层 `src/store/db.ts`（SQLite 资产库）+ `/api/store`、`/api/settings`、`/api/shutdown` |
