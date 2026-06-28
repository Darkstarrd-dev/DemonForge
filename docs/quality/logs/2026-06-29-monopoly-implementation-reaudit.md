# 大富翁模块 M0–M11 整改实施结果 · 复审报告

> 审核依据：`docs/monopoly_full_plan.md`（2026-06-28 立项）
> 前序审核：`docs/quality/logs/2026-06-28-monopoly-implementation-audit.md`
> 审核目的：对声称已按前序审计报告完成 Phase 0–4 整改的实施结果进行独立复核；输出供低阶模型逐项修复的详细清单。

---

## 元信息

| 项 | 内容 |
|---|---|
| 审核编号 | monopoly-implementation-reaudit-2026-06-29 |
| 审核日期 | 2026-06-29 |
| 代码版本 | 工作区未提交改动（HANDOFF.md 声明 Phase 0–4 已完成） |
| 审核范围 | `frontend/src/game/monopoly/` + `frontend/src/pages/monopoly/` + 对应 JSON 数据文件 |
| 审核方式 | 子代理并行精读（类型/引擎、数据文件、UI/单测）+ 本地运行 tsc / vitest / vite build / eslint 验证 |
| 上次审核 | `docs/quality/logs/2026-06-28-monopoly-implementation-audit.md` |

---

## 1. 验证快照

以下命令均在本机当前工作区执行：

```bash
# 1. 前端 app 类型检查
npx tsc -p tsconfig.app.json --noEmit
# 结果：0 error

# 2. 前端 node 类型检查
npx tsc -p tsconfig.node.json --noEmit
# 结果：0 error

# 3. 生产构建
npm run build
# 结果：成功（仅 chunk size 警告）

# 4. 全量单测
npm test -- --run
# 结果：27 files, 337/337 passed

# 5. 大富翁子集单测
npm test -- --run --reporter=dot monopoly
# 结果：16 files, 282/282 passed

# 6. lint（垄断模块）
npx eslint src/game/monopoly src/pages/monopoly
# 结果：11 errors（详见 §4.5）
```

**关键纠正**：HANDOFF.md 所述 337/337 绿指的是**全项目**单测；大富翁模块自身单测为 **282 条**。若按 Phase 4 原清单至少保持 337 绿理解为大富翁模块，则缺口 **55+ 条**。

---

## 2. 总体结论

| 维度 | 状态 | 一句话总评 |
|---|---|---|
| Phase 0 类型系统统一 | 大部分完成 | `GameState`/`Tile.id: string`/`BoardState`/`TurnContext`/`TurnPhaseV2` 已落地并贯穿引擎、UI、单测。 |
| Phase 1 引擎规则补全 | 部分完成 | 状态机构造已迁移，但走动逻辑、租金公式、破产清算、物价指数触发、AI 随机源外置等核心规则仍未按设计方案实现。 |
| Phase 2 数据文件修正 | 部分完成 | 卡片参数、神明 transformTo/value、配置 autoIncrementIntervalDays 已修正；新闻/命运/道具/魔法屋类型与枚举同步仍有大量缺口。 |
| Phase 3 UI 迁移与交互覆盖 | 部分完成 | 页面已迁移到新类型，但 `DecisionModal` 仅覆盖 2/14 种决策，`PlayerHUD`/`GamePanel` 缺经济信息，`NewGameModal` 缺角色头像。 |
| Phase 4 单测与清理 | 部分完成 | 单测已切到新类型，但模块测试数 282 < 337、lint 未清零、`engine.ts` 导出未收敛。 |

**综合判定**：本次整改**未完成**。类型地基已稳固，但规则行为层、数据语义、UI 决策覆盖、代码清理四项仍有显著缺口。若直接视为完成，低阶模型在 M2–M11 后续扩展时会在旧逻辑补丁上继续堆叠，债务放大。

---

## 3. 逐项符合性矩阵

| 设计维度 | 方案要求 | 实际状态 | 严重等级 |
|---|---|---|---|
| `GameState` 唯一真相源 | `FullGameState` 改名为 `GameState`，旧结构删除 | 已完成；`GameState` 为新结构 | 符合 |
| `Tile.id: string` | 格子 ID 升级为 string，运行时直接驱动 | 已完成；`PropertyState.tileId`/`Player.position`/`Action.tileId` 均为 string | 符合 |
| `BoardState` 运行时状态 | 含 data/tiles/properties/sealedGroups/priceUpGroups/boardTraps | 已完成 | 符合 |
| `TurnContext` + `TurnPhaseV2` | 12 阶段状态机替代旧 `TurnState` | 类型与构造完成；走动逻辑仍为 index 取模 | 部分符合 |
| 走动逻辑 `neighborIds` 驱动 | §4.3 支持分叉路 | 未实现，`advanceOnRing` 仍为 `(index + steps) % size` | P1 |
| 完整租金计算 | §4.7 联合租金/连锁店/查封/涨价/住院 | 仅取 `rentByLevel[level]` | P1 |
| 破产清算分步 | §4.5 出售建筑→抵押→归债权方 | `liquidate` 仍直接清空产权 | P1 |
| 物价指数 `auto_increment` | §4.6 在 `handleEndTurn` 触发 | `updatePriceIndex` 存在但未被调用 | P1 |
| 卡片 30 种效果 | §3.4 / §5.2 参数正确 | 部分参数已补；红/黑卡缺 companyId 等 | P2 |
| 卡片反制链 | §3.4 `CARD_USE_WINDOW` | 结构存在，未与 TurnFSM 阶段耦合 | P2 |
| 道具 13 种效果数据驱动 | §3.5 effectType/effectParams | 类型已加，数据文件与引擎均未使用 | P1 |
| 神明 13 种 | §3.6 方向正确 | god-04/god-10 已修正；god-07 语义仍反向 | P2 |
| 事件 7 类 | §3.9–3.10 描述与 effect 一致 | 新闻/命运大量未修正；魔法屋新增类型与枚举不同步 | P2 |
| AI 随机源外置 | §4.4 `rollDice()` 在 reducer 外 | `aiNextAction` 仍内置 `Math.random()` | P1 |
| LLM 决策接口 | §6.3 aiDecideAsync/buildLLMMessages | 接口已存在，页面 configureAIController 已接 | 符合 |
| 角色卡接入 M2 | §3.7 / M9 显示头像等 | `NewGameModal` 未显示头像 | P2 |
| UI 决策覆盖 | §3.14 全部 `DecisionKind` | 仅 2/14 种有文案 | P1 |
| UI 经济信息显示 | §3.3 银行/股票/神明/交通 | HUD/面板缺失 | P1 |
| 存档/读档 | M10 新 `GameState` + 迁移 | 已迁移；迁移逻辑较简单 | 部分符合 |
| 单测数量 | Phase 4 ≥337 绿 | 模块 282；全项目 337 | P2 |
| lint 清零 | Phase 4 改动文件 0 error | 仍有 11 errors | P2 |
| `engine.ts` 导出收敛 | Phase 4 P4-3 | 仍大量 re-export | P3 |

---

## 4. 详细发现

### 4.1 Phase 0 类型系统（已验证完成）

| # | 审计项 | 状态 | 证据 |
|---|---|---|---|
| P0-1 | `FullGameState` → `GameState` | OK | `types.ts:653-670` 唯一定义新 `GameState`；全局搜索 FullGameState/LegacyGameState 仅命中注释 |
| P0-2 | `TileV2` → `Tile`，旧 `Tile`/`BoardConfig` 删除 | OK | `types.ts:110-135` 定义 `Tile`（含 id: string/neighborIds/assetRef）；旧类型不存在；`BoardData.tiles: Tile[]` |
| P0-3 | PropertyState.tileId/Player.position/ownedTileIds/boardTraps 键为 string | OK | `types.ts:152`/`189-190`/`175` |
| P0-4 | Action.tileId/targetTileId 为 string | OK | `types.ts:620-627` |
| P0-5 | TurnContext/TurnPhaseV2 替代旧回合状态 | OK | `types.ts:694-708` 12 阶段；`types.ts:722-733` TurnContext；`GameState.turnContext` |
| P0-6 | NewGameConfig 用 mapId 而非 board: BoardConfig | OK | `types.ts:681-688`；`engine.ts:25` 用 loadMapData(mapId) |
| P0-7 | 删除 `board.preset.ts` | OK | 文件已不存在 |

### 4.2 Phase 1 引擎规则（仍有多项缺口）

#### P1-1 走动逻辑仍为 index 取模，未使用 neighborIds

- 位置：`frontend/src/game/monopoly/engine/turn.ts:34-40`（advanceOnRing）
- 现状：`return (pos + steps) % size;`
- 设计偏差：§4.3 要求沿 `Tile.neighborIds` 逐格移动，以支持分叉路/非环形地图。
- 影响：台湾地图等自定义拓扑无法生效；movePath 未真正构建。

#### P1-2 租金计算未实现联合租金/连锁店/查封/涨价/住院

- 位置：`engine/turn.ts:156-179`；`engine/board.ts`
- 现状：仅 `(tile.rentByLevel ?? [0])[prop.level]`，未读取 groupId/isChainStore/sealedGroups/priceUpGroups/住院状态。
- 设计偏差：§4.7 完整公式缺失，路段垄断、连锁店策略深度未落地。

#### P1-3 破产清算未分步，未转移债权

- 位置：`engine/player.ts:4-23`
- 现状：`liquidate` 直接清空产权（ownerId: undefined, level: 0, mortgaged: false）。
- 设计偏差：§4.5 要求先强制出售建筑回收 50% buildCost，再抵押回收 50% basePrice，最后转移给债权方。

#### P1-4 物价指数 auto_increment 未在 handleEndTurn 触发

- 位置：`engine/economy.ts:228-262`（函数已实现）；`engine/turn.ts:handleEndTurn`（未调用）
- 现状：updatePriceIndex 存在，但 handleEndTurn 未调用；lastAutoIncrementDay 未更新；handleDividend 未按 day 触发。

#### P1-5 AI 随机源仍内置

- 位置：`engine/ai.ts:71-76`
- 现状：`aiNextAction` 在 ROLL_DICE 分支内部调用 `Math.random()` 生成骰子。
- 设计偏差：§4.4 要求骰子/事件抽取在 reducer 外进行，经 action 传入。

#### P1-6 道具效果仍硬编码 ID，未使用 effectType/effectParams

- 位置：`types.ts:332-333`（字段已加）；`data/items/richman4-items.json`（全部 13 项未填）；`engine/item.ts:117-216`（switch (def.id)）
- 现状：类型层面预留，数据与引擎均未消费。

#### P1-7 卡片反制链未与 TurnFSM 阶段耦合

- 位置：`engine/card.ts:456-515`（resolveCardReaction）；`engine/turn.ts`
- 现状：cardUseWindowFor/counterCards 存在，但攻击卡触发后未进入 `TurnPhaseV2.CARD_USE_WINDOW`，反制窗口与阶段状态机割裂。

#### P1-8 boardDataToBoardConfig 遗留函数名

- 位置：`engine/loader.ts:90-92`；`engine.ts:167`
- 现状：该函数已改为调用 createBoardState，但旧名仍被 re-export，语义混淆。

#### P1-9 Tile 仍带旧兼容字段

- 位置：`types.ts:128-135`
- 现状：price/upgradeCost/rentByLevel/taxAmount/color/zoneId 等字段仍保留，应收敛到 basePrice/buildingLevels/taxRate/groupId。

### 4.3 Phase 2 数据文件（部分修正）

#### 已修正项

| 文件 | 条目 | 修正内容 |
|---|---|---|
| `data/maps/richman4-taiwan.json` | tw_19 | 已补 taxRate: 0.1 |
| `data/cards/richman4-cards.json` | card-00 | 已补 effectParams.steps: 6 |
| `data/cards/richman4-cards.json` | card-08/09 | duration 已改为 5 |
| `data/cards/richman4-cards.json` | card-22 | 已补 effectParams.mode: nearest |
| `data/cards/richman4-cards.json` | card-23 | effectType 已改为 ALL_GAIN_CASH，并补 amount: 500 |
| `data/cards/richman4-cards.json` | card-25/26 | 已补 effectParams.duration: 3 |
| `data/cards/richman4-cards.json` | card-27 | 已补 effectParams.mode: select |
| `data/cards/richman4-cards.json` | card-28 | 已补 effectParams.steps: 3 |
| `data/gods/richman4-gods.json` | god-04 | transformTo 已改为 god-05 |
| `data/gods/richman4-gods.json` | god-10 | value 已改为 0.5，note 已说明 |
| `data/config/richman10-online.json` | 全局 | 已补 autoIncrementIntervalDays: 7 |
| `data/config/richman11-hotfight.json` | 全局 | 已补 autoIncrementIntervalDays、cashAsHP、noHospital |

#### 仍未修正项

| 文件 | 条目 | 问题 | 建议 |
|---|---|---|---|
| `data/maps/richman4-taiwan.json` | tw_06/tw_20/tw_25/tw_33 | 银行/加油站格 SpaceType 不统一：部分用 COMPANY+companyType，部分直接用 BANK/GAS_STATION | 统一约定 |
| `data/cards/richman4-cards.json` | card-25/card-26 | 红/黑卡 effectParams 缺 companyId（或 selectable: true） | 补充 |
| `data/cards/richman4-cards.json` | card-01..card-29（除已修正） | 大量 effectParams 为空 | 按 richman.md §4.2 逐张补参数 |
| `data/gods/richman4-gods.json` | god-07 | alignment: BAD 但效果为 RENT_BOOST 且 target: SELF，对自身收租加成属正面效果，方向仍错 | 改为 RENT_REDUCE 或调整 target |
| `data/events/magic-house-events.json` | mh-05 | 已改为 ALL_GAIN_POINTS，但不在 MagicHouseEffect.type 联合枚举中 | 同步 types.ts 枚举或改回已有枚举 |
| `data/events/magic-house-events.json` | mh-07 | 已改为 GOD_POSSESSION，不在枚举中 | 同上 |
| `data/events/magic-house-events.json` | mh-08 | 已改为 RENT_MULTIPLIER，不在枚举中 | 同上 |
| `data/events/magic-house-events.json` | mh-09 | 已改为 FREE_UPGRADE，不在枚举中 | 同上 |
| `data/events/magic-house-events.json` | mh-10 | 已改为 SEND_TO_HOSPITAL，不在枚举中 | 同上 |
| `data/events/magic-house-events.json` | mh-12 | 已改为 CASH_MULTIPLIER，不在枚举中 | 同上 |
| `data/events/magic-house-events.json` | mh-13 | 已改为 DOWNGRADE_ALL，不在枚举中 | 同上 |
| `data/events/magic-house-events.json` | mh-14 | 已改为 TOLL_FREE，不在枚举中 | 同上 |
| `data/events/news-events.json` | news-04 | 利率下调仍用 ALL_GAIN_CASH 200 | 改为 DEPOSIT_RATE_ADJUST 并带利率值 |
| `data/events/news-events.json` | news-07 | 最富玩家损失 1500 仍用 ALL_LOSE_CASH 500 target:ALL | 改为 target: RICHEST, value: 1500 |
| `data/events/news-events.json` | news-12 | 商店卡片半价仍用 ALL_GAIN_CASH 300 | 改为 SHOP_DISCOUNT |
| `data/events/news-events.json` | news-13 | 交通大罢工仍用 ALL_LOSE_CASH 200 | 改为 SET_VEHICLE 并带持续回合 |
| `data/events/news-events.json` | news-16 | 土地重划仍用 PROPERTY_PRICE_UP 0.3 target:ALL | 补 groupId/duration |
| `data/events/news-events.json` | news-09 | 经济衰退仍用 PROPERTY_PRICE_DOWN | 改为 PRICE_INDEX_DOWN |
| `data/events/news-events.json` | news-10 | 科技突破仍用 STOCK_SURGE 1.5 target:ALL | 补 companyFilter: TECH_COMPANY |
| `data/events/fate-events.json` | fate-03 | TELEPORT params 为空 | 补 mode/spaceId/targetType |
| `data/events/fate-events.json` | fate-04/fate-11 | GIVE_CARD params 为空 | 补 cardId 或 random: true |
| `data/events/fate-events.json` | fate-06 | GOD_POSSESSION params 为空 | 补 godId 或 random: true |
| `data/config/richman11-hotfight.json` | 全局 | 缺 attackSpaceRatio | 补充 |
| `data/items/richman4-items.json` | item-00..item-12 | 全部缺 effectType/effectParams | 按 types.ts 的 ItemEffectType 枚举逐项填写 |

### 4.4 Phase 3 UI 迁移与交互覆盖

| # | 审计项 | 状态 | 证据 / 问题 |
|---|---|---|---|
| P3-1 | 全部页面 import 新 `GameState` | OK | index/Board/Board3D/GamePanel/DecisionModal/NewGameModal/SaveLoadModal/Tile 均已迁移 |
| P3-2 | Board/Board3D 用 Tile.id 定位、用 SpaceType 判断类型 | OK | Board3D.tsx:116 tiles.find(t => t.id === p.position)；Tile.tsx:14 用 SpaceType.PROPERTY；动态 gridSide 已适配 |
| P3-3 | GamePanel.tsx:50-54 对手地产列表 bug | 缺陷 | 仍用 t.index（number）索引 state.board.properties，应改为 t.id |
| P3-4 | DecisionModal 覆盖全部 DecisionKind | 缺陷 | 仅 buyProperty/upgradeProperty 有专用文案；缺 jailChoice/trade/useCard/useItem/bankOperation/stockTrade/choosePath/cardReaction/lotteryBet/teleportTarget/magicHouseEffect/payOrMortgage |
| P3-5 | PlayerHUD 显示银行/贷款/股票/神明/交通/总资产 | 缺陷 | 仅显示 cash（PlayerHUD.tsx:87-89） |
| P3-6 | GamePanel 显示经济信息 | 缺陷 | 仅显示 points、手牌、道具、地产列表，缺银行/股票/神明/交通/总资产 |
| P3-7 | NewGameModal 显示角色头像 | 缺陷 | 角色选择行仅显示名字，无 coverImageId 头像缩略图 |
| P3-8 | SaveLoadModal/serializer.ts 基于新 GameState | OK | 已迁移；migrateSaveVersion 较简单 |

### 4.5 Phase 4 单测与清理

| # | 审计项 | 状态 | 证据 |
|---|---|---|---|
| P4-1 | 单测基于新类型 | OK | 全部 16 个 monopoly 测试文件已使用 TurnPhaseV2/string tileId/state.board.properties |
| P4-2 | 单测数量 ≥337 | 部分 | 全项目 337 绿；大富翁模块仅 282 绿 |
| P4-3 | lint 改动文件 0 error | 缺陷 | 11 errors（见下） |
| P4-4 | engine.ts 导出收敛 | 缺陷 | engine.ts:152-167 仍 re-export 大量子系统函数 |
| P4-5 | 删除 board.preset.ts | OK | 已删除 |

#### lint 错误明细

```text
src/game/monopoly/__tests__/god.test.ts:305:9   prefer-const
src/game/monopoly/__tests__/god.test.ts:314:9   prefer-const
src/game/monopoly/__tests__/god.test.ts:321:9   prefer-const
src/game/monopoly/engine/economy.ts:186:7       prefer-const
src/game/monopoly/engine/god.ts:26:7            prefer-const
src/game/monopoly/engine/saveStorage.ts:16:28   no-explicit-any
src/game/monopoly/engine/saveStorage.ts:22:28   no-explicit-any
src/game/monopoly/engine/saveStorage.ts:28:28   no-explicit-any
src/game/monopoly/engine/saveStorage.ts:34:28   no-explicit-any
src/game/monopoly/engine/saveStorage.ts:94:51   no-explicit-any
src/pages/monopoly/SaveLoadModal.tsx:34:28      react-hooks/set-state-in-effect
```

---

## 5. 整改任务清单（供低阶模型逐项实施）

> 执行顺序建议：P0 → P1 → P2 → P3；P0 UI bug 修复可与其他并行，但引擎规则项有依赖。

### 5.1 P0 阻塞级

| 编号 | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P0-1 | 修复 GamePanel.tsx 用 t.index 索引 properties 的 bug | pages/monopoly/GamePanel.tsx:50-54 | 对手地产列表改用 state.board.properties[t.id]；选项目标选择不再空列表；tsc/lint 通过 |
| P0-2 | DecisionModal 覆盖全部 DecisionKind | pages/monopoly/DecisionModal.tsx | 对 14 种 kind 分支提供标题、说明、选项；弹窗应在 awaitingDecision 存在且当前玩家为人类时打开；选项按钮回传 optionId；补交互单测 |
| P0-3 | PlayerHUD 显示经济/状态信息 | pages/monopoly/PlayerHUD.tsx | 每个玩家卡片可见：总资产、银行存款/贷款、持股摘要、神明附身+剩余天数、交通工具 |
| P0-4 | GamePanel 显示经济/状态信息 | pages/monopoly/GamePanel.tsx | 新增银行/股票/神明/交通工具/总资产摘要面板或折叠区；保留现有点数/手牌/道具/地产面板 |

### 5.2 P1 高优级

| 编号 | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P1-1 | 重写走动逻辑为 neighborIds 驱动 | engine/turn.ts | 移除 advanceOnRing 的 index 取模；handleRoll 沿 currentTile.neighborIds 逐格移动；支持分叉路时生成 choosePath 决策；新增/更新 turn.test.ts 用例 |
| P1-2 | 实现完整租金公式 | engine/board.ts、engine/turn.ts | 新增 calculateRent(landingPlayer, tileId, state)，覆盖同路段联合租金加总、连锁店全图加总、摩天楼单独算、查封归零、涨价翻倍、房东住院不收租；turn.ts 调用该函数；board.test.ts 补用例 |
| P1-3 | 重写破产清算为分步流程 | engine/player.ts | 新增 liquidateForDebt(state, debtorId, creditorId?)：先降级建筑回收 50% buildCost → 再抵押回收 50% basePrice → 最后转移产权给债权方（无债权方归公）；player.test.ts 覆盖 |
| P1-4 | handleEndTurn 触发物价指数与分红 | engine/turn.ts、engine/economy.ts | 每回合调用 updatePriceIndex 并更新 lastAutoIncrementDay；到达 dividendDay 时调用 handleDividend；economy.test.ts 覆盖 auto_increment 升档与分红 |
| P1-5 | AI 随机源外置 | engine/ai.ts、pages/monopoly/index.tsx | aiNextAction 不再调用 Math.random()；页面 AI 循环在 reducer 外调用 rollDice() 再 dispatch ROLL_DICE；ai.test.ts 仍通过且可 mock 骰子 |
| P1-6 | 道具效果数据驱动 | data/items/richman4-items.json、engine/item.ts、types.ts | 为 13 种道具填写 effectType/effectParams；applyItemEffect 改为基于 def.effectType 分派；移除 switch (def.id)；item.test.ts 仍通过 |

### 5.3 P2 中优级

| 编号 | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P2-1 | 卡片反制链与 TurnFSM 耦合 | engine/card.ts、engine/turn.ts | 攻击卡触发后进入 TurnPhaseV2.CARD_USE_WINDOW；aiNextAction 在该阶段调用反制决策；card.test.ts 覆盖陷害→免罪→嫁祸→复仇 |
| P2-2 | 修正数据文件语义错误 | data/maps/richman4-taiwan.json、data/cards/richman4-cards.json、data/gods/richman4-gods.json、data/events/*.json、data/config/richman11-hotfight.json、data/items/richman4-items.json | 按 §4.3 逐项修正表中所有条目；修正后 validator.test.ts 通过；新增类型与 types.ts 枚举同步 |
| P2-3 | NewGameModal 显示角色头像 | pages/monopoly/NewGameModal.tsx | 角色选择行显示 coverImageId 头像缩略图；无头像时 fallback 名字首字色块 |
| P2-4 | 清理 boardDataToBoardConfig 遗留与 Tile 兼容字段 | engine/loader.ts、engine.ts、types.ts | 删除 boardDataToBoardConfig；移除 Tile 上 price/upgradeCost/rentByLevel/taxAmount/color/zoneId 兼容字段（渲染层改用 basePrice/buildingLevels/taxRate/groupId）；tsc 0 |
| P2-5 | 收敛 engine.ts 导出范围 | engine.ts、相关测试/页面 import | 仅保留 reducer、createInitialState、rollDice、getDiceCount、Action 类型；其余由调用方从 engine/*.ts import；tsc/lint 通过 |
| P2-6 | 修复 lint errors | god.test.ts、economy.ts、god.ts、saveStorage.ts、SaveLoadModal.tsx | npx eslint src/game/monopoly src/pages/monopoly 0 error |
| P2-7 | 补充 monopoly 单测到 337 条 | __tests__/*.test.ts | 重点补 DecisionModal/PlayerHUD/GamePanel/NewGameModal 交互或引擎边界用例；npm test -- --run monopoly ≥337 passed |
| P2-8 | 增强存档版本迁移 | engine/serializer.ts | migrateSaveVersion 对旧存档做字段级兼容（缺 itemDeck/mapName 等补默认值）；单测覆盖 |

### 5.4 P3 低优级

| 编号 | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P3-1 | 热斗模式转换收敛到 loader.ts | engine.ts、engine/loader.ts | createInitialState 调用 applyVariantToBoard 而非内联 map；engine.test.ts 热斗用例通过 |
| P3-2 | 为 DecisionModal 各选项提供 preview 渲染 | pages/monopoly/DecisionModal.tsx | 人类玩家可直观看到每个选项的预计现金变化与说明 |
| P3-3 | GamePanel.tsx:30 变量名语义修正 | pages/monopoly/GamePanel.tsx | inHospital 判断改用 hospitalTurns 或修改变量名 |

---

## 6. 验收命令（低阶模型每完成一个 Phase 必须执行）

```bash
cd Z:/Playground/novelhelper/frontend

# 类型检查
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit

# 构建
npm run build

# 单测
npm test -- --run monopoly
# 目标：monopoly 子集 ≥337 passed；当前 282

# lint
npx eslint src/game/monopoly src/pages/monopoly
# 目标：0 error
```

终态额外验收：
- 完整对局可玩通（购买/升级/租金/卡片/道具/神明/事件/银行/股票/破产/胜负）。
- 大富翁4/10/11 配置可切换；热斗模式地图正确转换。
- AI 三档行为差异可观察；LLM 决策可启用并降级。
- 存档/读档状态一致。
- 用 M2 真实角色卡新建游戏并显示头像。

---

## 7. 给实施代理的风险提示

1. 不要跨优先级并行修改数据与引擎：先修 P1 引擎规则（走动/租金/破产/物价），再批量修正数据文件，否则数据参数会被引擎忽略或报错。
2. 数据文件语义冲突必须问用户：新闻/魔法屋描述与 effect 不一致时，列出具体条目 ID 让用户确认方向，禁止脑补。
3. 保留旧单测作为参考：重写 turn.test.ts/board.test.ts/player.test.ts 前，先读懂现有 282 条覆盖的边界。
4. Tile 兼容字段删除会影响渲染层：移除 price/rentByLevel 等字段时，同步修改 Board.tsx/Board3D.tsx/Tile.tsx/GamePanel.tsx 的读取位置。
5. git 由用户手动执行：建议每完成一个 P0/P1 大项后提醒用户提交，避免一次 diff 过大。

---

## 附录 A：关键文件定位

| 设计概念 | 当前实现位置 |
|---|---|
| 新 GameState | frontend/src/game/monopoly/types.ts:653-670 |
| Tile（string id） | frontend/src/game/monopoly/types.ts:110-135 |
| TurnContext/TurnPhaseV2 | frontend/src/game/monopoly/types.ts:694-733 |
| 引擎组合根 | frontend/src/game/monopoly/engine.ts |
| 地图加载器 | frontend/src/game/monopoly/engine/loader.ts |
| TurnFSM | frontend/src/game/monopoly/engine/turn.ts |
| 租金/地产 | frontend/src/game/monopoly/engine/board.ts |
| 破产清算 | frontend/src/game/monopoly/engine/player.ts |
| 物价指数/银行/股票 | frontend/src/game/monopoly/engine/economy.ts |
| 卡片 | frontend/src/game/monopoly/engine/card.ts |
| 道具 | frontend/src/game/monopoly/engine/item.ts |
| 神明 | frontend/src/game/monopoly/engine/god.ts |
| AI 控制器 | frontend/src/game/monopoly/engine/ai.ts |
| LLM 决策 | frontend/src/game/monopoly/engine/ai-llm.ts |
| 页面入口 | frontend/src/pages/monopoly/index.tsx |
| 决策弹窗 | frontend/src/pages/monopoly/DecisionModal.tsx |
| HUD | frontend/src/pages/monopoly/PlayerHUD.tsx |
| 操作面板 | frontend/src/pages/monopoly/GamePanel.tsx |
| 新游戏配置 | frontend/src/pages/monopoly/NewGameModal.tsx |

## 附录 B：数据文件整改速查

| 文件 | 主要问题 |
|---|---|
| maps/richman4-taiwan.json | tw_06/tw_25 SpaceType 与 companyType 未统一 |
| cards/richman4-cards.json | card-25/26 缺 companyId；多数卡片 effectParams 为空 |
| gods/richman4-gods.json | god-07 效果语义仍反向 |
| events/magic-house-events.json | 新增 ALL_GAIN_POINTS/GOD_POSSESSION/RENT_MULTIPLIER 等类型与 types.ts 枚举不同步 |
| events/news-events.json | 描述与 effect 不一致条目 7 处 |
| events/fate-events.json | fate-03/04/06/11 缺 params |
| config/richman11-hotfight.json | 缺 attackSpaceRatio |
| items/richman4-items.json | 全部 13 项缺 effectType/effectParams |

---

*报告结束。建议下一步：由用户确认是否启动 P0-1 ~ P1-6 高优引擎与 UI 修复。*
