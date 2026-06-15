# ref/ — 外部参考资料备份

本目录存放**只读参考资料**，不参与构建、不被项目代码引用，仅供设计与实现时查阅。

## novel-generator-skill/

来源：`C:\Users\Houpy\.config\opencode\skill\novel-generator`（一个 opencode 长篇小说生成 skill，Agent-Centric v4.0）。
备份于 2026-06-16，作为 [`docs/novel_generator_integration_plan.md`](../docs/novel_generator_integration_plan.md) 的设计依据。

- `SKILL.md` / `document/instruction.md`：skill 总说明与设计哲学（雪花法 + 三幕式 + 滚动摘要 + 状态追踪 + RAG）。
- `scripts/`：工具脚本——`vector_store.py`（FAISS RAG，集成时改写为 Node + sqlite-vec 的参考）、`workflow_check.py`、`asset_manager.py`、`utils.py`。
- `data/`：示例资产——人物卡、世界观背景（角色卡/设定库的格式参考样本）。

## agents/

来源：`Z:\Playground\.opencode\agents`（skill 的「大脑」——8 个创作 subagent 的提示词定义）。
集成时这些 prompt 将内化为 `server/src/prompts.ts` 的提示词常量基底。

- `novel-arch.md`：雪花法架构师（种子/角色动力学/世界观/三幕）。
- `novel-blueprint.md`：节奏曲线 + 章节目录规划。
- `novel-draft.md`：单章写作 + RAG 检索。
- `novel-finalize.md`：定稿（扩写/摘要/状态更新/入库）。
- `novel-consistency.md`：逻辑一致性审校。
- `novel-batch.md`：批量草稿→定稿编排。
- `novel-knowledge-import.md` / `novel-role-library.md`：知识库灌入 / 角色卡管理。

## 10_novel_cleaner.html

（既有）M1 文本清理单页应用原型，`docs/M1_text_cleaning.md` 的抽象来源。
