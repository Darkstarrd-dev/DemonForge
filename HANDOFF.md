# HANDOFF.md — novelhelper 交接备忘

**最后更新**：2026-06-30
**当前位置**：办公场所 A
**本轮主题**：**节点池模块化批次5实施完成：5.6 UI 组件拆分（NodePoolManager + NodeTestPanel + ModuleMappingPanel + useNodePoolCrud + useNodeTesting）**

> 📦 **历史明细已归档** → `docs/handoff_history.md`
> 本文件只保留「恢复工作所需的活内容」：进行中任务、模块清单、下一步、交接参考。
> 各轮工作的逐项实现细节、技术决策记录、详尽验证清单全部移入归档文件，按需查阅。

---

## 🆕 节点池模块化方案 · 批次5实施完成（2026-06-30）

按 `docs/node_pool_modularization_plan.md` §11 批次5实施 5.6 UI 组件拆分。

### 改动

- **新增 `frontend/src/hooks/useNodePoolCrud.ts`**：
  - 封装全部节点池 CRUD 逻辑：Provider/Node 编辑态 + 表单 + 保存/删除/复制/重排序
  - 导出/导入节点池（`handleExportNodePool` / `handleImportNodePool`）
  - 获取模型 + 批量添加（`fetchModels` / `batchAddNodes`）
  - 模块映射 + 分组折叠 + 类型筛选
  - 导出 `MODULE_LABELS` 常量
- **新增 `frontend/src/hooks/useNodeTesting.ts`**：
  - 封装全部测试逻辑：单点测试/并发测试/批量测试/真实调用测试
  - `probeOnce` 辅助函数、`applyConcurrencyParams` / `applyTestModel` 写回函数
  - 独立计算 `resolvedNodes`，不依赖 `useNodePoolCrud`
- **新增 `frontend/src/packages/node-pool/ui/NodePoolManager.tsx`**：
  - 纯 CRUD 显示组件：供应商分组卡片 + 节点表格 + 拖拽排序（@dnd-kit）
  - 供应商编辑 Modal + 节点编辑 Modal + 模型多选批量添加 Modal
  - 接收所有回调 props（由 hooks 提供），自身无业务逻辑
- **新增 `frontend/src/packages/node-pool/ui/NodeTestPanel.tsx`**：
  - 测试相关 Modal 组合：连通性测试 + 并发测试 + 真实调用测试
  - 接收测试状态 + 回调 props
- **新增 `frontend/src/packages/node-pool/ui/ModuleMappingPanel.tsx`**：
  - 模块→节点映射 Modal（从 `ModelMappingModal.tsx` 重构迁入 node-pool 包）
  - 供应商→节点两级选择，与原组件逻辑完全一致
- **新增 `frontend/src/hooks/index.ts`**：barrel export
- **新增 `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** npm devDependencies
- **修改 `frontend/src/pages/settings/panels/NodesTabContent.tsx`**：
  - 从 517 行巨组件 → 92 行薄组合层：`useNodePoolCrud()` + `useNodeTesting()` → 3 子组件
  - props 从 26 降到 0（所有逻辑内聚于 hooks）
- **修改 `frontend/src/pages/settings/index.tsx`**：
  - 从 1523 行 → ~450 行：节点池 Tab 只渲染 `<NodesTabContent />`（无 props）
  - 保留：Tabs 容器 + 备份/恢复 + 资产目录 + 通用设置 + 导入预览 Modal
- **修改 `frontend/src/pages/settings/panels/ModelMappingModal.tsx`**：
  - 修复 `row` 类型声明（`{ key: ModuleKey }` → `{ key: ModuleKey; nodeId: string | null; label: string }`）
  - 文件仍保留（未被删除），但不再被 NodesTabContent 导入

### 验证

| 命令 | 结果 |
|---|---|
| `npx tsc -b`（frontend） | 3 个预存错误（Step3Clean），本轮无新增 |
| `npm run lint`（frontend） | 2 个预存错误（Step3Clean），本轮无新增 |
| `npm test`（frontend 全量） | **466/466 passed** |
| `npx tsc --noEmit`（server） | 通过 |
| `npx tsc --noEmit`（electron） | 通过 |

---

## ✅ 已完成模块总览

### 核心创作
- [x] **M0 立项·架构**（arch/blueprint + SSE 流式 + Context Assembler + 空输入自动生成）
- [x] **M1 文本清理**（四步骤全流程 + 批量清理调度器 + 章节名模板替换 + 任务态跨页面 + 自动重试）
- [x] **M2 设定提取**（extractEntities 接真实 LLM；串行防限流）
- [x] **M3 角色推演**（simulateCharacter 接真实 LLM，双候选流式）
- [x] **M4 章节生成**（draft SSE + Context Assembler + 实时流式）
- [x] **M5 章节管理**（finalize/consistency SSE）
- [x] **批量生产**（startBatchGenerate 调度器 + UI 面板）
- [x] **RAG 检索**（Node + sqlite-vec）
- [x] **Context Assembler**（6 组件，M3/M4/M5 共用）

### 平台与基础设施
- [x] **Electron 迁移**（主进程管理、打包配置、数据目录策略）
- [x] **节点测试完整重构**（聊天界面 + System Instructions + 对话记录 + Debug Info + Reasoning + 气泡功能扩展 + 对比模式 + 多 Session 并行）
- [x] **文生图三协议**（ModelScope 异步 / GPT Image 同步 / xAI Imagine 同步；设置页协议选择器）
- [x] **M2 设定卡片三项增强**（手动新增 / AI 生成 / 卡片图片批量生图队列）
- [x] **角色交流模块**（纯本地多角色群聊 + node-test 式 session 化交互；每参与者独立 AbortController + 纯函数派生）
- [x] **沉浸式阅读器**（全屏阅读 + 查找替换 + 单章 AI 清理 + 书签 + 字体/自动播放/翻页）
- [x] **图片辅助模块**（GIF/ZIP/Sprite 导出 + 图层编辑 + 全局裁剪）
- [x] **前端主题系统 + 响应式布局**（浅/深双主题，13 页覆盖 + 4K 基准缩放）
- [x] **2D 环境 Demo**（Phaser + Matter.js 物理沙盒 + 人物状态占位）
- [x] **提示词归一化全模块**（PromptEditorButton 覆盖 13 个 promptKey）
- [x] **data-slot 体系**（11 页，150+ 属性）

### 节点池模块化（共 6 批次，已完成 5 批次）
| 批次 | 内容 | 状态 |
|:---:|---|:---:|
| 1 | 5.1 类型独立 + 5.2 纯函数层独立 + 5.7 导入/导出独立 | ✅ |
| 2 | 5.3 调度策略抽出（runtime/policy/SchedulableNode） | ✅ |
| 3 | 5.4 状态 slice 解耦（独立 store + interop） | ✅ |
| 4 | 5.5a 后端独立路由（NodePoolRepository + SettingsJsonRepo + 10 端点） | ✅ |
| 5 | **5.6 UI 组件拆分**（3 子组件 + 2 hooks；NodesTabContent 0 props；settings/index 1523→450 行） | ✅ |
| 6 | 5.5b 迁 SQLite（可选） | ⏳ |

### 大富翁模块
- [x] **M0–M11 全部审计通过**：类型统一 / 引擎迁移 / 数据修正 / UI 迁移 / 单测 **337/337 绿**
- [x] 数据驱动层全量规划文档（`docs/monopoly_full_plan.md` + `docs/monopoly_module_guide.md`）
- [x] P0/P1 修复 + P2/P3 修复 + audit-04 终审通过（遗留清零）
- [x] 骰子模块 D-1~D-9 + N-1/N-3/N-4/N-5 修复

### 质量体系
- [x] **质量审计体系**（`docs/quality/TEMPLATE.md` + logs/ 体系）
- [x] **A-1~A-14 全部收口**（重构线：SSE 统一 / CleanScheduler 类化 / appStore 切片化 / 组件拆分 / 主题色收敛 / M1 懒加载 / processKiller 等）
- [x] 品牌重命名 **DemonForge**（productName / 图标 / favicon）
- [x] 编译打包（NSIS 安装包 + 便携版；file:// 协议修复）
- [x] Vitest 4 测试项目拆分（core/monopoly/dice 三 project，**466/466 绿**）

### 🚧 待完善
- [ ] 端到端实测节点池：新增供应商 → 文本/图片节点 → 模块映射 → 批量测试 → 导入导出
- [ ] 端到端实测大富翁（新游戏→地图→掷骰→购买→…→胜负）
- [ ] 端到端实测骰子模块（d10 双锥渲染与贴图正确）
- [ ] M12 2D/3D 资产驱动（Tiled Tilemap + glTF 模型替换 blockout）
- [ ] 打包后首次启动（无 settings.json，需手动配置节点）

---

## 📋 立即任务（下次会话）

1. **端到端实测节点池**：新增供应商（多 API KEY / Round-Robin / Failover）→ 文本/图片节点 → 模块映射 → 批量测试 → 导入导出 → 旧 settings.json 迁移
2. **🎮 端到端实测大富翁**：启动→双地图→购买/升级/租金→卡片/道具/神明/事件→破产→胜负
3. **🎲 端到端实测骰子**：d10 双锥渲染、随机模式物理不跳转、投掷力向上抛起
4. **📦 验证完整打包**：`npm run dist`（NSIS + 便携版，注意 Defender 锁 app-builder）
5. **🔍 验证提示词归一化端到端**（各模块 PromptEditorButton 生效）
6. **🎨 验证文生图三协议 + 节点测试各模块 + 全屏阅读**

---

## 🔧 交接参考

### 环境与启动
- **开发**：`npm run dev` 或 `start-electron.bat`（Electron 窗口，自动清理）
- **传统**：`start.vbs`（Chrome 应用模式）
- **打包**：`build-electron.bat`（6 步构建）；镜像 `ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` 指 `npmmirror.com`
- **数据目录**：开发 `server/src/data/`；生产 `~/.novelhelper/`

### 关键文件路径
- **前端服务层**：`services/api.ts` → `mock/` / `real/`；SSE 解析 `services/sse.ts`；清理调度器 `services/cleanScheduler.ts`；Session 引擎 `services/sessionEngine.ts`
- **状态**：`store/appStore.ts`（90 行组合根 + `slices/` 6 切片 + `persistence.ts` + `bootstrap.ts` + `types.ts`）
- **节点池包**：`packages/node-pool/{types,normalize,resolver,picker,circuitBreaker,runtime,policy,store,persistence,serialize}.ts` + **`ui/{NodePoolManager,NodeTestPanel,ModuleMappingPanel}.tsx`**
- **节点池 hooks**：`hooks/{useNodePoolCrud,useNodeTesting}.ts` + `index.ts`
- **节点测试**：`pages/node-test/`（index 444 行 + 7 组件 + 3 hooks）
- **设置页**：`pages/settings/`（index ~450 行 + `panels/` 4 Tab + NodesTabContent 92 行组合层）
- **阅读器**：`pages/book-reader/ImmersiveReader.tsx`
- **后端**：`server/src/` — `llmClient.ts` / `imageClient.ts`(ModelScope) / `gptImageClient.ts` / `xaiImageClient.ts` / `prompts.ts` / `contextAssembler.ts` / `store/{db,vector,nodePoolRepository}.ts`；路由 `routes/{image,gptImage,xaiImage,llm,creation.{shared,origin,generate,m2},settings,nodes}.ts`
- **大富翁**：`game/monopoly/`（engine + data + AI）+ `pages/monopoly/`（UI）
- **骰子**：`game/dice/`（核心 + 2D/3D demo）

### 数据兼容性
- Provider/设置存 `server/src/data/settings.json`；业务数据持久化到后端 SQLite
- image 节点无 `protocol` 字段自动默认 `modelscope`
- 旧 `imageGallery`→`testHistory`；`imageDemoForm`→`nodeTestForm`（向后兼容）

### 各页面使用要点
- **节点测试**：设置页配节点（文本勾「多模态」/ 图片勾「图片编辑」）→ Segmented 切模式 → 选节点 → 输入
- **角色交流**：左栏选 session → 主界面「添加参与者」（多选角色卡+逐角色节点）→ 场景设定 → 发送 / 自动循环 → 切参与者 session 看实时推理+Debug → 导出
- **主题/4K 缩放**：设置 → 通用设置 / 界面设置。4K 缩放建议主用 4K 屏

---

## 工作方式提醒

- 会话开始先读本文件 + 按需查 `docs/handoff_history.md`
- **每完成一项任务更新本文件**；会话结束前刷新状态快照与交接备注
- git 同步由用户手动执行，**Claude 不执行 git 操作**（除非用户明确要求提交/推送）
- 设计先行（DESIGN.md）、不做无依据假设、简洁优先、AI 辅助而非代笔
