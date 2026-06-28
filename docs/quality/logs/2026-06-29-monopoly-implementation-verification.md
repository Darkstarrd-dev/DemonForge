# 大富翁模块 M0–M11 修复结果 · 复核与待整改清单

> 审核依据：`docs/monopoly_full_plan.md`（2026-06-28 立项）
> 前序报告：`docs/quality/logs/2026-06-29-monopoly-implementation-reaudit.md`
> 审核目的：对 HANDOFF.md 声称已完成的 P0-1~P1-6 修复进行独立复核，确认属实项与仍遗漏项，输出供低阶模型逐项实施的最终清单。
> 代码版本：工作区未提交改动（2026-06-29）
> 审核范围：`frontend/src/game/monopoly/` + `frontend/src/pages/monopoly/` + 对应 JSON 数据文件
> 审核方式：核心文件精读 + 本地运行 tsc / vitest / eslint 验证

---

## 1. 验证快照

```bash
# 工作目录：Z:/Playground/novelhelper/frontend

# 1. 前端 app 类型检查
npx tsc -p tsconfig.app.json --noEmit
# 结果：0 error

# 2. 大富翁子集单测
npm test -- --run --reporter=dot monopoly
# 结果：16 files, 282/282 passed

# 3. lint（垄断模块）
npx eslint src/game/monopoly src/pages/monopoly
# 结果：6 errors（详见 §5.4）
```

---

## 2. 总体结论

| 维度 | 状态 | 一句话总评 |
|---|---|---|
| P0 阻塞级修复（HANDOFF 声称 4/4） | **已完成** | GamePanel 索引 bug、DecisionModal 全覆盖、PlayerHUD/GamePanel 经济信息均已落地。 |
| P1 高优级修复（HANDOFF 声称 6/6） | **已完成** | neighborIds 驱动、完整租金、分步破产清算、物价/分红触发、AI 随机源外置、道具数据驱动均已完成。 |
| P2 中优级遗留 | **仍有多项** | 数据文件语义错误、Tile 兼容字段、engine.ts 导出收敛、lint 清零、单测补充、存档迁移。 |
| P3 低优级遗留 | **仍有多项** | GamePanel 变量名语义、热斗模式转换收敛、DecisionModal preview。 |
| 代码质量 | **需收尾** | 282 测试 < 337 目标；6 lint errors；部分硬编码 ID 残留；类型与数据不同步。 |

**综合判定**：HANDOFF.md 对 P0/P1 的完成声明**基本属实**，但复审报告中的 P2/P3 整改项及若干新发现的质量问题仍未完成。若直接视为“修复完毕”，低阶模型在后续 M2–M12 扩展时仍会遇到数据/类型不一致、lint 失败、测试覆盖不足等阻塞。

---

## 3. 逐项符合性矩阵

| 设计维度 | 方案要求 | 实际状态 | 严重等级 |
|---|---|---|---|
| `GameState` 唯一真相源 | `FullGameState` 改名为 `GameState` | 已完成 | 符合 |
| `Tile.id: string` | 格子 ID 升级为 string | 已完成 | 符合 |
| `BoardState` 运行时状态 | 含 data/tiles/properties/sealedGroups/priceUpGroups/boardTraps | 已完成 | 符合 |
| `TurnContext` + `TurnPhaseV2` | 12 阶段状态机 | 已完成 | 符合 |
| P0-1 GamePanel 索引 bug | `t.index`→`t.id` | 已完成（GamePanel.tsx:51） | 符合 |
| P0-2 DecisionModal 全覆盖 | 14 种 DecisionKind 有文案 | 已完成 | 符合 |
| P0-3 PlayerHUD 经济信息 | 总资产/银行/贷款/股票/神明/交通/地产 | 已完成 | 符合 |
| P0-4 GamePanel 经济面板 | 新增「经济概况」 | 已完成 | 符合 |
| P1-1 走动逻辑 neighborIds | `advanceOnRing` 沿 neighborIds 驱动 | 已完成（turn.ts:25-51） | 符合 |
| P1-2 完整租金公式 | 联合租金/连锁店/摩天楼/查封/涨价/住院 | 已完成（board.ts:8-72） | 符合 |
| P1-3 破产清算分步 | 出售建筑→抵押→归债权方 | 已完成（player.ts:8-70） | 符合 |
| P1-4 物价指数+分红 | `handleEndTurn` 触发 | 已完成，触发点位于 `engine.ts:END_TURN`（lines 131-132）而非 `turn.ts:handleEndTurn` | 符合 |
| P1-5 AI 随机源外置 | `aiNextAction` 不直接 `Math.random()` | 已完成，改调 `rollDice()`（ai.ts:72） | 符合 |
| P1-6 道具效果数据驱动 | effectType/effectParams + 按类型分派 | 已完成（item.ts:118-218，items.json 已填） | 符合 |
| P2-2 数据文件语义修正 | 新闻/命运/魔法屋 type 与枚举同步 | **未完成**：魔法屋大量使用未纳入 `MagicHouseEffect.type` 联合枚举的类型；新闻描述与 effect 不一致；命运部分缺 params | P2 |
| P2-4 清理 Tile 兼容字段 | 移除 price/upgradeCost/rentByLevel/taxAmount/color/zoneId | **未完成**（types.ts:128-135 仍保留） | P2 |
| P2-5 收敛 engine.ts 导出 | 仅保留 reducer、createInitialState、rollDice、Action 类型 | **未完成**（engine.ts:143-159 大量 re-export） | P3 |
| P2-6 lint 清零 | 0 error | **未完成**：6 errors | P2 |
| P2-7 单测数量 | ≥337 绿 | **未完成**：282/282 | P2 |
| P2-8 存档迁移 | migrateSaveVersion 字段级兼容 | **未完成**（serializer.ts 迁移较简单） | P3 |
| P3-1 热斗模式转换收敛 | `createInitialState` 调用 `applyVariantToBoard` | **未完成**（engine.ts:28-37 内联转换） | P3 |
| P3-3 GamePanel 变量名语义 | `inHospital` 改用 `hospitalTurns` | **未完成**（GamePanel.tsx:30 仍用 `jailTurns`） | P3 |

---

## 4. 详细发现

### 4.1 P0/P1 已确认完成项

以下项经代码精读确认已落地，低阶模型无需重复实施。

| 编号 | 证据 | 说明 |
|---|---|---|
| P0-1 | `GamePanel.tsx:51` `state.board.properties[t.id]` | 对手地产列表已改用 string ID |
| P0-2 | `DecisionModal.tsx:5-38` | 14 种 DecisionKind 均有文案分支 |
| P0-3 | `PlayerHUD.tsx:67-80` | Tooltip 显示总资产/银行存款/贷款/持股/神明/交通工具/地产数/点数 |
| P0-4 | `GamePanel.tsx:167-207` | 「经济概况」面板显示总资产/银行/股票/神明/交通工具 |
| P1-1 | `turn.ts:25-51` | `advanceOnRing` 优先沿 `neighborIds` 移动，仅无 neighborIds 时 fallback 到 index 取模 |
| P1-2 | `board.ts:8-72` | `calculateRent` 覆盖住院/查封/摩天楼/连锁店/同路段联合租金/涨价 |
| P1-3 | `player.ts:8-70` | `liquidate` 分三步：降级建筑（50% buildCost）→ 抵押（50% basePrice）→ 转移产权给债权方 |
| P1-4 | `engine.ts:129-137` | `END_TURN` 分支依次调用 `updatePriceIndex` / `handleDividend` / `tickGodDurations` / `tickTimedBombs` / `refreshItemShop` |
| P1-5 | `ai.ts:72` | `aiNextAction` 在 ROLL_DICE 阶段调用 `rollDice()`；随机源封装在 `engine/dice.ts` |
| P1-6 | `item.ts:118-218` / `data/items/richman4-items.json` | 13 种道具均填 effectType/effectParams，应用逻辑按 effectType 分派 |

### 4.2 P2 中优级未完成项

#### P2-2 数据文件语义错误

#### 4.2.1 魔法屋事件类型与 TypeScript 枚举不同步

`MagicHouseEffect.type` 当前联合类型（`types.ts:448`）：

```typescript
type: EventEffectType | 'TELEPORT' | 'GIVE_CARD' | 'STEAL_ALL_ITEMS' | 'CHANGE_VEHICLE'
```

但 `data/events/magic-house-events.json` 已使用以下不在联合类型中的值：

| id | 使用 type | 问题 |
|---|---|---|
| mh-05 | `ALL_GAIN_POINTS` | 未在联合类型中 |
| mh-07 | `GOD_POSSESSION` | 未在联合类型中 |
| mh-08 | `RENT_MULTIPLIER` | 未在联合类型中 |
| mh-09 | `FREE_UPGRADE` | 未在联合类型中 |
| mh-10 | `SEND_TO_HOSPITAL` | 未在联合类型中 |
| mh-12 | `CASH_MULTIPLY` | 未在联合类型中 |
| mh-13 | `DOWNGRADE_ALL` | 未在联合类型中 |
| mh-14 | `TOLL_FREE` | 未在联合类型中 |

当前 tsc 之所以通过，是因为 JSON 加载后使用 `as NewsEvent[]` / `as MagicHouseEffect[]` 类型断言，绕过了字面量检查。运行时若 `engine/event.ts` 未处理这些类型，则事件无效果。

#### 4.2.2 新闻事件描述与 effect 不一致

| id | 描述 | 实际 effect | 问题 |
|---|---|---|---|
| news-04 | 利率下调 | `ALL_GAIN_CASH 200` | 描述与 effect 无关，应改为 `DEPOSIT_RATE_ADJUST` |
| news-07 | 最富玩家损失 1500 | `ALL_LOSE_CASH 500 target:ALL` | target 应为 `RICHEST`，value 应为 1500 |
| news-09 | 经济衰退 | `PROPERTY_PRICE_DOWN 0.15` | 应为 `PRICE_INDEX_DOWN` |
| news-10 | 科技突破 | `STOCK_SURGE 1.5 target:ALL` | 缺少 `companyFilter: TECH_COMPANY` |
| news-12 | 商店卡片半价 | `ALL_GAIN_CASH 300` | 应为 `SHOP_DISCOUNT` |
| news-13 | 交通大罢工 | `ALL_LOSE_CASH 200` | 应为 `SET_VEHICLE` 并带持续回合 |
| news-16 | 土地重划 | `PROPERTY_PRICE_UP 0.3 target:ALL` | 缺少 `groupId` / `duration` |

#### 4.2.3 命运事件缺 params

| id | effect | 问题 |
|---|---|---|
| fate-03 | `TELEPORT` | params 为空，缺 `mode` / `spaceId` / `targetType` |
| fate-04 | `GIVE_CARD` | params 为空，缺 `cardId` 或 `random: true` |
| fate-06 | `GOD_POSSESSION` | params 为空，缺 `godId` 或 `random: true` |
| fate-11 | `GIVE_CARD` | params 为空，缺 `cardId` 或 `random: true` |

#### 4.2.4 神明语义仍反向

`data/gods/richman4-gods.json` 中 `god-07`（衰神）为 `alignment: BAD`，但 effect 为 `RENT_BOOST target: SELF`，对自身收租加成属于正面效果，方向错误。建议改为 `RENT_REDUCE` 或调整 target 为 `OPPONENT`。

#### 4.2.5 卡片参数仍大量为空

30 张卡片中除 card-00/08/09/22/23/25/26/27/28 外，其余 22 张 `effectParams` 为空。例如：
- card-02/15 `DEMOLISH_ONE` 缺目标选择方式
- card-03 `UPGRADE_GROUP` 缺 groupId 选择方式
- card-10/13 `SWAP_LAND`/`SWAP_BUILDING` 缺目标玩家选择方式
- card-25/26 `STOCK_UP`/`STOCK_DOWN` 缺 `companyId` 或 `selectable: true`

#### P2-4 清理 Tile 兼容字段

`types.ts:128-135` 仍保留旧兼容字段：

```typescript
price?: number
upgradeCost?: number
rentByLevel?: number[]
taxAmount?: number
color?: string
zoneId?: string
```

这些字段由 `boardDataToBoardConfig` 桥接产出，但设计方案要求运行时统一使用 `basePrice` / `buildingLevels` / `taxRate` / `groupId`。清理时需同步修改所有读取位置（`Board.tsx` / `Board3D.tsx` / `Tile.tsx` / `GamePanel.tsx` / `turn.ts` / `board.ts` 等）。

#### P2-5 收敛 engine.ts 导出范围

`engine.ts:143-159` 仍 re-export 大量子系统函数，违反设计方案「薄组合根」原则。应仅保留：

```typescript
export { reducer, createInitialState }
export type { Action }
export { rollDice, getDiceCount }
```

其余函数由调用方从 `engine/*.ts` 直接 import。

#### P2-6 lint 未清零

```text
src/game/monopoly/engine/saveStorage.ts:16:28  no-explicit-any
src/game/monopoly/engine/saveStorage.ts:22:28  no-explicit-any
src/game/monopoly/engine/saveStorage.ts:28:28  no-explicit-any
src/game/monopoly/engine/saveStorage.ts:34:28  no-explicit-any
src/game/monopoly/engine/saveStorage.ts:94:51  no-explicit-any
src/pages/monopoly/SaveLoadModal.tsx:34:28     react-hooks/set-state-in-effect
```

#### P2-7 单测数量不足

当前大富翁子集 282 条测试，距离 337 目标差 55 条。优先补充：
- `turn.test.ts`：neighborIds 分叉路、住院跳过、物价指数触发、分红触发
- `board.test.ts`：联合租金完整场景、连锁店、摩天楼、查封、涨价
- `player.test.ts`：分步破产清算边界（建筑刚好够还债 / 仍需抵押 / 转移产权）
- `DecisionModal` / `PlayerHUD` / `GamePanel` 交互单测
- `serializer.test.ts`：旧存档字段级迁移

#### P2-8 存档版本迁移较简单

`engine/serializer.ts` 的 `migrateSaveVersion` 目前较简单，未对缺 `itemDeck.mapName` / `economy.bankAccounts` / `turnContext.diceCount` 等旧字段做字段级兼容。应补全并加单测。

### 4.3 P3 低优级未完成项

#### P3-1 热斗模式转换收敛

`engine.ts:28-37` 在 `createInitialState` 中内联热斗模式转换。设计方案要求收敛到 `engine/loader.ts` 的 `applyVariantToBoard` 函数，使地图加载与变体解耦。

#### P3-2 DecisionModal preview 渲染

`DecisionOption.preview` 字段已存在，但 UI 仅简单显示 `cashDelta`（`DecisionModal.tsx:94-98`）。方案要求为各选项提供更完整的预计说明。

#### P3-3 GamePanel 变量名语义错误

`GamePanel.tsx:30`：

```typescript
const inHospital = current ? (current.jailTurns ?? 0) > 0 : false
```

变量名 `inHospital` 实际判断的是 `jailTurns`（监狱/住院共用字段的遗留），语义错误。建议：
- 若当前用 `jailTurns` 表示住院，则修改变量名/注释；
- 若需区分住院与监狱，则补充 `hospitalTurns` 判断。

### 4.4 新发现质量问题

以下问题不在前序复审报告中，但本次复核发现，建议一并修复。

#### Q-1 `turn.ts` 住院逻辑重复与字段混用

`turn.ts:66-75`：

```typescript
if ((player.jailTurns ?? player.jailTurns ?? 0) > 0) {
  const remainingJT = (player.jailTurns ?? player.jailTurns ?? 0) - 1
  // ...
}
```

重复 `??` 无意义；且 `jailTurns` 被用于表示住院回合，与字段语义不符。

`turn.ts:119-121`：

```typescript
if (tile.type === SpaceType.HOSPITAL) {
  player.jailTurns = HOSPITAL_TURNS
  player.jailTurns = HOSPITAL_TURNS  // 重复赋值
}
```

#### Q-2 建筑等级上限与摩天楼索引不一致

`turn.ts:8` 定义 `MAX_LEVEL = 4`（即 level 0..4 共 5 级），但 `board.ts:30-31` 使用 `prop.level >= 5 && buildingLevels[5]` 判断摩天楼。设计方案 `BuildingLevel.level` 为 0..5（共 6 级），代码存在索引/上限不一致。

#### Q-3 道具目标判断仍硬编码 ID

`item.ts:7-8`：

```typescript
const TARGET_TILE_ITEMS = ['item-02', 'item-03', 'item-04', 'item-05', 'item-07', 'item-08', 'item-09', 'item-11']
const TARGET_PLAYER_ITEMS = ['item-12']
```

虽已按 `effectType` 分派效果，但目标选择仍依赖硬编码 ID。建议改为按 `effectType` + `effectParams.targetMode` 判断。

#### Q-4 经济系统资产估值仍使用兼容字段

`economy.ts:244`：

```typescript
const price = tile?.price ?? 0
```

`calcPriceIndex` 使用 `Tile.price` 而非 `basePrice`，与 P2-4 清理兼容字段冲突。应统一改用 `basePrice`。

#### Q-5 `company.ts` 董事长特权未实现

`data/companies/richman4-companies.json` 中各公司含 `chairmanPrivilege` 字段，但 `engine/company.ts` 未按特权类型实现效果（如银行董事长免手续费、保险公司理赔等）。

#### Q-6 卡片反制链未与 TurnFSM 耦合

`engine/card.ts:487-515` 已实现 `resolveCardReaction`，但攻击卡触发后未进入 `TurnPhaseV2.CARD_USE_WINDOW` 阶段，反制窗口与状态机割裂。当前实现为：被攻击玩家在 `RESOLVE_DECISION` 阶段根据 awaitingDecision.kind === 'cardReaction' 处理，但阶段标记仍为原阶段。

---

## 5. 整改任务清单（供低阶模型逐项实施）

> 执行顺序建议：先 P2（数据与类型同步、lint、单测），后 P3；P2-4 与 Q-4 需同步修改。

### 5.1 P2 中优级

| 编号 | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P2-2a | 同步魔法屋事件类型到 TypeScript 枚举 | `types.ts`、可能新增 `MagicHouseEffectType` | `magic-house-events.json` 中所有 `type` 均合法；tsc 0 |
| P2-2b | 实现魔法屋新增类型效果 | `engine/event.ts` | 每种新增类型（ALL_GAIN_POINTS/GOD_POSSESSION/RENT_MULTIPLIER/FREE_UPGRADE/SEND_TO_HOSPITAL/CASH_MULTIPLY/DOWNGRADE_ALL/TOLL_FREE）均有处理分支；event.test.ts 补用例 |
| P2-2c | 修正新闻事件描述与 effect 不一致 | `data/events/news-events.json`、`types.ts` | 描述与 effect 一致；必要时扩展 `EventEffectType`（如 DEPOSIT_RATE_ADJUST/PRICE_INDEX_DOWN/SHOP_DISCOUNT/SET_VEHICLE）；validator.test.ts 通过 |
| P2-2d | 补齐命运事件 params | `data/events/fate-events.json` | fate-03/04/06/11 均有有效 params |
| P2-2e | 修正衰神语义 | `data/gods/richman4-gods.json` | god-07 effect 与 BAD 对齐（建议 RENT_REDUCE） |
| P2-2f | 补齐卡片 effectParams | `data/cards/richman4-cards.json` | 按 `richman.md` §4.2 逐张补参数；红/黑卡补 companyId 或 selectable |
| P2-4 | 清理 Tile 兼容字段 | `types.ts`、`engine/loader.ts`、所有渲染/引擎读取点 | 删除 `price/upgradeCost/rentByLevel/taxAmount/color/zoneId`；统一使用 `basePrice/buildingLevels/taxRate/groupId`；tsc 0；双地图渲染正常 |
| P2-5 | 收敛 engine.ts 导出 | `engine.ts`、相关 import | 仅保留 `reducer/createInitialState/rollDice/Action`；其余调用方改从 `engine/*.ts` import；tsc/lint 通过 |
| P2-6 | 修复 lint errors | `saveStorage.ts`、`SaveLoadModal.tsx` | `npx eslint src/game/monopoly src/pages/monopoly` 0 error |
| P2-7 | 补充 monopoly 单测到 337 条 | `__tests__/*.test.ts` | `npm test -- --run monopoly` ≥ 337 passed |
| P2-8 | 增强存档版本迁移 | `engine/serializer.ts` | migrateSaveVersion 对旧存档字段级兼容；serializer.test.ts 覆盖 |

### 5.2 P3 低优级

| 编号 | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| P3-1 | 热斗模式转换收敛到 loader.ts | `engine.ts`、`engine/loader.ts` | createInitialState 调用 `applyVariantToBoard`；engine.test.ts 热斗用例通过 |
| P3-2 | DecisionModal 各选项 preview 渲染 | `pages/monopoly/DecisionModal.tsx` | 每个选项显示预计现金变化与说明 |
| P3-3 | GamePanel 变量名语义修正 | `pages/monopoly/GamePanel.tsx:30` | `inHospital` 改用 `hospitalTurns` 或修改变量名与注释 |

### 5.3 新发现质量问题（Q-*）

| 编号 | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| Q-1 | 修复 turn.ts 住院逻辑重复与字段混用 | `engine/turn.ts` | 删除重复 `??` 与重复赋值；住院/监狱字段语义清晰 |
| Q-2 | 统一建筑等级上限与摩天楼索引 | `engine/turn.ts`、`engine/board.ts`、`types.ts` | `MAX_LEVEL` 与 `buildingLevels` 长度一致；摩天楼判断正确 |
| Q-3 | 道具目标判断改为 effectType 驱动 | `engine/item.ts` | 移除 TARGET_TILE_ITEMS/TARGET_PLAYER_ITEMS 硬编码 ID |
| Q-4 | 经济系统资产估值改用 basePrice | `engine/economy.ts` | 移除 `tile?.price` 读取； economy.test.ts 通过 |
| Q-5 | 实现公司董事长特权 | `engine/company.ts`、`data/companies/richman4-companies.json` | 每类 companyType 董事长特权生效；company.test.ts 覆盖 |
| Q-6 | 卡片反制链与 TurnFSM 耦合 | `engine/card.ts`、`engine/turn.ts` | 攻击卡触发后进入 `TurnPhaseV2.CARD_USE_WINDOW`；card.test.ts 覆盖陷害→免罪→嫁祸→复仇链 |

---

## 6. 验收命令（低阶模型每完成一个任务必须执行）

```bash
cd Z:/Playground/novelhelper/frontend

# 类型检查
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit

# 单测
npm test -- --run monopoly
# 目标：monopoly 子集 ≥ 337 passed；当前 282

# lint
npx eslint src/game/monopoly src/pages/monopoly
# 目标：0 error

# 构建（完成 P2/P3 阶段后）
npm run build
```

终态额外验收：
- 完整对局可玩通（购买/升级/租金/卡片/道具/神明/事件/银行/股票/破产/胜负）。
- 大富翁4/10/11 配置可切换；热斗模式地图正确转换。
- AI 三档行为差异可观察；LLM 决策可启用并降级。
- 存档/读档状态一致。
- 用 M2 真实角色卡新建游戏并显示头像。

---

## 7. 给实施代理的风险提示

1. **数据文件与类型必须同步修改**：不要只改 JSON 不改 `types.ts`，否则类型断言会隐藏运行时错误。
2. **清理 Tile 兼容字段是大范围改动**：删除 `price/upgradeCost/rentByLevel` 时，必须同步修改渲染层（`Board/Board3D/Tile/GamePanel`）和引擎层（`turn/board/economy`），否则构建通过但运行时异常。
3. **不要跨优先级引入新规则**：P2 阶段只做数据/类型/lint/单测收敛，不要顺手实现大富翁10/11 变体规则。
4. **保留旧单测作为回归基线**：重写 `turn.test.ts` / `board.test.ts` 前，先运行现有 282 条确认绿，再增量添加。
5. **git 由用户手动执行**：建议每完成一个 P2 大项后提醒用户提交，避免一次 diff 过大。
6. **字段语义冲突必须问用户**：新闻/魔法屋描述与 effect 不一致时，列出具体条目 ID 让用户确认方向，禁止脑补。

---

## 附录 A：关键文件定位

| 设计概念 | 当前实现位置 |
|---|---|
| 新 GameState | `frontend/src/game/monopoly/types.ts` |
| 引擎组合根 | `frontend/src/game/monopoly/engine.ts` |
| TurnFSM | `frontend/src/game/monopoly/engine/turn.ts` |
| 租金/地产 | `frontend/src/game/monopoly/engine/board.ts` |
| 破产清算 | `frontend/src/game/monopoly/engine/player.ts` |
| 物价指数/银行/股票 | `frontend/src/game/monopoly/engine/economy.ts` |
| 卡片 | `frontend/src/game/monopoly/engine/card.ts` |
| 道具 | `frontend/src/game/monopoly/engine/item.ts` |
| 神明 | `frontend/src/game/monopoly/engine/god.ts` |
| 事件 | `frontend/src/game/monopoly/engine/event.ts` |
| AI 控制器 | `frontend/src/game/monopoly/engine/ai.ts` |
| 页面入口 | `frontend/src/pages/monopoly/index.tsx` |
| 决策弹窗 | `frontend/src/pages/monopoly/DecisionModal.tsx` |
| HUD | `frontend/src/pages/monopoly/PlayerHUD.tsx` |
| 操作面板 | `frontend/src/pages/monopoly/GamePanel.tsx` |

## 附录 B：数据文件整改速查

| 文件 | 主要问题 |
|---|---|
| `data/events/magic-house-events.json` | 8 种 type 未纳入 `MagicHouseEffect.type` 联合枚举 |
| `data/events/news-events.json` | 7 处描述与 effect 不一致 |
| `data/events/fate-events.json` | fate-03/04/06/11 缺 params |
| `data/gods/richman4-gods.json` | god-07 效果语义反向 |
| `data/cards/richman4-cards.json` | 22 张卡片 effectParams 为空 |
| `data/companies/richman4-companies.json` | chairmanPrivilege 未在引擎实现 |

---

*报告结束。建议下一步：由用户确认是否启动 P2-2 数据文件语义修正与 P2-4 Tile 兼容字段清理。*
