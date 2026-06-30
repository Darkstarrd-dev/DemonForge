# HANDOFF.md — novelhelper 交接备忘

**最后更新**：2026-06-30
**当前位置**：办公场所 A
**本轮主题**：**audit-05 审计 + 高优项整改完成（A-15~A-19/A-24/A-26）**

> 📦 **历史明细已归档** → `docs/handoff_history.md`
> 本文件只保留「恢复工作所需的活内容」：进行中任务、模块清单、下一步、交接参考。
> 各轮工作的逐项实现细节、技术决策记录、详尽验证清单全部移入归档文件，按需查阅。

---

## 🆕 audit-05 整改完成（2026-06-30）

审计报告：`docs/quality/logs/2026-06-30-audit-05.md`

### 已完成（7/13 项）

| 编号 | 内容 | 结果 |
|:---:|---|:---:|
| A-15 | Step3Clean 3 TS + 2 lint 错误清零 | tsc 0 / lint 0 |
| A-16 | persistence.ts 20 处 .catch(()→{}) 改 logFailure | tsc 0 / 469 绿 |
| A-17 | importSession.ts 3 空 catch 改 console.warn | tsc 0 |
| A-18 | llmClient.ts 16 单测（buildRequestBody/listModels/embed/chatStream） | 16/16 绿 |
| A-19 | db.test.ts 7 单测（syncAll/readAll/deleteEntities/clearAll）+ vector.test.ts 7 单测（splitText） | 14/14 绿 |
| A-24 | gifUtils CDN Worker → public/gif.worker.js 本地化 | — |
| A-26 | saveStorage `(window as any).electronAPI` → `window.electronAPI` | tsc 0 |

### 验证快照

| 命令 | 结果 |
|---|---|
| `npx tsc -b`（frontend） | **0 errors**（首次清零！Step3Clean 预存错误已修复） |
| `npm run lint`（frontend） | 0 errors |
| `npm test`（frontend） | **469/469 passed** |
| `npx tsc --noEmit`（server） | 通过 |
| `npx vitest run`（server） | **46/46 passed**（原 16 + 新增 30） |
| `npx tsc --noEmit`（electron） | 通过 |

### 待完成（6/13 项）

| 编号 | 内容 | 优先级 |
|:---:|---|:---:|
| A-21 | 拆分 Step3Clean（1276→4 文件） | 中 |
| A-22 | 拆分 ImmersiveReader（1023→4 文件） | 中 |
| A-23 | 拆分 m2-cards（880→3 文件） | 中 |
| A-25 | 补 16 个目录 barrel export | 低 |
| A-27 | 依赖升级（15 个过期） | 低 |
| A-20 | creation 路由单测 | 中 |

---

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

## 🆕 节点池模块化方案 · 批次6实施完成（2026-06-30）

按 `docs/node_pool_modularization_plan.md` §5.5b 详细方案执行——SqliteRepo + 迁移脚本 + index.ts 注入切换 + 单测。**节点池 6 批次全部完成。**

### 改动

- **修改 `server/src/store/nodePoolRepository.ts`**：
  - 追加 `ensureNodePoolTables(db)`：建 3 表（providers / provider_nodes / module_mapping，文档式 `id TEXT PK, data TEXT`）
  - 追加 `getNodePoolDb()`：缓存的 better-sqlite3 连接（WAL + busy_timeout=5000），路径 `<appDataDir>/nodepool.db`（全局，不随资产目录切换）
  - 追加 `closeNodePoolDb()`：测试清理用（关文件 DB，释放 Windows 文件锁）
  - 追加 `SqliteRepo` 类：实现 `NodePoolRepository` 接口；构造可注入 DB（测试 `:memory:`），默认走 `getNodePoolDb()`；逐行 JSON.parse 容错（单行损坏跳过，与 db.ts readAll 一致）；`deleteProvider` 事务级联删其下 nodes
  - 追加 `migrateNodePoolToSqlite()`：settings.json 守卫 flag（`nodePoolMigrated`）+ 备份 `.pre-migrate.bak` + 事务 upsert 三表 + `writeSettings` 删三键；三者皆空（首次安装）直接标记；失败事务回滚不写 settings.json → 下次重试
- **修改 `server/src/routes/settings.ts`**：`writeSettings` 改 `export`（迁移需删键，`updateSettings` 只能 merge 无法删键）
- **修改 `server/src/index.ts`**：import 改 `SqliteRepo` + `migrateNodePoolToSqlite`；`new SettingsJsonRepo()` → `new SqliteRepo()`；listen 块内加 `migrateNodePoolToSqlite()` 调用（与 `migrateImageB64Purge` 同 try/catch 模式，routes 注册后、首个请求前）
- **修改 `server/package.json`**：加 `vitest` ^4.1.9 devDep + `test` script（`vitest run`）
- **新增 `server/src/store/nodePoolRepository.test.ts`**：16 个单测
  - SqliteRepo CRUD（`:memory:`）：save/get/list/upsert 覆盖/delete + 级联删（删 provider 其下 nodes 一并删，他 provider nodes 保留）+ module_mapping singleton 行（覆盖非追加）+ 单行坏 JSON 跳过
  - 迁移脚本（临时目录 + `NOVELHELPER_DATA_DIR` env + `vi.resetModules`）：含 providers/nodes/mapping 的 settings.json → 验证 nodepool.db 有数据 + settings.json 删三键 + 置守卫 + 其它设置保留 + 备份存在；守卫已置不重复迁移；首次安装不建 DB
  - 接口契约：同一操作序列跑 SettingsJsonRepo（临时 settings.json）与 SqliteRepo（`:memory:`），断言 get/list/级联/删除/moduleMapping 覆盖输出一致
- **SettingsJsonRepo 保留**：不删除，代码级 fallback（需回退时改 index.ts 一行 `new SettingsJsonRepo()` 即可，无需环境变量）

### 验证

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit`（server） | 通过 |
| `npx vitest run`（server，**新增**） | **16/16 passed** |
| `npx tsc -b`（frontend） | 3 个预存错误（Step3Clean），本轮无新增 |
| `npm run lint`（frontend） | 2 个预存错误（Step3Clean），本轮无新增 |
| `npm test`（frontend 全量） | **469/469 passed** |
| `npx tsc --noEmit`（electron） | 通过 |

### 关键设计点

- **路由层零改动**：`nodesRoutes(subApp, nodePoolRepo)` 只依赖 `NodePoolRepository` 接口，5.5a→5.5b 仅换注入实例（`SettingsJsonRepo` → `SqliteRepo`），路由层一行未动
- **独立 DB 不入 ENTITIES**：`nodepool.db` 是全局配置（不随资产目录切换），与业务 DB `novelhelper.db` 隔离；SqliteRepo 内部管理自己的连接
- **迁移幂等可重试**：事务回滚不写守卫 → 下次启动重试；upsert `ON CONFLICT DO UPDATE` 幂等；`.pre-migrate.bak` 兜底
- **测试可测性**：SqliteRepo 构造注入 `:memory:` DB（不走 getAppDataDir）；迁移测试用临时目录 + env var + `vi.resetModules` 取新模块实例（settings.ts 的 DATA_DIR 在 import 时计算）

---

## 🆕 5.5a 修复：pushNodePoolNow diff-based sync（2026-06-30）

### 背景

批次 4 实施 5.5a 时 `pushNodePoolNow` 将整数组 `POST /api/providers` 和 `POST /api/nodes`，但后端端点期望**单个对象含 `.id`**（`if (!body.id) return 400`），导致推送静默失败（400 被 `.catch(() => {})` 吞没）。同时 `POST /api/settings` 已剔除三键，节点池变更无写入通道 → 仅存内存，重启丢失。

### 修复（方案 B：对齐原计划 per-item CRUD）

- **新增 `frontend/src/services/real/nodePoolApi.ts`**：
  - `providersApi` / `nodesApi` / `moduleMappingApi` 三个客户端对象
  - 每对象含 `list()`(GET) / `save()`(PUT upsert) / `remove()`(DELETE) 方法
  - 支持 `keepalive` 选项（关窗冲刷时 `keepalive: true`）
- **修改 `api.ts`**：re-export `providersApi` / `nodesApi` / `moduleMappingApi`
- **修改 `persistence.ts`**：
  - `pushNodePoolNow` `void` → `async`，改为 **diff-based sync**：
    1. GET 后端当前 providers/nodes
    2. 本地有 → PUT /api/{providers,nodes}/:id（upsert）
    3. 后端多余 → DELETE /api/{providers,nodes}/:id
    4. module-mapping → POST 整体替换
  - `flushStoreWrites`：关窗冲刷改为 per-item PUT upsert（不做 DELETE，由下次 `pushNodePoolNow` 补偿）
- **新增单测** `persistence.test.ts` ⑧⑨⑩：验证 PUT 单项、删除后端多余、更新已有项

### 验证

| 命令 | 结果 |
|---|---|
| `npx tsc -b`（frontend） | 3 个预存错误（Step3Clean），本轮无新增 |
| `npm run lint`（frontend） | 2 个预存错误（Step3Clean），本轮无新增 |
| `npm test`（frontend 全量） | **469/469 passed**（原 466 + 新增 3） |
| `npx tsc --noEmit`（server） | 通过 |
| `npx tsc --noEmit`（electron） | 通过 |

### 调用方兼容性

`pushNodePoolNow` 返回 `void` → `Promise<void>`，3 个调用方（`useNodePoolCrud.ts:389`、`settings/index.tsx:237`、`persistence.ts:398`）均为 fire-and-forget（无 await），安全。

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

### 节点池模块化（共 6 批次，全部完成 ✅）
| 批次 | 内容 | 状态 |
|:---:|---|:---:|
| 1 | 5.1 类型独立 + 5.2 纯函数层独立 + 5.7 导入/导出独立 | ✅ |
| 2 | 5.3 调度策略抽出（runtime/policy/SchedulableNode） | ✅ |
| 3 | 5.4 状态 slice 解耦（独立 store + interop） | ✅ |
| 4 | 5.5a 后端独立路由（NodePoolRepository + SettingsJsonRepo + 10 端点）+ **修复**（per-item CRUD diff sync） | ✅ |
| 5 | 5.6 UI 组件拆分（3 子组件 + 2 hooks；NodesTabContent 0 props；settings/index 1523→450 行） | ✅ |
| 6 | 5.5b 迁 SQLite（方案 A：独立 DB `nodepool.db`，SqliteRepo + 迁移脚本 + 16 单测） | ✅ |

### 大富翁模块
- [x] **M0–M11 全部审计通过**：类型统一 / 引擎迁移 / 数据修正 / UI 迁移 / 单测 **337/337 绿**
- [x] 数据驱动层全量规划文档（`docs/monopoly_full_plan.md` + `docs/monopoly_module_guide.md`）
- [x] P0/P1 修复 + P2/P3 修复 + audit-04 终审通过（遗留清零）
- [x] 骰子模块 D-1~D-9 + N-1/N-3/N-4/N-5 修复

### 质量体系
- [x] **质量审计体系**（`docs/quality/TEMPLATE.md` + logs/ 体系）
- [x] **audit-05 全量审计 + 7 项整改**（A-15~A-19/A-24/A-26 完成；Step3Clean tsc/lint 首次清零；server 测试 16→46；persistence 20 处错误吞没消除）
- [x] **A-1~A-14 全部收口**（重构线：SSE 统一 / CleanScheduler 类化 / appStore 切片化 / 组件拆分 / 主题色收敛 / M1 懒加载 / processKiller 等）
- [x] 品牌重命名 **DemonForge**（productName / 图标 / favicon）
- [x] 编译打包（NSIS 安装包 + 便携版；file:// 协议修复）
- [x] Vitest 4 测试项目拆分（core/monopoly/dice 三 project，**469/469 绿**）

### 🚧 待完善
- [ ] 端到端实测节点池：新增供应商 → 文本/图片节点 → 模块映射 → 批量测试 → 导入导出
- [ ] 端到端实测大富翁（新游戏→地图→掷骰→购买→…→胜负）
- [ ] 端到端实测骰子模块（d10 双锥渲染与贴图正确）
- [ ] M12 2D/3D 资产驱动（Tiled Tilemap + glTF 模型替换 blockout）
- [ ] 打包后首次启动（无 settings.json，需手动配置节点）

---

## 📋 立即任务（下次会话）

1. **端到端实测节点池（含 5.5a+5.5b）**：新增供应商（多 API KEY / Round-Robin / Failover）→ 文本/图片节点 → 模块映射 → 批量测试 → 导入导出 → 迁移验证（旧 settings.json 含 providers 启动后迁入 nodepool.db、settings.json 删三键置守卫）→ 重启持久化
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
- **前端服务层**：`services/api.ts` → `mock/` / `real/`；节点池 CRUD 客户端 `services/real/nodePoolApi.ts`（providersApi/nodesApi/moduleMappingApi）；SSE 解析 `services/sse.ts`；清理调度器 `services/cleanScheduler.ts`；Session 引擎 `services/sessionEngine.ts`
- **状态**：`store/appStore.ts`（90 行组合根 + `slices/` 6 切片 + `persistence.ts` + `bootstrap.ts` + `types.ts`）
- **节点池包**：`packages/node-pool/{types,normalize,resolver,picker,circuitBreaker,runtime,policy,store,persistence,serialize}.ts` + **`ui/{NodePoolManager,NodeTestPanel,ModuleMappingPanel}.tsx`**
- **节点池 hooks**：`hooks/{useNodePoolCrud,useNodeTesting}.ts` + `index.ts`
- **节点测试**：`pages/node-test/`（index 444 行 + 7 组件 + 3 hooks）
- **设置页**：`pages/settings/`（index ~450 行 + `panels/` 4 Tab + NodesTabContent 92 行组合层）
- **阅读器**：`pages/book-reader/ImmersiveReader.tsx`
- **后端**：`server/src/` — `llmClient.ts` / `imageClient.ts`(ModelScope) / `gptImageClient.ts` / `xaiImageClient.ts` / `prompts.ts` / `contextAssembler.ts` / `store/{db,vector,nodePoolRepository}.ts`（**SqliteRepo + getNodePoolDb + migrateNodePoolToSqlite**）；路由 `routes/{image,gptImage,xaiImage,llm,creation.{shared,origin,generate,m2},settings,nodes}.ts`
- **大富翁**：`game/monopoly/`（engine + data + AI）+ `pages/monopoly/`（UI）
- **骰子**：`game/dice/`（核心 + 2D/3D demo）

### 数据兼容性
- Provider/设置存 `server/src/data/settings.json`；业务数据持久化到后端 SQLite（`<assetDir>/novelhelper.db`）
- **5.5b 已实施**：节点池数据迁至 `<appDataDir>/nodepool.db`（独立 SQLite，全局不随资产目录切换）；settings.json 仅保留设置项（providers/providerNodes/moduleMapping 三键迁移后删除 + 置 `nodePoolMigrated` 守卫）；迁移有守卫 flag + `.pre-migrate.bak` 备份；SettingsJsonRepo 保留为代码级 fallback
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
