# 大富翁模块 M0–M11 实施结果 · 代码审核报告

> 依据 `docs/monopoly_full_plan.md`（2026-06-28 立项）对当前实现进行对照审计。
> 审核目的：确认 M0–M11 是否按设计方案落地；如有偏差，输出供低阶模型逐项实施的整改清单。

---

## 元信息

| 项 | 内容 |
|---|---|
| 审核编号 | monopoly-implementation-audit-2026-06-28 |
| 审核日期 | 2026-06-28 |
| 代码版本 | 工作区未提交改动（HANDOFF.md 声明 M0–M11 已完成，337 单测全绿） |
| 审核范围 | `frontend/src/game/monopoly/` + `frontend/src/pages/monopoly/` + `frontend/src/game/monopoly/data/` |
| 审核方式 | 精读设计方案 §0–§12 → 对照代码类型/引擎/UI/数据/单测；子代理并行审计数据文件与 UI；本地运行 `npm --prefix frontend test -- --run` 验证 |
| 设计方案 | `docs/monopoly_full_plan.md` + `docs/monopoly_module_guide.md` |
| 测试状态 | 337/337 绿（但测试基于旧 `GameState` 类型） |
| 严重等级 | **P0 阻塞** 1 项（类型系统未统一）；**P1 高优** 12 项；**P2 中优** 18 项；**P3 低优** 5 项 |

---

## 0. 执行摘要

### 0.1 一句话结论

**M0–M11 在"功能数量"和"单测绿数"上达标，但在"架构落地"上严重偏离设计方案**：引擎与 UI 仍运行在旧的 P0–P6 类型 `GameState` 上，设计方案要求的 `FullGameState`/`TileV2.id`/`BoardState`/`TurnContext` 仅作为未使用的"僵尸类型"存在。数据文件条目数量完整，但语义与参数错误集中。UI 尚未迁移到新类型，`DecisionModal` 未覆盖全部决策种类。

### 0.2 核心偏差（必须整改）

1. **类型系统未统一（P0）**：`GameState` 被保留为旧 P0–P6 结构；`FullGameState` 完全未被使用；`TileV2` 仅存在于 `types.ts` 和 `validator.ts`。
2. **引擎仍基于旧类型工作**：`engine.ts` 的 `reducer`/`createInitialState` 返回旧 `GameState`；`boardDataToBoardConfig` 把新 `BoardData` 降级为旧 `BoardConfig`。
3. **Tile ID 未升级为 string**：仍用 `Tile.index: number` 作为唯一标识；`Player.position`、`PropertyState.tileId`、`Action.tileId` 仍是 number。
4. **TurnFSM 未迁移到 `TurnContext`/`TurnPhaseV2`**：仍用旧 `TurnState`（phase: 'ROLL' | 'MOVE' | 'DECIDE' | 'END_TURN'）。
5. **数据文件语义/参数错误**：卡片、魔法屋、新闻、命运、神明存在描述与 effect 不符或 params 缺失。
6. **UI 未迁移到新类型**：`Board`/`Board3D`/`GamePanel`/`DecisionModal` 仍消费旧类型，`DecisionModal` 缺多种决策文案。

### 0.3 符合项

- 目录结构按设计方案建立（`engine/` 子系统、`data/` 内容文件、`__tests__/`）。
- 数据文件数量完整：30 卡片、13 道具、13 神明、12 角色、7 公司、20 新闻、15 魔法屋、12 命运、3 小游戏、2 地图、3 配置预设。
- 单测文件 20 个、337 例全绿（`npm --prefix frontend test -- --run` 通过）。
- 基础规则可跑：移动、购买、升级、抵押、租金、破产、卡片/道具/神明/事件均有实现。
- AI 三档策略、LLM prompt 构建、角色卡映射、存档序列化、双地图切换 UI 均已存在。

---

## 1. 总体符合性矩阵

| 设计维度 | 方案要求 | 实际状态 | 严重等级 |
|---|---|---|---|
| 唯一真相源 `GameState` | §3.1 全量结构（board/players/cardDeck/economy/config/turnContext） | 使用旧 P0–P6 `GameState`，`FullGameState` 未使用 | **P0** |
| `Tile.id: string` | §3.2 格子 ID 升级为 string | 仍用 `Tile.index: number` | **P0** |
| `BoardState` + `TileV2` | §3.2 地图运行时状态 | `BoardState`/`TileV2` 仅类型存在，运行时降级为 `BoardConfig`/`Tile` | **P0** |
| `TurnContext` + `TurnPhaseV2` | §4.3 全量状态机 | 未使用，仍用旧 `TurnState` | **P0** |
| `Action` 引用 string ID | §3.15 action 全量 | `PURCHASE_PROPERTY` 等仍用 `tileId: number` | **P1** |
| 破产清算流程 | §4.5 强制出售建筑→抵押→归债权方 | 仅做 `liquidate` 清空地产，缺少分步清算 | **P1** |
| 租金计算 | §4.7 联合租金/连锁店/查封/涨价/住院 | 仅基础租金，缺联合租金、连锁店全图加总 | **P1** |
| 物价指数双模式 | §4.6 `asset_based` / `auto_increment` | 函数存在，但 `auto_increment` 未在 turn 中触发 | **P1** |
| 卡片 30 种效果 | §3.4 / §5.2 | 数量 30，部分效果参数缺失或 effectType 错误 | **P1** |
| 道具 13 种效果 | §3.5 / §5.3 | 数量 13，但 `ItemDefinition` 未定义 effectType/effectParams | **P1** |
| 神明 13 种 | §3.6 / §5.4 | 数量 13，存在 transformTo 指向错误、效果方向疑似反向 | **P1** |
| 事件 7 类 | §3.9–§3.10 / §5.7 | 实现基本覆盖，但魔法屋/新闻/命运语义错误多 | **P1** |
| AI 三档 + LLM | §6 | 三档策略存在，但 `aiNextAction` 内置随机源，违反"随机源外置"原则 | **P1** |
| 角色卡接入 M2 | §3.7 / M9 | 已实现读取 `store.cards`，但角色头像预览缺失 | **P2** |
| 存档/读档 | M10 | 序列化存在，但基于旧 `GameState` | **P2** |
| UI 决策覆盖 | §3.14 | `DecisionModal` 只覆盖 buy/upgrade，缺 jail/trade/cardReaction 等 | **P2** |
| UI 经济信息显示 | §3.3 / §3.11 | HUD/面板未显示银行存款/贷款/股票/神明/交通工具 | **P2** |
| 2D/3D 资产驱动 | §9 / M12 | 仅数据结构预留，渲染未接入 `assetRef`（符合 M12 待实施计划） | 符合设计 |

---

## 2. 详细发现

### 2.1 P0 阻塞：类型系统与架构未统一

#### P0-1 `GameState` 未替换为 §3.1 全量结构

- **设计依据**：`docs/monopoly_full_plan.md` §3.1 要求 `GameState` 为唯一顶层状态，字段包括 `version/mapId/day/phase/turnContext/board/players/cardDeck/economy/config/pendingEvents/awaitingDecision/log/rngSeed/status/winnerId`。
- **当前状态**：
  - `frontend/src/game/monopoly/types.ts:654-673` 定义了旧 `GameState`（P0–P6 blockout）。
  - `types.ts:747-764` 定义了 `FullGameState`（§3.1 新结构），但全局搜索 `FullGameState` 仅 3 处命中，全部在 `types.ts` 自身，无代码使用。
  - `engine.ts` reducer 签名 `reducer(state: GameState, action: Action): GameState`，使用旧状态。
  - `pages/monopoly/index.tsx`、`Board.tsx`、`Board3D.tsx`、`GamePanel.tsx`、`DecisionModal.tsx`、`SaveLoadModal.tsx` 全部 import 旧 `GameState`。
- **影响**：
  - 设计方案中 M0 重构地基的核心目标（统一数据模型、为 Tilemap Editor/资产驱动留接口）未达成。
  - 所有 M1–M11 功能在旧模型上补丁式堆叠，`BoardData`/`TileV2` 沦为仅用于校验的静态数据，运行时又被降级。
  - M12 资产驱动无法基于旧 `Tile` 接入 `assetRef`（旧 `Tile` 无 `id` 字段，无法与 `TilemapLayer` 对象关联）。
- **整改方向**：
  1. 将 `FullGameState` 改名为 `GameState`，删除或重命名旧 `GameState` 为 `LegacyGameState`。
  2. 统一 `Player.position`、`PropertyState.tileId`、`Action.tileId` 等为 `string`（`TileV2.id`）。
  3. 统一 `TurnContext` 与 `TurnPhaseV2`，删除旧 `TurnState`/`TurnPhase`。
  4. 调整 `NewGameConfig`：移除 `board: BoardConfig`，改为 `mapId: string`（reducer 内部调用 `loadMapData`）。
  5. `engine.ts` `createInitialState` 与 `reducer` 全部迁移到新 `GameState`。
- **涉及文件**：`types.ts`、`engine.ts`、`engine/*.ts`、`pages/monopoly/*.tsx`、全部 `__tests__/*.test.ts`。

#### P0-2 `TileV2.id: string` 未实际使用

- **设计依据**：§3.2 要求 `Tile` 接口升级：`id: string`（唯一标识）、`index: number`（仅环形走动序号）、`neighborIds: string[]`（支持分叉路）。`PropertyState.tileId`、`Player.position`、`ownedTileIds` 都应为 string。
- **当前状态**：
  - `TileV2` 存在于 `types.ts:143-161`，但 `BoardData.tiles` 在运行时被 `boardDataToBoardConfig` 映射为旧 `Tile`（`types.ts:126-140`），旧 `Tile` 无 `id` 字段。
  - `PropertyState.tileId` 为 `number`（`types.ts:175`）。
  - `Player.position` 为 `number`（`types.ts:195`）。
  - `Action` 中 `PURCHASE_PROPERTY`/`BUILD_STRUCTURE`/`MORTGAGE_PROPERTY`/`REDEEM_PROPERTY` 的 `tileId` 为 `number`（`types.ts:609-614`）。
  - `boardTraps` 键为 `number`（`types.ts:669`）。
  - `engine/turn.ts`、`engine/board.ts`、`engine/item.ts` 等全部以 number 索引访问 `state.board.tiles[position]` 和 `state.properties[tileId]`。
- **影响**：
  - 设计方案中"分叉路/多拓扑地图"无法支持（旧逻辑用 `(position + steps) % size` 数组下标）。
  - M1 双地图虽能切换，但台湾地图的 `neighborIds` 未被走动逻辑读取。
  - M12 资产驱动时，无法通过 `TileV2.id` 关联 `TilemapLayer` 中的对象。
- **整改方向**：
  1. 删除旧 `Tile`/`BoardConfig`，让 `BoardData.tiles: TileV2[]` 直接作为运行时地图。
  2. 将 `PropertyState.tileId`、`Player.position`、`ownedTileIds`、`boardTraps` 键、`Action.tileId` 全部改为 `string`。
  3. `turn.ts` 走动逻辑改为：`currentTile = board.tiles.find(t => t.id === player.position)`，沿 `neighborIds` 逐格移动（兼容单一路径与分叉）。
  4. 更新全部单测用例的 fixture。

#### P0-3 `TurnContext` + `TurnPhaseV2` 未使用

- **设计依据**：§4.3 要求 `TurnContext` 含 `currentPlayerId/phase/diceResults/diceCount/moveSteps/movePath/pendingRent/pendingPurchase/cardUseWindowFor/consecutiveDoubles`，`TurnPhaseV2` 枚举 12 个状态。
- **当前状态**：
  - `TurnContext` 与 `TurnPhaseV2` 已定义（`types.ts:698-737`），但无人使用。
  - 引擎使用旧 `TurnState`：`{ currentPlayerId, phase: 'ROLL'|'MOVE'|'DECIDE'|'END_TURN', dice?, doublesCount }`（`types.ts:639-644`）。
  - `engine/ai.ts:aiNextAction` 读取 `state.turn.phase` 的值为旧枚举。
- **影响**：
  - 设计方案中的细粒度 TurnFSM（TURN_START / ROLL_DICE / MOVING / SPACE_RESOLUTION / PURCHASE_DECISION / BUILD_DECISION / RENT_PAYMENT / CARD_EVENT / SPECIAL_SPACE / CARD_USE_WINDOW / STOCK_TRADE / TURN_END）未实现。
  - 当前状态机只有 4 个旧阶段，导致卡片反制窗口、建设决策、股票交易等阶段无法精确建模。
- **整改方向**：
  1. 删除旧 `TurnState`/`TurnPhase`，统一使用 `TurnContext`/`TurnPhaseV2`。
  2. 重写 `engine/turn.ts` 状态机，按 §4.3 流程实现状态转移。
  3. `aiNextAction` 与 `DecisionModal` 迁移到新 phase。

---

### 2.2 P1 高优：引擎层实现偏差

#### P1-1 `boardDataToBoardConfig` 降级地图数据（违反 M0 目标）

- **设计依据**：M0 要求 `types.ts` 全量扩展 + 引擎拆分子系统 + 双地图 JSON 直接驱动引擎。
- **当前状态**：`engine/loader.ts:60-84` 将 `BoardData`（TileV2[]）转换为旧 `BoardConfig`（Tile[]），丢弃 `id`、`neighborIds`、`assetRef`、`layers` 等字段。
- **影响**：新地图数据结构仅在加载校验时使用，实际游戏运行仍用旧 blockout 数据结构。
- **整改方向**：删除 `boardDataToBoardConfig` 的降级行为，`loadMapData` 返回的 `BoardData` 直接用于 `createInitialState` 构造 `BoardState`。

#### P1-2 `createInitialState` 构造旧状态并包含业务逻辑

- **设计依据**：`engine.ts` 应为"薄组合根"；热斗模式转换属于 `loader.ts` 或 `validator.ts` 职责。
- **当前状态**：`engine.ts:18-77` 既构造旧 `GameState`，又在内部根据 `variant` 转换地图类型。
- **整改方向**：
  1. `createInitialState` 接收 `NewGameConfig`（含 `mapId`/`configPresetId`/`variant`）。
  2. 调用 `loadMapData(mapId)` 得 `BoardData`。
  3. 若 `variant === 'hot_fight'`，调用 `applyVariantToBoard` 得转换后 `BoardData`。
  4. 用 `BoardData` 直接构造 `BoardState`（`properties: Record<string, PropertyState>` 以 `tile.id` 为键）。
  5. 返回新 `GameState`。

#### P1-3 破产清算未按 §4.5 流程实现

- **设计依据**：§4.5 要求：1) 强制出售建筑回收 50% buildCost；2) 抵押地产回收 50% basePrice；3) 仍不足则破产，地产归债权方。
- **当前状态**：`engine/player.ts:4-10` 的 `liquidate` 直接把玩家地产清空（`ownerId: undefined, level: 0, mortgaged: false`），未做出售/抵押回收，也未处理债权方。
- **影响**：破产时不返还现金给破产玩家，也不把地产转移给债权人。
- **整改方向**：按 §4.5 实现 `liquidateForDebt(state, debtorId, creditorId?)`：先降级建筑→再抵押→最后转移产权。

#### P1-4 租金计算未实现联合租金/连锁店/查封/涨价完整逻辑

- **设计依据**：§4.7 给出完整租金公式：同路段小型建筑加总、连锁店全图加总、摩天楼单独算、查封归零、涨价卡翻倍、住院不收租。
- **当前状态**：`engine/turn.ts:111-134` 仅取 `(tile.rentByLevel ?? [0])[prop.level]`，未读取 `groupId`、`isChainStore`、`sealedGroups`、`priceUpGroups`、住院状态等。
- **影响**：游戏规则与设计方案不符，路段垄断、连锁店等策略深度缺失。
- **整改方向**：在 `engine/board.ts` 新增 `calculateRent(landingPlayer, tileId, state)`，按 §4.7 完整实现；`turn.ts` 调用该函数。

#### P1-5 物价指数 `auto_increment` 模式未在回合中触发

- **设计依据**：§4.6 两种模式；`auto_increment` 在间隔天数到达时自动升一档。
- **当前状态**：`engine/economy.ts:232-266` 实现 `calcPriceIndex`/`updatePriceIndex`，但 `engine/turn.ts:handleEndTurn` 未调用 `updatePriceIndex`，也未更新 `lastAutoIncrementDay`。
- **影响**：选择大富翁 10 配置时物价指数不会自动增长。
- **整改方向**：在 `handleEndTurn` 中每轮调用 `updatePriceIndex`。

#### P1-6 `aiNextAction` 内置随机源，违反"随机源外置"原则

- **设计依据**：§4.4 要求骰子/事件抽取在 reducer 外调用，经 action 传入，保持 reducer 纯。
- **当前状态**：`engine/ai.ts:70-75` 在 `aiNextAction` 内部生成 `Math.random()` 骰子并返回 `ROLL_DICE` action。
- **影响**：AI 自动循环无法在 reducer 外控制随机种子，也不利于可复现测试。
- **整改方向**：`aiNextAction` 只返回决策 action；页面层的 AI 循环在 reducer 外调用 `rollDice()` 再 dispatch。

#### P1-7 LLM 决策未走 `engine/ai-llm.ts`/`aiDecideAsync`

- **设计依据**：§6.3 要求 AI 控制器通过 `aiDecideAsync` 调用 `buildLLMMessages` + `LLMDecisionFn`。
- **当前状态**：`pages/monopoly/index.tsx` 自行手写 prompt 并直接调用 `streamChat`，未使用 `aiDecideAsync` 或 `buildLLMMessages`。
- **影响**：LLM 决策逻辑与引擎割裂；角色人设/选项预览/失败降级逻辑重复或不一致。
- **整改方向**：页面层配置 `configureAIController({ llmFn, getPersona })`，AI 循环调用 `aiDecideAsync(state, request)`。

#### P1-8 `ItemDefinition` 缺少 effect 描述，引擎用硬编码 ID 判断

- **设计依据**：§3.5 给出 `ItemDefinition` 字段，但未显式定义 effect 字段；但 13 种道具效果需在数据或代码中可维护表达。
- **当前状态**：`types.ts:308-319` 的 `ItemDefinition` 无 `effectType`/`effectParams`；`engine/item.ts:117-200` 用 `switch (def.id)` 硬编码处理 13 种道具。
- **影响**：新增道具必须改代码；数据驱动原则被削弱。
- **整改方向**：在 `ItemDefinition` 增加 `effectType`/`effectParams`，并将 `engine/item.ts` 的效果执行改为基于数据字段。

#### P1-9 卡片反制链 REACTION 窗口未完整集成到 TurnFSM

- **设计依据**：§3.4 要求 `CardUseTiming.REACTION` + `counterCards`，攻击卡触发后进入 `cardUseWindowFor` 等待反制。
- **当前状态**：`types.ts` 已定义 `counterCards` 和 `cardUseWindowFor`；`engine/card.ts` 有 `resolveCardReaction`；但 `turn.ts` 中攻击卡效果触发后未进入反制窗口。
- **影响**：陷害→免罪→嫁祸→复仇的反制链无法实际走通。
- **整改方向**：在 `turn.ts`/`card.ts` 中，当攻击卡效果将要应用时，先设置 `awaitingDecision { kind: 'cardReaction', cardUseWindowFor: ... }`，由目标玩家决定是否反制。

---

### 2.3 P1 高优：数据文件语义与参数错误

> 经子代理审计，数据文件数量完整，但以下语义/参数问题需整改。

#### P1-10 `maps/richman4-taiwan.json`

- `tw_19` 类型 `TAX` 但缺少 `taxRate`（§3.2 要求）。
- 公司/功能格子用法不统一：`tw_06` 用 `COMPANY`+`companyType:BANK`，而 `tw_20` 直接用 `BANK`；`tw_25` 用 `COMPANY`+`companyType:GAS_STATION`，`tw_33` 直接用 `GAS_STATION`。
- **整改**：统一约定（建议 BANK/GAS_STATION 直接用 `SpaceType`，COMPANY 用于"公司企业"投资格）。

#### P1-11 `cards/richman4-cards.json`

- `card-23` 红利卡描述为"所有玩家获得现金"，但 `effectType = TAX_TARGET`（语义为征税），冲突。
- 大量 `effectParams` 为空，导致引擎无法参数化执行：
  - `card-00` 遥控骰子 / `card-28` 后退卡：`MOVE_FORWARD`/`MOVE_BACKWARD` 缺 `steps`。
  - `card-27` 传送卡：`TELEPORT_TO_SPACE` 缺 `spaceId` 或 `mode`。
  - `card-25` 红卡 / `card-26` 黑卡：`STOCK_UP`/`STOCK_DOWN` 缺 `companyId`。
  - `card-22` 召唤神：`SUMMON_GOD` 缺 `godId` 或随机规则。
  - `card-08` 涨价卡 / `card-09` 查封卡：`duration` 与 `effectParams.days` 重复或缺失。
- **整改**：逐张核对 richman.md §4.2，修正 effectType 并补充 params。

#### P1-12 `gods/richman4-gods.json`

- `god-04` 小财神 `transformTo` 指向 `god-00`（？？应为 `god-05` 大财神）。
- `god-07` 衰神效果 `RENT_BOOST value:2.0 target:OPPONENT` 方向疑似反向（让对手租金提升对当前玩家有利）。
- `god-10` 霉神 `RENT_REDUCE value:0.25 target:SELF` 语义需明确是"自身收租降低"还是"自身付租降低"。
- **整改**：按 richman.md §7.4 复核神明效果方向；修正 `transformTo`。

#### P1-13 `events/magic-house-events.json`

- `mh-05` "获得点数 50 点" → `ALL_GAIN_CASH`（类型错误）。
- `mh-07` "随机三位神明之一附身" → `GIVE_CARD`（类型错误）。
- `mh-08` "所有地主缴过路费时双倍" → `ALL_LOSE_CASH 500`（语义错误）。
- `mh-09` "免费升级一处地产" → `GIVE_CARD`（类型错误）。
- `mh-10` "住院 3 天" → `ALL_LOSE_CASH 200`（类型错误）。
- `mh-11` "获得一张陷害卡" → `GIVE_CARD` 但缺 `cardId`。
- `mh-12` "现金翻倍" → `ALL_GAIN_CASH value:0`（value 为 0 无效）。
- `mh-13` "所有地产降一级" → `PROPERTY_PRICE_DOWN`（语义应为降级/拆除）。
- `mh-14` "下次过路费免单" → `GIVE_CARD`（类型错误）。
- **整改**：按描述修正 `type`，为 `GIVE_CARD`/`TELEPORT`/`GOD_POSSESSION` 等补 `params`。

#### P1-14 `events/news-events.json`

- `news-04` "利率下调" → `ALL_GAIN_CASH`（应影响银行存款利率）。
- `news-07` "房东加租：最富玩家损失 ¥1500" → `ALL_LOSE_CASH 500 target:ALL`（target 与 value 均错）。
- `news-12` "节庆促销：商店卡片半价" → `ALL_GAIN_CASH 300`（应影响商店价格）。
- `news-13` "交通大罢工：步行一回合" → `ALL_LOSE_CASH 200`（应改变 vehicle）。
- `news-16` "土地重划：随机路段涨价 3 天" → `PROPERTY_PRICE_UP 0.3 target:ALL`（缺少 groupId）。
- `news-09` "经济衰退：物价指数下降一档" → `PROPERTY_PRICE_DOWN 0.15`（类型错误）。
- `news-10` "科技突破：科技公司股票涨停" → `STOCK_SURGE 1.5 target:ALL`（缺公司过滤）。
- **整改**：统一描述与 effect 语义；为需要特定公司/路段的新闻补过滤参数。

#### P1-15 `events/fate-events.json`

- `fate-03` `TELEPORT` 缺目标/模式 params。
- `fate-04`/`fate-11` `GIVE_CARD` 缺 `cardId`。
- `fate-06` `GOD_POSSESSION` 缺 `godId` 或随机规则。
- **整改**：补充 params。

#### P1-16 `config/richman10-online.json` / `config/richman11-hotfight.json`

- 两文件 `priceIndexMode: "auto_increment"` 但缺 `autoIncrementIntervalDays`。
- `richman11-hotfight.json` 仅通过 `bankEnabled:false`/`stockEnabled:false`/`variant:"hot_fight"` 表达热斗，未包含热斗关键参数（`cashAsHP`、`noHospital`、`attackSpaceRatio` 等）。
- **整改**：补 `autoIncrementIntervalDays`；在 `GameConfig` 类型中新增热斗模式字段后再补数据。

---

### 2.4 P2 中优：UI 页面未迁移与交互缺口

#### P2-1 全部 UI 仍基于旧 `GameState`

- **涉及文件**：`pages/monopoly/index.tsx`、`Board.tsx`、`Board3D.tsx`、`GamePanel.tsx`、`DecisionModal.tsx`、`SaveLoadModal.tsx`。
- **整改方向**：随 P0-1 类型统一，全部页面 props 迁移到新 `GameState`。

#### P2-2 `DecisionModal.tsx` 未覆盖全部 `DecisionKind`

- **设计依据**：§3.14 列出 `buyProperty/upgradeProperty/payOrMortgage/jailChoice/trade/useCard/useItem/bankOperation/stockTrade/choosePath/cardReaction/lotteryBet/teleportTarget/magicHouseEffect`。
- **当前状态**：仅 `buyProperty`/`upgradeProperty` 有专用文案，其余统一显示"请做出选择"。
- **整改方向**：补齐每种决策的标题、说明、选项预览（cashDelta/description）。

#### P2-3 `Board.tsx` / `Board3D.tsx` 使用数组下标定位玩家

- **当前状态**：`Board3D.tsx` 中棋子定位可能使用 `state.board.tiles[p.position]`，当 `position` 改为 string ID 后会失效。
- **整改方向**：用 `tiles.find(t => t.id === p.position)` 解析位置；渲染判断改用 `SpaceType` 大写枚举。

#### P2-4 `PlayerHUD` / `GamePanel` 缺少经济/状态信息

- **设计依据**：§3.3 玩家含银行存款、贷款、股票、神明、交通工具、点数等。
- **当前状态**：未显示总资产、银行存款、贷款、股票持仓、神明附身、交通工具。
- **整改方向**：在 HUD 增加摘要行；在 GamePanel 增加银行/股票/神明/道具面板。

#### P2-5 `NewGameModal.tsx` 角色头像预览缺失

- **当前状态**：角色选择行只显示名字。
- **整改方向**：显示 `coverImageId` 头像缩略图。

#### P2-6 `SaveLoadModal.tsx` 序列化旧状态

- **当前状态**：`serializeGame`/`deserializeGame` 处理旧 `GameState`。
- **整改方向**：迁移到新 `GameState`，并增加版本迁移逻辑。

---

### 2.5 P2 中优：规则覆盖缺口

#### P2-7 银行/股票/公司在 TurnFSM 中未设置专用决策阶段

- **当前状态**：`BANK_DEPOSIT`/`WITHDRAW`/`LOAN`/`REPAY`、`BUY_STOCK`/`SELL_STOCK` 可由 UI 直接 dispatch，但 `turn.ts` 未在踩到 BANK/SHOP 等格子时生成 `bankOperation`/`stockTrade` 决策点。
- **整改方向**：在 `SPACE_RESOLUTION` 阶段，根据格子类型生成对应 `DecisionRequest`。

#### P2-8 小游戏/乐透/传送/宝箱事件仅部分实现交互

- **当前状态**：`event.ts` 有处理函数，但部分事件直接随机决定结果，未给玩家决策（如乐透投注、传送目标选择）。
- **整改方向**：为 `lotteryBet`/`teleportTarget`/`magicHouseEffect` 等生成 `DecisionRequest`，由玩家/AI 选择。

#### P2-9 第 15 日分红未与 `day` 关联

- **当前状态**：`economy.ts:handleDividend` 用 `day % dividendDay`，但 `engine.ts:END_TURN` 未调用 `handleDividend`。
- **整改方向**：在 `handleEndTurn` 中，若新 day 到达分红日则调用 `handleDividend`。

#### P2-10 查封/涨价 group durations 在 `GameState` 旧字段中维护

- **当前状态**：`sealedGroups`/`priceUpGroups` 放在顶层 `GameState`，而非 `BoardState`。
- **整改方向**：迁移到 `BoardState`。

---

### 2.6 P3 低优：Polish 与一致性

#### P3-1 `characters/richman4-characters.json` 颜色重复

- `char-05` 周伯通与 `char-11` 米兰达同为 `#9B59B6`。
- **整改**：调整其中一个颜色。

#### P3-2 `engine.ts` 导出过多实现细节

- `engine.ts` 末尾 re-export 大量子系统函数，导致模块边界模糊。
- **整改**：仅导出 `reducer`/`createInitialState`/`rollDice`/`getDiceCount`/`Action` 相关；其余由子系统文件单独 import。

#### P3-3 单测基于旧类型

- 337 绿单测在旧 `GameState` 上通过；类型统一后需大规模重写。
- **整改**：按新类型重写核心引擎单测，保持至少 337 例覆盖。

#### P3-4 注释中仍称 P0–P6 blockout

- `types.ts` 多处以"旧 P0-P6"命名类型；迁移完成后应删除或重命名。
- **整改**：删除 Legacy 类型，统一术语。

#### P3-5 `board.preset.ts` 死文件

- 目录下仍存在 `board.preset.ts`（P0–P6 遗留）。
- **整改**：确认无引用后删除。

---

## 3. 整改清单（供低阶模型逐项实施）

> 按依赖顺序执行：**P0 → P1 → P2 → P3**。先统一类型，再迁移引擎，再修数据，最后 UI/单测。

### Phase 0：类型系统统一（必须先完成）

| # | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P0-1 | 将 `FullGameState` 改名为 `GameState`，旧 `GameState` 改名为 `LegacyGameState` 或删除 | `types.ts` | `grep -r "FullGameState" frontend/src/game/monopoly` 无命中；新 `GameState` 被 engine + pages import |
| P0-2 | `TileV2` 改名为 `Tile`，删除旧 `Tile`/`BoardConfig`；`BoardData.tiles` 直接使用新 `Tile` | `types.ts` | 无 `TileV2` 引用；`BoardData.tiles: Tile[]` |
| P0-3 | `PropertyState.tileId`、`Player.position`、`Player.ownedTileIds`、`TrapState` 键、`boardTraps` 键全部改为 `string` | `types.ts` | tsc 无 number 索引错误 |
| P0-4 | `Action` 中 `tileId`/`targetTileId` 全部改为 `string` | `types.ts` | tsc 通过 |
| P0-5 | 删除旧 `TurnState`/`TurnPhase`，`TurnContext`/`TurnPhaseV2` 作为唯一回合状态 | `types.ts` | `GameState.turnContext: TurnContext` |
| P0-6 | `NewGameConfig` 移除 `board: BoardConfig`，改为 `mapId: string` | `types.ts`、`pages/monopoly/NewGameModal.tsx` | tsc 通过 |

### Phase 1：引擎迁移与规则补全

| # | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P1-1 | `engine.ts` `reducer`/`createInitialState` 返回新 `GameState`；调用 `loadMapData` 构造 `BoardState` | `engine.ts`、`engine/loader.ts` | `boardDataToBoardConfig` 不再被引擎调用；双地图仍可通过 `mapId` 加载 |
| P1-2 | 重写 `engine/turn.ts` 为新 TurnFSM（12 个 phase），支持 `neighborIds` 走动 | `engine/turn.ts` | 单测覆盖 ROLL_DICE→MOVING→SPACE_RESOLUTION→TURN_END 完整路径；支持分叉路 |
| P1-3 | `engine/board.ts` 实现完整租金计算（联合租金/连锁店/查封/涨价/住院） | `engine/board.ts`、`engine/turn.ts` | 新增 `board.test.ts` 用例覆盖同路段加租、连锁店、查封 |
| P1-4 | 重写破产清算 `liquidateForDebt`（出售建筑→抵押→转移产权） | `engine/player.ts` | `player.test.ts` 覆盖破产清算回收现金与债权转移 |
| P1-5 | `engine/economy.ts` 物价指数 `auto_increment` 在 `handleEndTurn` 触发 | `engine/economy.ts`、`engine/turn.ts` | `economy.test.ts` 覆盖 auto_increment 升档 |
| P1-6 | AI 循环在 reducer 外调用 `rollDice`；`aiNextAction` 不再内置随机 | `engine/ai.ts`、`pages/monopoly/index.tsx` | `ai.test.ts` 仍通过；AI 决策可 mock 骰子 |
| P1-7 | 页面层 LLM 决策走 `configureAIController` + `aiDecideAsync` | `pages/monopoly/index.tsx`、`engine/ai-llm.ts` | LLM 开关打开时调用 `buildLLMMessages` |
| P1-8 | 卡片反制链完整集成（攻击卡触发后进入 `cardReaction` 决策） | `engine/card.ts`、`engine/turn.ts` | `card.test.ts` 覆盖陷害→免罪→嫁祸→复仇 |
| P1-9 | `ItemDefinition` 增加 `effectType`/`effectParams`，道具效果由数据驱动 | `types.ts`、`data/items/richman4-items.json`、`engine/item.ts` | tsc 通过；13 种道具效果仍正确 |

### Phase 2：数据文件修正

| # | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P2-1 | 修正 `maps/richman4-taiwan.json` 的 `taxRate` 与公司格统一 | `data/maps/richman4-taiwan.json` | `validator.test.ts` 通过 |
| P2-2 | 逐张修正 `cards/richman4-cards.json` 的 effectType 与 params | `data/cards/richman4-cards.json` | 30 张卡片语义与 richman.md §4.2 一致 |
| P2-3 | 修正神明 transformTo 与效果方向 | `data/gods/richman4-gods.json` | 13 种神明方向符合 richman.md §7.4 |
| P2-4 | 修正魔法屋事件 type 与 params | `data/events/magic-house-events.json` | 15 条描述与 effect 一致 |
| P2-5 | 修正新闻事件语义与过滤参数 | `data/events/news-events.json` | 20 条语义一致 |
| P2-6 | 修正命运事件 params | `data/events/fate-events.json` | TELEPORT/GIVE_CARD/GOD_POSSESSION 都有 params |
| P2-7 | 补 config 的 `autoIncrementIntervalDays` 与热斗参数 | `data/config/*.json`、`types.ts` | 配置可加载，热斗参数生效 |

### Phase 3：UI 迁移与交互补全

| # | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P3-1 | 全部页面 props 改为新 `GameState` | `pages/monopoly/*.tsx` | tsc 通过 |
| P3-2 | `Board`/`Board3D` 用 `Tile.id` 定位，用 `SpaceType` 判断类型 | `pages/monopoly/Board.tsx`、`Board3D.tsx` | 双地图渲染正常；棋子定位正确 |
| P3-3 | `DecisionModal` 覆盖全部 `DecisionKind` | `pages/monopoly/DecisionModal.tsx` | 每种决策都有标题/说明/选项 |
| P3-4 | `PlayerHUD`/`GamePanel` 显示银行/股票/神明/交通工具/总资产 | `pages/monopoly/PlayerHUD.tsx`、`GamePanel.tsx` | UI 可见新增字段 |
| P3-5 | `NewGameModal` 显示角色头像 | `pages/monopoly/NewGameModal.tsx` | 角色行显示 coverImageId 头像 |
| P3-6 | `SaveLoadModal` 序列化新 `GameState` | `pages/monopoly/SaveLoadModal.tsx`、`engine/serializer.ts` | 存档/读档后状态一致 |

### Phase 4：单测与清理

| # | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P4-1 | 按新类型重写 engine 单测（至少保持 337 绿） | `__tests__/*.test.ts` | `npm --prefix frontend test -- --run` 全绿 |
| P4-2 | 删除 `board.preset.ts` 与旧 Legacy 类型 | `game/monopoly/board.preset.ts`、`types.ts` | 无引用；tsc 通过 |
| P4-3 | 收敛 `engine.ts` 导出范围 | `engine.ts` | 仅导出核心 API |

---

## 4. 验收标准

每完成一个 Phase 必须跑以下命令并贴出结果：

```bash
# 1. 类型检查（前端 + 后端 + electron）
cd Z:/Playground/novelhelper/frontend && npx tsc --noEmit
cd Z:/Playground/novelhelper/server && npx tsc --noEmit
cd Z:/Playground/novelhelper/electron && npx tsc --noEmit

# 2. 构建
cd Z:/Playground/novelhelper/frontend && npm run build

# 3. 单测（必须全绿）
cd Z:/Playground/novelhelper/frontend && npm test -- --run

# 4. lint（改动文件 0 error）
cd Z:/Playground/novelhelper/frontend && npx eslint src/game/monopoly src/pages/monopoly
```

终态额外验收：
- 完整对局可玩通（购买/升级/租金/卡片/道具/神明/事件/银行/股票/破产/胜负）。
- 大富翁4/10/11 配置可切换；热斗模式地图正确转换。
- AI 三档行为差异可观察；LLM 决策可启用并降级。
- 存档/读档状态一致。
- 用 M2 真实角色卡新建游戏并显示头像。

---

## 5. 给实施代理的风险提示

1. **不要跨 Phase 实施**：P0 类型未统一前，不要修改 UI 或数据文件（会因类型不兼容反复返工）。
2. **先做 tsc 再补单测**：Phase 0 完成后先保证 `tsc --noEmit` 0 error，再写单测。
3. **保留旧单测作为参考**：重写单测前先读懂旧测试覆盖的边界，避免回归。
4. **数据文件语义问题需人工复核**：低阶模型不要凭 richman.md 自行脑补，描述与 effect 冲突时要列出具体条目问用户。
5. **git 由用户手动执行**：本整改工程量大，建议分多次提交，每次 Phase 结束提交一次。

---

## 附录 A：关键代码定位

| 设计概念 | 当前实现位置 | 应落位置 |
|---|---|---|
| 旧 `GameState` | `frontend/src/game/monopoly/types.ts:654` | 删除/重命名为 Legacy |
| 新 `FullGameState` | `frontend/src/game/monopoly/types.ts:747` | 改名为 `GameState` |
| 旧 `Tile` | `frontend/src/game/monopoly/types.ts:126` | 删除 |
| 新 `TileV2` | `frontend/src/game/monopoly/types.ts:143` | 改名为 `Tile` |
| 地图降级桥接 | `frontend/src/game/monopoly/engine/loader.ts:60` | 删除降级逻辑 |
| 引擎组合根 | `frontend/src/game/monopoly/engine.ts` | 迁移到新 `GameState` |
| TurnFSM | `frontend/src/game/monopoly/engine/turn.ts` | 重写为 12 状态 |
| AI 控制器 | `frontend/src/game/monopoly/engine/ai.ts` | 随机源外置 |
| LLM prompt | `frontend/src/game/monopoly/engine/ai-llm.ts` | 被页面调用 |
| UI 入口 | `frontend/src/pages/monopoly/index.tsx` | 迁移新状态 |
| 决策弹窗 | `frontend/src/pages/monopoly/DecisionModal.tsx` | 覆盖全部 kind |

---

## 附录 B：数据文件整改速查

| 文件 | 主要问题 |
|---|---|
| `maps/richman4-taiwan.json` | `tw_19` 缺 `taxRate`；公司/功能格 SpaceType 不统一 |
| `cards/richman4-cards.json` | `card-23` effectType 错；多张卡缺 params |
| `gods/richman4-gods.json` | `god-04` transformTo 指向错；效果方向待复核 |
| `events/magic-house-events.json` | 大量 type 与描述不符；GIVE_CARD 缺 cardId |
| `events/news-events.json` | 描述与 effect 不一致；缺公司/路段过滤 |
| `events/fate-events.json` | TELEPORT/GIVE_CARD/GOD_POSSESSION 缺 params |
| `config/richman10-online.json` | 缺 `autoIncrementIntervalDays` |
| `config/richman11-hotfight.json` | 缺热斗模式参数 |

---

*报告结束。下一动作建议：由用户确认是否启动 Phase 0 类型系统统一整改。*
