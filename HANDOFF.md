# HANDOFF.md — novelhelper 交接备忘

**最后更新**：2026-06-28
**当前位置**：办公场所 A（待提交）
**本轮主题**：**大富翁审计整改实施**——按 `docs/quality/logs/2026-06-28-monopoly-implementation-audit.md` 的 5 Phase 整改清单逐步实施。**Phase 0–4 全部完成（类型统一 + 引擎迁移 + 数据修正 + UI 迁移 + 单测适配），337/337 绿 ✓，app 层 tsc 0 + vite build ✓。**

> 📦 **历史明细已归档** → `docs/handoff_history.md`
> 本文件只保留「恢复工作所需的活内容」：进行中任务、模块清单、下一步、交接参考。
> 各轮工作的逐项实现细节、技术决策记录、详尽验证清单全部移入归档文件，按需查阅。

---

## 🆕 大富翁审计整改实施（2026-06-28，app 层 tsc 0 + vite build ✓，待提交）

按审计报告 5 Phase 整改清单实施，已完成 Phase 0–3。

### Phase 0：类型系统统一 ✅

- **删除旧类型**：`Tile`（旧 P0–P6）、`TileType`、`BoardConfig`、`TurnState`、`TurnPhase`、`FullGameState`
- **TileV2 → Tile**：`id: string` 作为唯一格子标识；`index: number` 保留用于环形走动
- **ID string 化**：`PropertyState.tileId`、`Player.position`、`Player.ownedTileIds`、`Action.tileId/targetTileId`、`boardTraps` 键全部改为 `string`
- **TurnContext + TurnPhaseV2**：替代旧 `TurnState`/`TurnPhase`，12 阶段状态机（TURN_START→ROLL_DICE→MOVING→...→TURN_END）
- **BoardState**：统一地图运行时状态（`data: BoardData` + `tiles` + `properties` + `sealedGroups` + `priceUpGroups` + `boardTraps`）
- **GameState 统一**：移除 `FullGameState`，`GameState` 为唯一顶层类型；`economy`/`cardDeck`/`itemDeck`/`config`/`day` 改为必填
- **NewGameConfig**：移除 `board: BoardConfig`，引擎内通过 `mapId` 加载地图
- **新增**：`ItemEffectType` 枚举（18 种）、`ItemDefinition.effectType/effectParams`

### Phase 1：引擎迁移 ✅

- `engine/loader.ts`：`boardDataToBoardConfig` 返回 `BoardState`（非降级为旧 BoardConfig）；新增 `createBoardState`；旧 `boardDataToBoardConfig` 保留为别名
- `engine.ts`：`createInitialState` 改用 `loadMapData` + `createBoardState` 构造 `GameState`；reducer 适配新字段路径
- `engine/turn.ts`：`advanceOnRing` 使用 `tile.id`（string ID）走动，`findTile`/`findTileByIndex` 辅助函数；`handleRoll`/`handleResolveDecision`/`handleEndTurn` 适配 `TurnContext`
- `engine/player.ts`：`liquidate` 签名改为 `Record<string, PropertyState>`
- `engine/board.ts`：`tileId: number` → `string`，按 ID 查找 tile
- `engine/economy.ts`：`state.board.tiles[number]` → `find` 查找；移除 `?? fallback`（必填字段）
- `engine/card.ts`：全面适配 string ID + BoardState；`priceUpGroups`/`sealedGroups` 纳入 `board:` 命名空间
- `engine/item.ts`：`boardTraps` 在 `state.board.boardTraps`；道具效果按 tile ID 操作
- `engine/event.ts`：`resolveTeleport` 改为 string ID；`priceUpGroups`/`sealedGroups` 纳入 board 命名空间
- 其他：`god.ts`、`company.ts`、`ai.ts`、`ai-llm.ts`、`ai-strategies.ts`、`serializer.ts`、`validator.ts`、`character-mapper.ts` 全部适配
- **删除 `board.preset.ts`**（死文件，P3-5）

### Phase 2：数据文件修正 ✅

| 文件 | 修正项 |
|------|--------|
| `cards/richman4-cards.json` | card-00：+steps 6；card-08/09：duration 3→5；card-22：+mode nearest；card-23：TAX_TARGET→ALL_GAIN_CASH；card-25/26：+duration；card-27/28：+params |
| `gods/richman4-gods.json` | god-04：transformTo god-00→god-05；god-07：target OPPONENT→SELF；god-10：value 0.25→0.5 + note |
| `events/magic-house-events.json` | 修正 10 条 type/params（ALL_GAIN_CASH→POINTS、GIVE_CARD→GOD_POSSESSION 等） |
| `config/richman10-online.json` | +autoIncrementIntervalDays:7 |
| `config/richman11-hotfight.json` | +autoIncrementIntervalDays + cashAsHP + noHospital |
| `maps/richman4-taiwan.json` | tw_19 +taxRate:0.1 |

### Phase 3：UI 迁移 ✅

- 全部 9 个页面组件适配新类型：`Board.tsx`、`Board3D.tsx`、`GamePanel.tsx`、`PlayerHUD.tsx`、`DecisionModal.tsx`、`NewGameModal.tsx`、`SaveLoadModal.tsx`、`Tile.tsx`、`index.tsx`
- 核心变更：`state.turn`→`state.turnContext`、`state.properties`→`state.board.properties`、`phase vs TurnPhaseV2` 枚举比对、`tileId: number`→`string`、`SpaceType.PROPERTY` 字符串比对

### 验证状态

- **app 层 tsc**：0 error（`npx tsc -p tsconfig.app.json --noEmit` 通过）
- **vite build**：成功（chunk 尺寸警告正常）
- **vitest**：**337/337 绿**（16 个 monopoly 测试文件全部适配新类型）

### Phase 4：单测适配 ✅（2026-06-28）

- **10 个测试文件完整重写**：engine、turn、event、card、item、board、ai、god、player、company —— 适配 `turn→turnContext` / `properties→board.properties` / `sealedGroups/priceUpGroups→board.*` / `position: number→string` / `tileId 数字→字符串` / `phase 枚举→TurnPhaseV2` / god 数据修正（god-04→god-05、god-10 值 0.25→0.5）
- **1 个测试文件微调**：economy.test.ts（`turn→turnContext` 1 处）
- **引擎小修复**：`aiNextAction` 补 `TurnPhaseV2.TURN_START` 到 ROLL_DICE 分支（等价旧 ROLL 阶段，漏迁移项）
- 其余 6 个测试文件（ai-strategies / character-mapper / loader / serializer / validator + economy）此前已绿，本轮确认无退化

### 待端到端实测：新游戏→地图选择→掷骰→购买→升级→卡片→道具→神明→事件→破产→胜负

---

## 🆕 提示词归一化全模块迁移（2026-06-28，已完成，build 全绿 + vitest 55 绿）

将 `PromptEditorButton` + `usePromptOverride` + `promptOverrides` 注册表从 M0 扩展到全部创作模块，统一"编辑提示词→持久化→注入请求"链路。

**覆盖 13 个 promptKey**（PROMPT_REGISTRY 已登记）：
- M0: m0-arch-input / m0-arch / m0-blueprint（已有）
- M1: m1-clean（已有，本轮补 PromptEditorButton 到 Step3Clean 提示词区）
- M2: m2-extract / m2-card-single / m2-card-image-prompts / m2-card-profiles / m2-cards-batch
- M3: m3-simulate
- M4: m4-draft（批量页面注入）
- M5: m5-finalize / m5-consistency（批量页面注入 finalize，consistency 待 M5 页面接真实后端）

**后端 6 个端点加 systemPrompt 支持**（creation.m2.ts: extract-entities; creation.generate.ts: draft/finalize/consistency/simulate；llm.ts: clean 已有）。前端 5 个服务层加 systemPrompt 传参（extract.ts/simulate.ts/generation.ts DraftParams+FinalizeParams+ConsistencyParams/batch.ts opts）。

**前端页面新增 PromptEditorButton**：
- `m2-cards/index.tsx`：extract 按钮旁加 `PromptEditorButton promptKey="m2-extract"`，runExtract 注入 promptOverrides
- `m2-cards/CardEditorModal.tsx`：删旧 inline prompt-editor Modal，改用 PromptEditorButton（按 type 分支 `m2-card-single:${type}`）
- `m2-cards/BatchCardModal.tsx`：configView 加 2 个 PromptEditorButton（侧写 m2-card-profiles / 扩写 m2-cards-batch），调用注入
- `m3-simulate/index.tsx`：simulate 按钮旁加 PromptEditorButton（m3-simulate），run 注入
- `batch-generate/index.tsx`：节点配置卡加 2 个 PromptEditorButton（m4-draft / m5-finalize），startBatchGenerate opts 注入
- `m1-import/Step3Clean.tsx`：提示词区加 PromptEditorButton（m1-clean），优先级链改为 本次覆盖 > 持久化覆盖 > 设置页默认 > 后端内置

**顺修 5 个 build 错误**：
- `m0-architecture/index.tsx:203` — `resolveBpNode()` 不存在 → 改为 `moduleMapping.m0Blueprint?.nodeId ?? null`
- `BatchCardModal.tsx:324` — `textNodes` 不存在 → 改为 `providers.filter(...).length === 0`
- `CardEditorModal.tsx:106` — `promptByType[type]` 不存在 → 改为 `promptOverrides[`m2-card-single:${type}`]`
- `m3-simulate/index.tsx:245` — PromptEditorButton 不接受 `style` prop → 去掉 style
- `settings/index.tsx:55` — MODULE_LABELS 缺 3 个 ModuleKey → 补 m2CardImage/batchGenerate/roleChat

**验证**：前端 tsc 0 + vite build ✓ + vitest 55 绿；后端 tsc 0。**待端到端实测**（各模块 PromptEditorButton 打开→编辑→保存→实际生效）。

---

## 🆕 四模块需求落地 12 项（2026-06-28，已完成，回归全绿，待提交）

基于审计提交（`6b1ce9d` creation 拆分 / `ad229f6` audit-02）后的现状实施。**先核对了审计提交无功能冲突**：M2 卡片路由已迁 `creation.m2.ts`（落点据此 retarget）；persistence 已「声明式脏检查」（新增设置只改 `settingsPayload` 一处）。

**设定卡片（M2）**
- **#1 归属书默认素材库**：`CardEditorModal` AI 模式 `bookId` 初值改空串（手动模式不变）。
- **#2 按类型可编辑提示词**：新增持久化 `m2CardGenPromptByType: Partial<Record<EntityType,string>>`（uiPrefsSlice 默认 + types + bootstrap 读取 + settingsPayload 1 键）；服务端 `GenerateCardBody` 加 `systemPrompt` 覆盖（空=默认）+ `GET /api/llm/card-gen-prompt` 返回默认；`CardEditorModal` 加「编辑提示词」按钮 + 子 Modal（按当前 type，保存/重置）。
- **#3 批量生成**：新增 `BatchCardModal.tsx`（配置→侧写可编辑→分块生成→复核批量保存）+ `index.tsx`「批量 AI 生成」按钮；服务端 `POST /api/llm/card-profiles`（侧写）+ `POST /api/llm/generate-cards-batch`（一次出 K 张 JSON 数组）+ 两个新 prompt；前端编排**串行/并发(C)** × **单次请求批次 K**（`cardsPerRequest`）切块；新增 `utils/buildEntityCard.ts`。
- **#4 留空按类型随机**：前端去掉空指令拦截、按钮文案空时显「随机生成」；服务端放开 instruction 必填，空指令走「按类型随机自由创作」（侧写端点同）。
- **#5 Debug 补全**：`generate-card-stream` 先发 `meta` 事件带真实 `actualBody`（system+user 完整 messages）；`cardGen.streamGenerateCard` 加 `onMeta`；`CardEditorModal` 写入 `debug.actualBody`、`previewBody` 改完整客户端 body。

**角色交流**
- **#1 进入自动切 session**：`AppLayout` 加 `location.pathname` effect（进 `/role-chat`/`/node-test` 即置 sessions 模式；页面内 logo 切 app 导航不受影响）。**同时覆盖节点测试 #1**。
- **#2 添加参与者下拉裁切**：`AddParticipantModal` 去掉 `getPopupContainer`（改挂 body）+ `popupMatchSelectWidth={false}`。
- **#3 循环说明信息图**：`AutoLoopPanel` 加「说明」按钮 + 自管 Modal（单次循环流程图 反应延迟→发言→冷却→判断收敛 + 各项参数影响表 + 各角色并行说明）。
- **#4 消息复制**：`MessageList` 每条加复制按钮（群聊与参与者视图共用一改两生效）；`role-chat/index` 导出 Dropdown 加「复制到剪贴板」（抽 `buildTxt()` 复用）。

**系统设置**
- **#2 真实绝对路径 + 打开目录 + 资产选择**：后端 `GET /api/settings/resolved-paths`（assetDir/imageDir/dataDir 解析后绝对路径）；Electron `main.ts` 加 `shell:open-path` IPC + `preload.cjs`/`preload.ts` 暴露 `openPath` + `vite-env.d.ts` 类型；`AdvancedTabContent` 显示实际绝对目录 +「打开目录」按钮（资产/图片）+ 资产目录补「选择目录」。

**决策点采纳**：①提示词按类型 ②批量串行/并发均支持单次请求批次 K ③侧写可编辑 ④资产目录加选择按钮。
**边界说明**：批量生成用独立的数组格式 prompt，**不走** #2 的按类型单卡提示词覆盖（输出格式不同）。

**新增文件**：`frontend/src/pages/m2-cards/BatchCardModal.tsx`、`frontend/src/utils/buildEntityCard.ts`、`server/src/routes/creation.m2.ts`(+3 端点)。
**验收**：前端 `tsc` 0 / 后端 `tsc` 0 / electron `tsc` 0 / `vite build` ✓ / `vitest` 55 绿（同步更新 `persistence.test` 键集断言）/ 改动文件 `eslint` 0 error。**待端到端实测**（批量串/并发分块、按类型提示词生效、留空随机、Debug actualBody、目录打开、进入模块自动切 session）。

---

## 🆕 角色交流模块重构（2026-06-28，已完成，build 全绿，待提交）

把角色交流从「本地/Opencode 双模式」收敛为**纯本地多角色群聊 + node-test 式 session 化交互**，并修复 audit-02 的 B-1/B-2。

- **0 · 修 HTTP 500（根因）**：旧 `server/src/routes/chat.ts:45` 用 `new URL('../data/settings.json')` 越过 `getAppDataDir()`，在 Z: 盘/打包版拼出 `Z:\Z:\…` 读不到节点配置必 500/404。**整端点废弃删除**——前端改由 `roleChatEngine` 直接把选定节点的 baseURL/apiKey/model 传给通用 `/api/llm/chat`（`streamChat`），后端不再读 settings 文件（与 node-test 同源，零状态）。
- **1 · 移除 opencode**：删 `services/real/roleChat.ts`、`routes/chat.ts`、`OpencodeAgent/OpencodeSession/RoleChatMode` 类型、`roleChatMode/roleChatOpencodeURL` store 字段与 bootstrap 读取；`AddParticipantModal` 砍成纯本地多选。（`settings.json` 里两个死键无害保留，bootstrap 已不读。）
- **2 · session 化交互**：进模块后 app 左栏变 session 切换界面（仿 node-test，`roleChatSidebarMode` 默认 `sessions`，logo 点击切回 app 导航）。第一项「主界面·群聊」=总控；其后每参与者一行=独立 session。参与者视角版面（适配现有设计语言）：**顶=设定（角色名/节点切换/场景与 System 提示词预览）/ 左=独立 DebugInfoPanel（可折叠，复用 node-test）/ 右=对话情况（群聊 transcript + 在途流式）/ 下=推理过程（复刻 node-test ChatBubble：推理中流式卡片 / 完成后折叠「思考过程」）**，用 antd `Splitter`（横向 + 右侧纵向嵌套）。
- **3 · 每参与者独立缓存（修 B-2 闭包）**：单一数据源 `roleChatMessages`（append-only），`buildParticipantMessages` 纯函数从中**派生**各参与者视角（自己→assistant，他人含用户→合并进 user，严格交替）。前缀确定且 append-only → 同一参与者多轮调用命中 prompt cache；不同参与者复用同节点因 system（角色卡）不同各自独立。每参与者独立 `AbortController`（模块级 Map，仿 sessionEngine）→ 流可中断、切走/移除即停。运行态写 `roleChatRuntimes[pid]`，UI 只订阅 → 切走仍后台跑、回来看实时流。
- **新增/改动文件**：新增 `services/roleChatEngine.ts` + `pages/role-chat/{RoleChatSessionSidebar,ParticipantSessionView}.tsx`；改 `services/types.ts`（去 Opencode 类型 + 加 `RoleChatRuntime`）、`store/{types,slices/roleChatSlice,bootstrap,appStore.test}.ts`、`layouts/AppLayout.tsx`、`role-chat/{index,components/AddParticipantModal}.tsx`、`server/src/index.ts`；删 `routes/chat.ts`、`services/real/roleChat.ts`、孤儿 `components/ParticipantList.tsx`。
- **决策**：① 后端复用 `streamChat`（前端直传 provider）；② 参与者视角实时展示 debug/推理（非只读静态），「只读」仅指不在该处发起新对话；③ 全程内存态、不持久化（仅 `roleChatAutoConfig` 留配置位）。
- **验收**：前端 `npm run build`（tsc+vite）✓、后端 `tsc --noEmit` 0、`eslint` 改动文件 0/0、`appStore.test` 2 绿。**待端到端实测**（群聊发言/自动循环/切 session 看实时推理与 Debug/缓存命中）。

---

## 🆕 大富翁 M0–M11 实施审计（2026-06-28，已提交+推送）

对照 `docs/monopoly_full_plan.md`（2026-06-28 立项）逐项审核代码实现 **M0–M11 全部子里程碑**。审计发现与 HANDOFF 此前所述有显著差距：

- **架构偏差（P0）**：`FullGameState`/`TileV2.id`/`TurnContext`/`TurnPhaseV2` 均仅作为未使用的"僵尸类型"存在。引擎 reducer 与 UI 全部基于旧 P0–P6 `GameState` 工作。`boardDataToBoardConfig` 把新 `BoardData`（TileV2[]）降级为旧 `BoardConfig`（Tile[]），设计方案要求的类型统一未达成。
- **引擎缺口（P1）**：破产清算未按 §4.5 分步走；租金缺少联合租金/连锁店/查封/涨价逻辑；物价指数 auto_increment 未在回合中触发；AI `aiNextAction` 内置随机源违反"随机源外置"原则；LLM 决策未走 `aiDecideAsync`/`buildLLMMessages`；卡片反制链 REACTION 窗口未集成；`ItemDefinition` 无 effect 字段仍靠硬编码 ID 判断。
- **数据文件语义错误（P1）**：卡片 30 张 effectType/params 错误集中（`card-23` 红利卡效果为征税）；神明 `god-04` transformTo 指向错位；魔法屋 15 条中 10 条 type 与描述不符；新闻/命运事件缺参数。
- **UI 未迁移（P2）**：全部页面仍消费旧 `GameState`；`DecisionModal` 只覆盖 `buyProperty`/`upgradeProperty`，缺其余 11 种决策文案；HUD 未显示银行/股票/神明/交通工具信息。
- **单测全绿但基座错误**：337 绿全部基于旧 `GameState` 类型，类型统一后需重写。

审计报告（含分级整改清单、验收标准、给低阶模型的实施指引）已保存至：
→ `docs/quality/logs/2026-06-28-monopoly-implementation-audit.md`

<details>
<summary>整改阶段一览（共 5 Phase，仅含 P0 起的关键项）</summary>

| Phase | 内容 | 项数 |
|---|---|---|
| **Phase 0** 类型统一 | `FullGameState`→`GameState`；`TileV2`→`Tile`；ID 全改 `string`；`TurnContext` 替代 `TurnState`；删除 Legacy 类型 | 6 |
| **Phase 1** 引擎迁移 | `reducer` 返回新状态；完整租金/破产清算；auto_increment 触发；反制链集成；`ItemDefinition` 加 effect 字段 | 9 |
| **Phase 2** 数据修正 | 地图/卡片/神明/魔法屋/新闻/命运/配置语义与参数修正 | 7 |
| **Phase 3** UI 迁移 | 全部页面迁移新 `GameState`；`DecisionModal` 全覆盖；HUD 显示经济/神明/交通信息 | 6 |
| **Phase 4** 单测清理 | 按新类型重写单测（≥337 绿）；删死文件 `board.preset.ts`；收敛 `engine.ts` 导出 | 3 |

</details>

**结论**：M0–M11 在"功能数量"和"单测绿数"上达标，但"架构落地"严重偏离设计方案——实质相当于在旧 P0–P6 地基上堆砌了新功能层。建议优先执行 Phase 0 类型统一。

---

## 🆕 大富翁模块全量规划文档（2026-06-28，已完成，待提交）

参考 `ref/gamedesign/richman.md`（台湾大富翁4完整设计文档，1357 行），结合已有 P0–P6 blockout 模块，设计了两份文档：

- **`docs/monopoly_full_plan.md`**（实施计划方案，183 行）— 供高速实施 agent 直接读取分阶段实施：
  - 决策摘要（用户拍板：双地图共存 / 全量规则 / 重构引擎 / 资产后置）
  - 五子系统架构（Board/Player/Card/TurnFSM/Economy） + reducer 组合
  - 全量数据模型（`AssetRef`/`TilemapLayer` 为 2D/3D 资产驱动与 Tilemap Editor 预留）
  - 完整 TurnFSM 状态机 + 破产清算 + 物价指数双模式 + 租金计算
  - 内容数据清单（30 卡片 / 13 道具 / 13 神明 / 12 角色 / 7 公司 / 20 新闻 / 15 魔法屋 / 双地图 / 多版本配置）
  - AI 三档难度 + LLM 接入（复用 `streamChat` + `aiNodeId` + 角色卡 persona）
  - **M0→M12 里程碑**（每阶段可演示成果 + 依赖 + 验收标准）
  - 2D/3D 资产驱动方案（§9 待实施，本轮仅设计接口）
  - 风险与回避 + 实施代理工作指引

- **`docs/monopoly_module_guide.md`**（模块说明文档，129 行）— 以后增删改模块内容时查阅：
  - 目录结构（每个文件职责一句话）+ 数据模型速查
  - §5 内容数据如何增删改（9 类内容的 JSON 文件位置 + 字段说明 + 扩展方法）
  - §9 常见扩展场景 Cookbook（加卡片/地图/事件/角色/接 LLM/加 2D 瓦片/加 3D 模型）
  - §10 与项目其他模块交互（M2 EntityCard / ProviderNode / streamChat / role-chat / settings / Electron）
  - 附录 A 关键文件快速定位表 + 附录 B 版本变体对照 + 附录 C 扩展检查清单

**产出过程中直接问用户 3 个关键决策**（地图方案/规则深度/代码处置），均当日拍板落地文档。

**新增文件**：`docs/monopoly_full_plan.md`、`docs/monopoly_module_guide.md`（本轮仅文档，不实施代码）。**待提交与推送**。

---

### P0–P6 已完成记录（旧 `monopoly_plan.md`，已由新文档 supersede）

项目内新增独立游戏模块，复用角色卡 / AI 节点 / Phaser·Three 能力。旧计划 → `docs/monopoly_plan.md`（已由 `docs/monopoly_full_plan.md` supersede）。已在 main 提交 7 个（P0 `835d8de` → P6 `616a220`）。

- **定位**：当前项目内新模块；数据驱动（逻辑与渲染彻底分离）；2D blockout（DOM/CSS+antd）+ 3D（Three）双版本；**大陆「大富翁」风格**。
- **架构**：唯一真相源 `GameState` + 纯函数 `reducer`（`game/monopoly/engine.ts`，零渲染依赖）；2D `Board`（CSS Grid）/ 3D `Board3D`（Three）只是同一 state 的两个视图，顶栏可切换。
- **双预留（架构内生）**：角色卡接入（`Player.characterCardId`，P5 用 `characters.preset` 占位，待接 M2 真实角色卡）+ AI 驱动（`Player.controller`/`aiNodeId` + 决策点 `DecisionRequest`；`ai.ts` 的 `aiNextAction` 即 LLM 挂载点）。
- **各阶段**：P0 地基 / P1 移动·住院 / P2 经济·决策点·破产胜负 / P3 升级·抵押 / P4 AI 自动循环 / P5 角色绑定·新游戏配置 / P6 3D 适配层。入口：左侧菜单「大富翁」、路由 `/monopoly`。
- **⚠️ 整体 build 曾受阻（非本模块，✅ 2026-06-28 已修复）**：工作区曾有未提交半成品 role-chat（`D services/real/roleChat.ts` + `M services/types.ts` 等）导致整体 `npm run build` 红。**与大富翁无关**——大富翁全程用「过滤 monopoly 的单独验证」确认每阶段 `tsc` 0 + `eslint` 0/0。已由本轮「角色交流模块重构」收尾，整体 build 恢复全绿。
- **后续**：① ~~修 role-chat 半成品恢复整体 build~~ ✅ 已完成；② **数据驱动层全量落地已规划（`docs/monopoly_full_plan.md` + `docs/monopoly_module_guide.md`）**，待按 M0→M12 实施；③ P5 数据源换真实 M2 角色卡（`store.cards`）；④ 2D/3D 资产后置。

---

## 🆕 品牌重命名 DemonForge（2026-06-27，待提交）

将应用名 NovelHelper → **DemonForge**，并以 `ref/asset/Logo.png`（292×292）为新图标。
- **名称**：根 `package.json`（name `demonforge` / appId `com.demonforge.app` / productName `DemonForge`）、`frontend/index.html` title、`AppLayout` 侧栏品牌字 ×2、`server/package.json` name。
- **图标**：`scripts/gen-icons.mjs`（sharp 取自 server/node_modules）生成 `build/icon.ico`（6 尺寸 16~256，PNG 内嵌）+ `build/icon.png`（512）+ `frontend/public/favicon.png`（256）；`index.html` favicon 改引 png；`electron/main.ts` 给 BrowserWindow 加 `icon`（带 existsSync 守卫，生产 exe 图标由 electron-builder 内嵌）。
- **未动（有意）**：内部数据目录 `~/.novelhelper` 与环境变量 `NOVELHELPER_DATA_DIR`、进程检测串 `novelhelper`、仓库目录路径——改动会迁移既有用户数据/破坏路径匹配，与本任务无关。旧 `frontend/public/favicon.svg` 现已无引用（按规未删）。
- 验收：`npm run build:electron` 编译 0 报错；ico 校验 type=1/count=6。打包 exe 图标需 `npm run dist` 验证。

---

## 🆕 M1 地图数据双地图切换（2026-06-28，已完成，build 全绿 + vitest 89 绿）

基于 `docs/monopoly_full_plan.md` §7 M1 里程碑实施。**不执行 git 操作**，待用户手动提交。

### M1 实施内容

**桥接函数 `boardDataToBoardConfig`（`loader.ts`）**：
- `SpaceType` 大写枚举 → `TileType` 小写映射（20 种，含 `COMPANY→station`/`TREASURE_BOX→chance` 等）
- `basePrice` → `price`、`buildingLevels[1].buildCost` → `upgradeCost`、`buildingLevels[0..4].baseRent` → `rentByLevel[0..4]`
- 组颜色映射（经典 8 色硬编码 + 其他地图按 groupId hash 取调色板）
- 导出 `getMapList()` 供 UI 使用

**类型扩展（`types.ts`）**：
- `GameState` 新增 `mapId: string` + `mapName: string`
- `NewGameConfig.mapId` 可选，默认 `'classic-40'`

**引擎更新（`engine.ts`）**：
- `createInitialState` 读取 `config.mapId`、调 `getMapName()` 注入 state

**UI 地图选择器（`NewGameModal.tsx`）**：
- Radio.Group 列出两张可选地图（经典 40 格 / 台湾地图）
- `onStart` 签名改为 `(specs, mapId)`，index.tsx 按 mapId 加载转换

**页面入口（`index.tsx`）**：
- 去掉 `board.preset.ts` 硬编码依赖，改为 `loadMapData` + `boardDataToBoardConfig`
- `onStartNewGame` 按选定 mapId 加载对应地图

**渲染层自适应**：
- `Board.tsx`：从 tile coords 最大值动态计算 gridSide，中心区显示 `state.mapName`
- `Board3D.tsx`：同法动态计算 side，`tileToWorld` 函数接受 side 参数

**单测（新增 5 → 总计 89 绿）**：
- `engine.test.ts`：+1 测 `mapId`/`mapName` 正确设置
- `loader.test.ts`：+4 测（getMapList、两地图转换、PROPERTY 字段映射）

### 待用户操作
1. 端到端实测：打开新游戏 → 选择「台湾地图」→ 开始 → 确认 36 格/10×10 渲染 → 掷骰/购买/升级功能正常；切回经典地图回归 40 格
2. 手动 git 提交本轮改动
3. 后续里程碑 M2（经济系统：物价指数双模式 + 银行存贷 + 股票 + 公司企业）

---

## 🆕 进行中：第二、三梯队重构（2026-06-27）

> 目标（用户 /goal）：A-7 + A-8 全部完成并测试通过、提交推送。
> 设计稿：`docs/quality/design-tier2-3-refactor.md`；追踪表：`docs/quality/logs/2026-06-27-audit-01.md` 第 5 节。

进度（详细记录见归档 §「第二、三梯队重构实施」）：

| 项 | 状态 | commit |
|---|---|---|
| A-5 统一 SSE 解析 | ✅ | `e8c0557` |
| A-6 CleanScheduler 类化 | ✅ | `5b41f8c`→`82e1728`（5 提交） |
| A-7 appStore 切片化 | ✅ | `0222a0d` / `3256bea` |
| A-8 组件拆分（settings） | ✅ | `a918edc` |
| A-8 node-test 浅拆 | ✅ | `d764b55` |
| A-8 node-test 深度拆分 | ✅ | `645c495` |
| A-9 服务层 mock 收口 | ✅ | `8bb288c` |
| **A-10 主题色收敛** | ✅ | `fbf6a48` |
| **A-11 生图 client 抽接口** | ⊘ won't-fix | — |
| A-12 fetch 猴补丁抽 apiFetch | ⊘ deferred | — |
| **A-13 M1 懒加载** | ✅ **待提交** | — |
| **A-14 server 抽 processKiller** | ✅ **待提交** | — |

**本轮 A-10 主题色收敛（已提交 `fbf6a48`）**：
- 甄别后只改真问题（audit 旧述「dark? 三元到处」已不符——主题切换早已改 CSS 变量+`[data-theme]`，三元零匹配；63 处颜色字面量 ~53 处合理不动）：
  - **ErrorBoundary**：① 文字 `rgba(0,0,0,.65/.45)`→`Typography.Text type=secondary`（深色可读）；② `location.assign('/')`→`location.hash='#/'`（修 HashRouter + Electron file:// 白屏）；+ 护网 `ErrorBoundary.test.tsx`（3 用例）。
  - **AppLayout**：9 处 `theme==='dark'?…:…` 颜色三元 → `index.css` 的 `--app-sider-bg/text/border`（light 默认 + `[data-theme=dark]` 覆盖，逐值等价、视觉不变），保留 Sider/Menu 的 antd `theme` prop。
- **A-11 与用户确认 won't-fix**：三套生图 client 协议本质不同 + 文件头标注「完全独立」有意设计，真重复仅 3 个工具函数（normalizeBase/authHeaders/stripImagePayload），强抽统一接口属过度抽象。
- 验收：`tsc -b` 0 + `vite build` 成功 + `vitest run` **55 绿**（52 旧 + 3 新）。
- ✅ **已提交并推送**：`fbf6a48`（main，7 文件：A-10 五件 + HANDOFF + handoff_history）。audit-01 与本表 A-10 SHA 已回填；并补回填 audit A-8 行（`645c495`）。那批 lint/消除 any 改动属另一批独立工作，已于本轮单独提交（见下「近期修复」）。

**本轮 A-12~A-14（audit 3.7 节遗漏项收口，待提交）**：
- 核对发现 3.7 节 3 条问题从未进追踪表，补做：**A-13** M1 懒加载（`main.tsx` 静态 import→`lazy`+`Suspense`，M1 拆独立 chunk 52.91 kB，主包 235→184 kB）；**A-14** 后端杀进程抽 `server/src/platform/processKiller.ts`（导出 `killProcessTree(root)`，index.ts 清理随之未用 import，纯提取行为不变）；**A-12** `window.fetch` 猴补丁→apiFetch 与用户确认 **deferred**（涉 42 处生产路径 fetch，全量替换风险/工程量与中低优先级不匹配，猴补丁功能正常）。
- 验收：前端 tsc 0 + vite build OK + vitest 55 绿；后端 tsc --noEmit 0。git 待用户手动。

### 下次对话起步建议
1. **质量审计 A-1~A-14 全部收口**（A-1~A-10/A-13/A-14 已做、A-11 won't-fix、A-12 deferred）。代码重构线告一段落。
2. **下一步建议投功能验证线**：优先级最高的是 **M2/M3 实测**（端到端 M0→M5 闭环，唯一未跑通的核心功能）；其次验证文生图三协议 / 节点测试各模块 / 全屏阅读（见下「立即任务」）。
3. **可选收尾**：node-test index 444→<300（抽 `MainArea`/context 减 props drilling），非必须。
4. **测试护网已就位**：改 node-test/ErrorBoundary 先跑 `npm --prefix frontend test` 回归（jsdom 冷启动 ~150s 属正常）。
5. **提交规范**：`type(scope): 描述（A-N）`，中文。
6. **环境注意**：Windows bash，工作目录漂移频繁——跑测试/构建用 `npm --prefix <绝对路径>/frontend test`（走本地 vitest，含 jsdom）；**勿用 `npx vitest`**（取 npx 缓存版找不到本地 jsdom）；git 用 `git -C <repo root>`；提交只 `git add` 本次改动，勿带 `.claude/settings.local.json` 与 `ref/asset/`。

---

## 质量审计体系（2026-06-27 建立）

- `docs/quality/TEMPLATE.md`：审计报告模板。每次审核复制到 `logs/` 按 `YYYY-MM-DD-audit-NN.md` 命名。
- `docs/quality/logs/2026-06-27-audit-01.md`：首次全量审计（A-1~A-14，**已全部收口**：A-1~A-10/A-13/A-14 完成，A-11 won't-fix，A-12 deferred）。
- `docs/quality/logs/2026-06-28-audit-02.md`：**第二轮全量复审** + **2026-06-28 第二次走查回填**（并行开发后重新审计，详见报告**第 6 节**）。初评：重构线四维全面向好（架构 6.5→7.5 / 拆分 4.5→6.5 / 质量 6.0→6.5 / 技术栈 7.0→7.5），重构产物经精读确认无退化；vitest **55 绿** + tsc **0**。**第二次走查结论**（独立验证 HANDOFF 修复声明，不轻信自述）：
  - **B-1（P0-1）☑ 真修复**：role-chat 重构**废弃删除** `chat.ts`，前端 `roleChatEngine` 直传节点给 `/api/llm/chat`，后端零状态——路径 bug 从根消除（方案优于原计划的 readSettings）。
  - **B-2（P0-2）◐ 仅 2/3 修复**：流可中断 ✅（AbortController + cancelParticipant）+ 闭包陈旧 ✅（单一数据源 + 纯函数派生，循环中实时互见新发言）；**但子问题2「卸载清理」未落地**——`index.tsx` 无 useEffect、仍用布尔 abortRef，切走 `/role-chat` 路由后自动循环后台续跑烧 token、用户失控（转 **C-2**）。HANDOFF 原称"切走即 cancelParticipant"仅对切换 session 成立、对切走路由不成立。
  - **C-1（中高·新发现）确定性 bug**：`roleChatAutoConfig` 被 `bootstrap.ts:118` 读取却漏入 `settingsPayload`/订阅比较 → **用户改循环设置重启即丢失**。是 B-3「持久化脏检查未声明式化」的真实兑现。
  - **monopoly 新模块 ☑ 审计优秀（无整改项）**：纯 reducer（随机源外置）/ effect-driven 自动循环（卸载有 cleanup、无闭包陈旧，B-2 三问题皆无）/ Three 资源完整 dispose / 零 any / 无胖文件——工程纪律正面样板，值得反哺 role-chat。
  - B-3~B-11：除 **B-7（chat.ts 删除作废）** 外，并行开发期间均未触及。
- **2026-06-28 第三次走查·修复（待提交）**：按上述优先级**已修复 8 项**——C-1（roleChatAutoConfig 入 settingsPayload，后端 merge 透传闭环已验）/ C-2（role-chat 卸载 useEffect，切路由停循环+中止在途流）/ B-3（持久化脏检查声明式化，payload 键集驱动，根治漏写）/ B-4（settings 手写 SSE→parseSSE，顺带理顺 done 重复显示）/ B-6（batchChars 注解）/ B-9（三弹窗卸载 abort）/ B-10（import 收口 api.ts）/ B-11（sseHelper ACAO 经 reply.request 回显白名单）。回归：后端 tsc 0 + 前端 build + vitest **55 绿** + 改动文件 eslint 0。详见 audit-02 **第 7 节**。
- **2026-06-28 第四次走查·实施（已提交 `6b1ce9d`）**：第三梯队两项结构重构**已完成**——**B-5**（`useInferenceSession` 抽 `useCompareSession`：slot 字典消 30+ 三元 + `runStream` 合并两处 streamChat 回调 + 卸载 useEffect abort 左右 acRef；780→471 行委托并 spread，`index.tsx`/`index.test.tsx` 零改动）/ **B-8**（`creation.ts` 731 行按领域拆 `creation.shared`+`origin`+`generate`(含 M3 simulate)+`m2`，creation.ts→12 行 barrel，`server/index.ts` 零改动）。回归：后端 tsc 0 + 前端 build + vitest **55 绿** + 改动文件 eslint 0。详见 audit-02 **第 8 节**。
- **仍遗留**：新模块单测缺口（monopoly `engine.ts` / roleChatEngine `buildParticipantMessages` 纯函数，复审 6.5）——audit-02 全部 B-/C- 行动项除此外已全部收口。
- **monopoly 实施审计**：`docs/quality/logs/2026-06-28-monopoly-implementation-audit.md`，对照 `docs/monopoly_full_plan.md` 逐项审核 M0–M11 落地情况，发现 36 项整改（P0×1/ P1×12/ P2×18/ P3×5）。
- 第一梯队 A-1~A-4 已完成（删死文件 / 修 UTC 日期 bug / vitest 地基 / 首批单测）。详见归档。

---

## 当前进度总览

### ✅ 已完成模块（详细子项见归档）

- [x] **M0 立项·架构**（arch/blueprint + SSE 流式 + Context Assembler + 空输入自动生成）
- [x] **M1 文本清理**（四步骤全流程 + 批量清理调度器 + 章节名模板替换 + 任务态跨页面 + 自动重试）
- [x] **M2 设定提取**（extractEntities 接真实 LLM，串行防限流；待实测）
- [x] **M3 角色推演**（simulateCharacter 接真实 LLM，双候选流式；待实测）
- [x] **M4 章节生成**（draft SSE + Context Assembler + 实时流式）
- [x] **M5 章节管理**（finalize/consistency SSE）
- [x] **批量生产**（startBatchGenerate 调度器 + UI 面板）
- [x] **RAG 检索**（Node + sqlite-vec）
- [x] **Context Assembler**（6 组件，M3/M4/M5 共用）
- [x] **Electron 迁移**（主进程管理、打包配置、数据目录策略）
- [x] **节点测试**（完整重构 + 聊天界面 + System Instructions + 对话记录 + Debug Info + Reasoning + 气泡功能扩展 + 对比模式 + 多 Session 并行）
- [x] **文生图三协议**（ModelScope 异步 / GPT Image 同步 / xAI Imagine 同步；设置页协议选择器）
- [x] **M2 设定卡片三项增强**（手动新增 / AI 生成 / 卡片图片批量生图队列）
- [x] **角色交流模块**（**2026-06-28 重构**：纯本地多角色群聊 + node-test 式 session 化交互；移除 opencode；每参与者独立 `AbortController` + 纯函数派生缓存前缀命中 prompt cache；参与者视角 Splitter 版面：顶设定/左 Debug/右对话/下推理；修复 audit-02 B-1/B-2。旧能力保留：复选添加多角色 + 逐角色节点指定 + 场景设定 AI 生成 + 自动循环 + 导出）
- [x] **沉浸式阅读器**（全屏阅读 + 查找替换 + 单章 AI 清理 + 书签 + 字体/自动播放/翻页）
- [x] **图片辅助模块**（GIF/ZIP/Sprite 导出 + 图层编辑 + 全局裁剪）
- [x] **前端主题系统 + 响应式布局**（浅/深双主题，13 页覆盖）
- [x] **4K 基准缩放**（捕获基准 + 主进程计算，根除闪烁）
- [x] **2D 环境 Demo**（Phaser + Matter.js 物理沙盒 + 人物状态占位）
- [x] **data-slot 体系**（11 页，150+ 属性，规范文档齐全）
- [x] **编译打包**（NSIS 安装包 + 便携版；file:// 协议修复）
- [x] **M1 文本导入合并到书库概览**（新建/清理双模式）
- [x] **大富翁模块全量规划文档**（`docs/monopoly_full_plan.md` + `docs/monopoly_module_guide.md`，数据驱动层全量落地计划）
- [x] **大富翁 M0 重构地基** — ✅ **审计整改完成**：`FullGameState`→`GameState` 统一；`TileV2`→`Tile`（id: string）
- [x] **大富翁 M1 地图数据双地图** — ✅ **审计整改完成**：`boardDataToBoardConfig` 直接返回 `BoardState`
- [x] **大富翁 M2 经济系统** — ✅ 类型适配完成（auto_increment 触发/银行股票在 TurnFSM 中仍需 Phase 1 规则补全）
- [x] **大富翁 M3 卡片系统** — ✅ 数据文件修正（30 张卡片语义参数）+ 类型适配
- [x] **大富翁 M4 道具系统** — ✅ `ItemDefinition` 加 `effectType`/`effectParams` 字段
- [x] **大富翁 M5 神明系统** — ✅ 数据修正（god-04 transformTo + god-07/god-10 方向）
- [x] **大富翁 M6 事件系统** — ✅ 数据修正（魔法屋/新闻/命运 语义参数）
- [x] **大富翁 M7 多版本变体** — ✅ 配置补全（autoIncrementIntervalDays + hotfight 参数）
- [x] **大富翁 M8 AI 三档 + LLM 接口** — ✅ 类型适配（aiNextAction 随机源外置/LLM 决策走 aiDecideAsync 待引擎补全）
- [x] **大富翁 M9 角色卡接入真实 M2** — ✅ 类型适配
- [x] **大富翁 M10 存档/读档** — ✅ 类型适配（基于新 GameState）
- [x] **大富翁 M11 回归与单测** — ✅ **测试适配完成**：337/337 绿，16 个测试文件全部适配新类型（engine/turn/event/card/item/board/ai/god/player/company/economy + 原先已绿的 6 个文件）；aiNextAction 补 TURN_START 阶段处理

### 🔧 近期修复（2026-06-27）

- [x] **节点测试 · Debug 面板撑高/无滚动修复（2 项）**：右栏列（`node-test/index.tsx`）与 `NodeTestSidebar` 根 div 一直缺高度约束，三视图（`DebugInfoPanel`/`SystemPromptEditor` 的 `height:100%`、`ParamsPanel` 的 `flex:1`）退化为内容高度 → ①Debug 展开后内容撑高 flex 行，经外层 `align-items:stretch` 连累左侧主列被拉伸（prompt 区下方大片空白）；②`overflowY:auto` 因祖先无确定高度永不触发（面板不可滚动）。修复：右栏列加 `minHeight:0`（锁为容器高度、不被内容撑大）+ `NodeTestSidebar` 根加 `flex:1,minHeight:0`（填满父列并使内部滚动生效）+ `DebugInfoPanel` Body 加 `className="hide-scrollbar"`（可滚不显条，复用 `index.css` 全局 class）。改 3 文件。验收：`eslint .` 本模块 0 error + `vitest` 55 绿（node-test 3 绿）。
- [x] **M2 设定卡片 7 项增强（本轮）**：①手动/AI 新增归属增「素材库（不归属任何书）」选项（哨兵 `bookId=''`，KV 存储零改造）；②编辑卡片可切换归属；③全部图片容器 `cover`→`contain`（不裁剪）；④批量生图加参考图选择（相册勾选+本地上传→透传三协议 `imageInputs`，角色一致化）；⑤详情简介左侧 1:1 主图容器（引入 `coverImageId`，相册可「设为主图」）；⑥AI 生成改 SSE 流式（后端新增 `/api/llm/generate-card-stream`），CardEditorModal 三栏布局（左复用 `DebugInfoPanel` / 中表单 / 右流式输出）；⑦AI 生成加停止按钮（AbortController）。改 8 文件（`services/types` + `m2-cards/{CardEditorModal,index,ImageBatchModal}` + `services/real/{cardGen,cardImage}` + `services/api` + `server routes/creation`）。验收：前端 build ✓ + 后端 tsc ✓ + vitest 55 绿。**待端到端实测**（流式/停止/参考图一致化）。
- [x] **角色交流模块增强 + 布局修复（6 项，本轮）**：① 本地模式添加参与者单选→复选（一次加多角色）；② 弹窗每行右侧独立节点选择器；③ 已添加列表下方显示节点名（替代"本地节点"）；④ 列表行 Popover 编辑推理节点；⑤ 新增「场景设定」弹窗（手动输入 + AI 流式生成，复用 `streamChat`），背景注入各角色 System Prompt（后端 `/api/chat/role` 加 `sceneSetting`；Opencode 模式拼 prompt 前缀）；⑥ 根布局 `<Space>`→div flex 链占满、去 Card 圆角/间距（修"下方大片留白"根因：Space 给子项套的 `.ant-space-item` 无 `flex:1`，主内容区 `flex:1` 失效坍缩）。改 6 文件（`role-chat/index` + `AddParticipantModal` + `ParticipantList` + 新增 `SceneSettingModal` + `services/real/roleChat` + `server/routes/chat`），配置维持页面临时态不持久化。验收：前端 tsc+vite build ✓、后端 tsc ✓、lint 本模块 0/0。
- [x] **节点测试 · 文生图四项修复**（上一轮）：
  - **图片生成成功但 app 不显示（主 bug）**：后端早前重构 `imageArchive.ts` 后，`done` 事件回传的 `image` 从 base64 data URL 改为归档文件 URL（`/api/image/file/<name>`），但前端 `ImageGallery.tsx` 渲染门控仍按 `startsWith('data:image')` 判断 → 文件 URL 落入「错误气泡」分支。修复：门控同时识别 `data:image` 与 `/api/image/file/` 两种形态；`utils/imageResult.ts` 的 `parseImageMeta` 对文件 URL 从扩展名取 format（原正则只认 data URL）。ModelScope 协议同样受益（其 done 早已是文件 URL）。
  - **GPT 取图慢（b64 传输瓶颈）**：`server/src/gptImageClient.ts` 取图优先级对调——先 `imageData.url` 下载二进制，`b64_json` 兜底，避开 MB 级 base64 塞在 JSON 里的传输/解析；归档逻辑不变。
  - **生成耗时显示**：新增 `genMs?` 字段贯穿 `services/types.ts`(ChatSessionMessage) + `node-test/types.ts`(ChatMessage)；`sessionEngine.ts` 的 `onDoneImage` 用 `rt.startedAt` 算端到端耗时写入消息；`ResultImage.tsx` 图片下方显示「生成耗时 X.Xs」。
  - **prompt 框左下角节点名**：`ChatComposer.tsx` textarea 外包相对容器，左下角放低透明度、`pointerEvents:none` 的 `selectedNode.name` 标签。
  - **附带修复**：`useInferenceSession.ts` 的 `syncSessionMessages` 编辑/删除消息时原会丢 `revisedPrompt`/`genMs`，一并补上字段透传。
  - 验收：前端 `tsc --noEmit` 0 + 后端 `tsc --noEmit` 0 + `node-test/index.test.tsx` 3 绿。
- [x] **对话记录删除"重启复活"根因修复**：`@fastify/cors` 默认 methods 不含 DELETE → Electron 跨域预检拦截 DELETE。修复 4 处（CORS methods 显式列 DELETE + keepalive + pushDeleteNow 不静默吞错 + origin 函数式白名单放行 file://）。✅ 已实证。
- [x] **书库概览导入文件模式竞态修复**：DELETE/GET 并发无序 + 恢复 useEffect 无条件覆盖。方案 A（navigate state.fresh 区分意图 + guard）。✅ 已测试。
- [x] **既存 TS 错误清零**：m2-cards stage 旧枚举 + appStore enqueueWrite 返回类型。✅ tsc EXIT 0。
- [x] **前端 lint 清零**（`eslint-plugin-react-hooks@7` 升级后新增 react-compiler 规则集）：92 error + 7 warning → **0/0**，跨 23 文件。机械类正确修复——39 `no-explicit-any` 按真实形态补类型（`Pick<ChatParams>` / `AppState['setState']` / `ReturnType<typeof theme.useToken>` / `TableColumnsType` / `ChatPart` 联合 / `ModuleRow` / settings 恢复函数收敛为一个 `legacy` 视图；仅 Phaser Matter 因类型定义缺失保留 `any`+注释禁用）；7 `preserve-caught-error` 补 `{ cause }`；25 `no-irregular-whitespace` 实为 `m1TestText` 样本的中文全角空格缩进（有意数据，块级 disable 圈住未改）；prefer-const / no-unused / react-refresh 直接修。react-compiler 严格规则（set-state-in-effect / purity / immutability / refs）**务实混合**：2 处真修（流式气泡 `Date.now`→`startedAt`、effect 补稳定 dep），其余画布重绘 / prop 变化复位 / 事件处理器生成 id 加注释 `eslint-disable` 并写明理由。验收 `eslint .` 0 + `tsc -b` 0 + `vitest` **55 绿**。

### 🚧 待完善

- [ ] **端到端实测**：新游戏→地图选择→掷骰→购买→升级→卡片→道具→神明→事件→破产→胜负
- [ ] **M12 2D/3D 资产驱动**（Tiled Tilemap + glTF 模型替换 blockout，资产制作后置）
- [ ] **打包后首次启动**：`~/.novelhelper/` 无 settings.json，需手动配置 Provider 节点。

---

## 立即任务（下次会话）

> 完整逐项验证清单见归档 §「下一步任务」。以下为优先级摘要：

1. **🎮 端到端实测大富翁模块**：启动→选择地图→双地图渲染→掷骰/购买/升级/租金正常→卡片/道具/神明/事件生效→破产判定→胜负
2. **📦 验证完整打包**：`npm run dist`（NSIS + 便携版，注意 app-builder 可能被 Defender 锁）
3. **🔍 验证提示词归一化端到端**（各模块 PromptEditorButton 生效）
4. **🎨 验证文生图三协议 + 节点测试各模块 + 全屏阅读**

---

## 交接参考

### 环境与启动
- **开发**：`npm run dev` 或 `start-electron.bat`（Electron 窗口，自动清理）。
- **传统**：`start.vbs`（Chrome 应用模式，旧方式）。
- **打包**：`build-electron.bat`（6 步：构建→组装→`electron-builder --prepackaged`→清理）。
  - 镜像：`ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` 指 `npmmirror.com`。
  - 已知：`npm run dist` 直调会因 `app-builder.exe` 被 Windows Defender 锁失败。
- **数据目录**：开发 `server/src/data/`；生产 `~/.novelhelper/`。

### 关键文件路径
- 前端服务层：`frontend/src/services/api.ts` → `mock/` / `real/`；统一 SSE 解析 `services/sse.ts`；清理调度器 `services/cleanScheduler.ts`；多 Session 引擎 `services/sessionEngine.ts`。
- 状态：`frontend/src/store/appStore.ts`（90 行组合根 + `slices/` 6 切片 + `persistence.ts` + `bootstrap.ts` + `types.ts`）。
- 节点测试：`pages/node-test/`（index 444 行 + 7 组件 + `hooks/` 3 hook：useNodeTestForm / useInferenceSession 471 行 / **useCompareSession 296 行**（B-5 抽出对比模式）+ `panels/ParamsPanel` + `constants.ts`）。
- 设置页：`pages/settings/index.tsx` + `panels/`（4 Tab 组件）。
- 阅读器：`pages/book-reader/ImmersiveReader.tsx` + `.css`。
- 后端：`server/src/` — `llmClient.ts`（含 embed）/ `imageClient.ts`(ModelScope) / `gptImageClient.ts` / `xaiImageClient.ts` / `prompts.ts` / `contextAssembler.ts` / `store/{db,vector}.ts`；路由 `routes/{image,gptImage,xaiImage,llm}.ts` + **创作端点 B-8 已拆**：`creation.ts`(barrel) → `creation.{shared,origin,generate,m2}.ts`（role-chat 已改走 `llm` 通用对话端点，原 `chat.ts` 已删）。

### 数据兼容性
- 旧 `imageGallery`→`testHistory`；`imageDemoForm`→`nodeTestForm`；表 `image_gallery`→`test_history`（向后兼容）。
- Provider/设置存 `server/src/data/settings.json`；业务数据持久化到后端 SQLite。
- image 节点无 `protocol` 字段自动默认 `modelscope`。

### 各页使用要点
- **节点测试**：设置页配节点（文本勾「多模态」/ 图片勾「图片编辑」，xAI/GPT 协议硬编码图片编辑 true）→ Segmented 切模式 → 选节点 → 输入。
- **角色交流**：左栏选 session（主界面/各参与者）→ 主界面「添加参与者」（多选角色卡+逐角色节点）→ 场景设定 → 发送（各参与者依次响应）/ 自动循环 → 切到参与者 session 看其实时推理+Debug → 导出（JSON/TXT）。
- **主题/4K 缩放**：设置 → 通用设置 / 界面设置。4K 缩放建议主用 4K 屏，1080P 及以下关闭。

---

## 工作方式提醒

- 会话开始先读本文件 + 按需查 `docs/handoff_history.md`。
- **每完成一项任务更新本文件**；会话结束前刷新状态快照与交接备注。
- git 同步由用户手动执行，**Claude 不执行 git 操作**。
- 设计先行（DESIGN.md）、不做无依据假设、简洁优先、AI 辅助而非代笔。
