# 大富翁模块说明文档

> 用途：以后需要增加 / 修改 / 删除大富翁模块内容时，读本文件了解模块结构、数据位置、扩展方法。
> 配套：实施计划见 `docs/monopoly_full_plan.md`；设计蓝本见 `ref/gamedesign/richman.md`；前序 P0–P6 记录见 `docs/monopoly_plan.md`。
> 读者：任何要改动大富翁模块的人（人或 AI 实施代理）。

---

## 1. 模块定位与设计哲学

### 1.1 定位
DemonForge（novelhelper）项目内独立游戏模块，复用项目 M2 角色卡、LLM 节点、SSE 流式、antd、Three。落点 `frontend/src/game/monopoly/`（规则引擎）+ `frontend/src/pages/monopoly/`（渲染 UI）。

### 1.2 设计哲学

| 原则 | 含义 | 实操 |
|---|---|---|
| 数据驱动 | 唯一真相源 `GameState`；内容数据外置 JSON | 引擎只加载不硬编码卡片/道具/神明/地图数值 |
| 逻辑与渲染分离 | 规则是纯函数 `reducer(state, action) → state` | `game/monopoly/` 禁止 import React/antd/Phaser/Three |
| 2D/3D 双视图 | 同一 `GameState` 驱动 2D 与 3D | 渲染层只读 state，互不影响逻辑 |
| 双预留 | 角色卡接入 + AI 驱动 | `Player.characterCardId` + `Player.controller/aiNodeId` + `DecisionRequest` |
| 资产驱动接口前置 | `AssetRef` 字段就位，资产后置零改动接入 | 当前 blockout 兜底，资产就绪后填 `assetRef` |
| 多版本兼容 | `GameConfig.version` 切换规则集 | 数据文件按版本分目录 |
| 简洁优先 | 每个文件/函数只做一件事 | 不引入未被要求的抽象 |

---

## 2. 目录结构说明

```
frontend/src/game/monopoly/              ← 规则引擎（纯 TS，零渲染依赖）
  types.ts                               全部 interface/enum（按子系统分块注释）
  engine.ts                              组合根 reducer + createInitialState（薄路由）
  engine/
    board.ts                             Board 子系统：地图/地产/路段/联合租金/抵押
    player.ts                            Player 子系统：破产清算/资产计算
    card.ts                              Card 子系统：30种卡片效果 + 反制链
    item.ts                              Item 子系统：13种道具效果 + 研发
    god.ts                               God 子系统：神明附身/变身/送神
    turn.ts                              TurnFSM：回合状态机 + 状态转移
    economy.ts                           Economy：物价指数/银行/股票/分红
    event.ts                             事件池：新闻/魔法屋/命运/宝箱/乐透/传送
    company.ts                           公司企业：董事长/过路费/股票
    ai.ts                                AI 控制器入口：aiNextAction + aiDecide
    ai-strategies.ts                     三档难度规则实现（easy/normal/hard）
    ai-llm.ts                            LLM 决策实现（复用 streamChat）
    validator.ts                         数据校验（连通性/引用完整性/枚举合法）
    loader.ts                            数据加载器（loadMap/loadCards/loadItems/...）
    serializer.ts                        存档/读档序列化
  data/                                  ← 内容数据文件（JSON，可编辑）
    maps/
      classic-40.json                    经典40格环形预设
      richman4-taiwan.json               台湾地图（约36格）
    cards/
      richman4-cards.json                30种卡片定义
      richman10-cards.json               大富翁10卡片变体
    items/
      richman4-items.json                13种道具
    gods/
      richman4-gods.json                 13种神明
    characters/
      richman4-characters.json           12名角色（或运行时映射 M2 EntityCard）
    companies/
      richman4-companies.json            7类公司
    events/
      news-events.json                   20条新闻
      magic-house-events.json            15条魔法屋
      fate-events.json                   命运点事件
    minigames/
      minigame-definitions.json          小游戏定义
    config/
      richman4-default.json              大富翁4默认配置
      richman10-online.json              大富翁10联网差异
      richman11-hotfight.json            大富翁11热斗配置

frontend/src/pages/monopoly/             ← 渲染 + UI（DOM/CSS + antd，blockout 阶段）
  index.tsx                              页面入口（useReducer 接引擎 + AI 自动循环 useEffect）
  Board.tsx                              2D 棋盘（CSS Grid 环形，订阅 GameState）
  Board3D.tsx                            3D 棋盘（Three，订阅 GameState via stateRef）
  Tile.tsx                               2D 单格
  PlayerHUD.tsx                          玩家资产条
  GamePanel.tsx                          右侧操作面板（骰子/操作/我的地产/日志）
  DecisionModal.tsx                      决策弹窗
  NewGameModal.tsx                       新游戏配置（地图/角色/难度/控制器选择）
  panels/                                后置：各子系统操作面板
    HandPanel.tsx                        手牌面板
    BankPanel.tsx                        银行操作面板
    StockPanel.tsx                       股票交易面板
    GodPanel.tsx                         神明状态面板
    ItemPanel.tsx                        道具持有/使用面板
```

### 每个文件职责一句话
- `types.ts`：所有数据形状定义，是引擎与渲染层的契约。
- `engine.ts`：reducer 路由表，把 `Action` 派发给对应子系统 handler。
- `engine/board.ts`：地图/地产/路段/联合租金/抵押赎回的规则。
- `engine/player.ts`：玩家资产计算、破产清算流程。
- `engine/card.ts`：30 种卡片的效果执行 + 反制链（REACTION 窗口）。
- `engine/item.ts`：13 种道具的持有/使用/研发/武器投放。
- `engine/god.ts`：神明附身/定时离开/变身/送神符。
- `engine/turn.ts`：回合状态机（TURN_START→...→TURN_END）+ 骰子移动 + 落点结算。
- `engine/economy.ts`：物价指数（双模式）+ 银行存贷 + 股票 + 月中分红。
- `engine/event.ts`：新闻/魔法屋/命运/宝箱/乐透/传送的事件触发与结算。
- `engine/company.ts`：公司企业格子落点（董事长特权、过路费、股票操作）。
- `engine/ai.ts`：AI 玩家自动行动入口（`aiNextAction` + `aiDecide`）。
- `engine/ai-strategies.ts`：三档难度的规则式决策实现。
- `engine/ai-llm.ts`：LLM 决策实现（读 `aiNodeId` + 角色卡 persona，调 `streamChat`）。
- `engine/validator.ts`：加载 JSON 数据时校验（地图连通、引用完整、枚举合法、等级连续）。
- `engine/loader.ts`：从 `data/*.json` 加载内容数据，组装运行时定义表。
- `engine/serializer.ts`：`GameState` ↔ `SaveGame` 文件 IO。
- `data/**/*.json`：所有可编辑的数值与内容（地图/卡片/道具/神明/角色/公司/事件/小游戏/配置）。

---

## 3. 数据模型速查

> 完整定义见 `types.ts`。这里给关键 interface 一览，方便快速定位。

### 3.1 顶层
```typescript
GameState {
  version, mapId, day, phase: GamePhase, turnContext: TurnContext,
  board: BoardState, players: Player[], cardDeck: CardDeckState,
  economy: EconomyState, config: GameConfig,
  pendingEvents: GameEvent[], awaitingDecision?: DecisionRequest,
  log: GameLogEntry[], rngSeed, status, winnerId?
}
```

### 3.2 地图
```typescript
BoardData { mapId, version, name, size, tiles: Tile[], groups: PropertyGroup[], boardShape, layers: TilemapLayer[] }
Tile { id, index, type: SpaceType, name, coord, neighborIds, groupId?, landType?, basePrice?, buildingLevels?, assetRef? }
PropertyState { tileId, ownerId?, level: 0..5, mortgaged, isChainStore }
AssetRef { spriteId?, modelId?, scale?, rotation?, idleAnimId?, actionAnimId?, effects? }
```

### 3.3 玩家
```typescript
Player {
  id, name, characterCardId?, isAI, aiDifficulty?, color,
  cash, totalAssets, ownedTileIds: string[], bankDeposit, bankLoan, loanDueDay, stocks: Record<companyId, number>,
  position: string, previousPosition: string,
  hand: CardInstance[], items: ItemInstance[],
  status: PlayerStatus, jailTurns, hospitalTurns, skipTurns, isCollectingRent, consecutiveDoubles,
  godId?, godRemainingDays, points, vehicle,
  controller: 'human'|'ai', aiNodeId?
}
```

### 3.4 卡片 / 道具 / 神明
```typescript
CardDefinition { id, name, description, pointCost, targetType, effectType: CardEffectType, effectParams, useTiming: CardUseTiming, stackable, duration, canUseOnCompany, counterCards: string[], versions, iconAssetRef? }
ItemDefinition { id, name, description, category: ItemCategory, pointCost, acquireMethod, effectRange, durability, versions, iconAssetRef? }
GodDefinition { id, name, alignment, durationDays, canDismiss, transformTo?, effects: GodEffect[], iconAssetRef? }
```

### 3.5 经济
```typescript
EconomyState { priceIndex, initialCash, initialPlayerCount, bankruptCount, priceIndexMode, bankAccounts, companies, dividendDay, depositInterestRate, loanTermDays }
BankAccount { playerId, deposit, loan, loanDueDay }
CompanyState { companyId, stockPrice, stockLimitUpDays, stockLimitDownDays, shareholders, chairmanId? }
```

### 3.6 事件
```typescript
NewsEvent { id, title, description, effect: EventEffect }
MagicHouseEffect { id, description, type, params, isPositive }
FateEvent { id, title, description, effect, params }
MiniGameDef { id, name, triggerCondition, rewardFormula, penaltyFormula, gameModuleId? }
```

### 3.7 配置
```typescript
GameConfig {
  playerCount, startingCash, mapId,
  victoryCondition, targetAssets?, maxTurns?,
  diceMode, allowDoubleRoll, allowConsecutiveDoublesJail,
  priceIndexEnabled, priceIndexMode, bankEnabled, stockEnabled, initialDeposit,
  cardHandLimit, pointSystem,
  bankruptcyMode,
  gameMode, variant,
  renderMode, version
}
```

### 3.8 决策点与 Action
```typescript
DecisionRequest { playerId, kind: DecisionKind, options: DecisionOption[], context, cardUseWindowFor? }
Action = NEW_GAME | LOAD_GAME | ROLL_DICE | CHOOSE_PATH | END_TURN | RESOLVE_DECISION
       | PURCHASE_PROPERTY | DECLINE_PURCHASE | BUILD_STRUCTURE | DECLINE_BUILD
       | MORTGAGE_PROPERTY | REDEEM_PROPERTY
       | USE_CARD | USE_ITEM | BUY_CARD | BUY_ITEM
       | BANK_DEPOSIT | BANK_WITHDRAW | BANK_LOAN | BANK_REPAY
       | BUY_STOCK | SELL_STOCK
       | PAY_JAIL_FEE | USE_JAIL_CARD | DECLARE_BANKRUPT
       | TRIGGER_EVENT | MINI_GAME_RESULT
```

---

## 4. 规则引擎工作原理

### 4.1 reducer 路由
`engine.ts` 是薄路由：`switch (action.type)` 把 action 派发给对应子系统 handler。每个 handler 是纯函数 `(state, action) → state`，返回新 state（不可变更新）。

### 4.2 回合状态机（TurnFSM）
```
TURN_START → ROLL_DICE → MOVING → SPACE_RESOLUTION
  → PURCHASE_DECISION | BUILD_DECISION | RENT_PAYMENT | SPECIAL_SPACE
  → CARD_USE_WINDOW（反制窗口，REACTION 类卡片）
  → STOCK_TRADE（可选）
  → TURN_END
```
- 引擎推进到需要选择时，进入 `phase=DECIDE`（或对应的决策阶段）并挂出 `awaitingDecision`。
- 谁产生消解该决策的 `Action` 由 `Player.controller` 决定（human=UI 按钮，ai=`aiDecide`）。

### 4.3 决策点（双预留核心）
所有「玩家要做选择」的时刻统一建模成 `DecisionRequest`。一个抽象同时喂饱「手感 UI」和「AI 驱动」：
- `HumanController`：`DecisionModal` 把 `options` 渲染成 antd 按钮，等用户点。
- `AIController`：`aiDecide(state, request)` 规则式选 option；或 `ai-llm.ts` 调 LLM 选 option。

### 4.4 随机源外置
- 骰子、事件抽取、神明随机效果等随机操作在 reducer 之外调用，结果经 action 传入，保持 reducer 纯、StrictMode 下重复调用安全。
- `rngSeed` 用于可复现回放/调试。

### 4.5 不可变更新
所有 handler 返回新 state，不修改原 state。`players`/`properties` 等用 `{ ...state.players }` 浅拷贝 + 元素 `{ ...p }` 浅拷贝。

---

## 5. 内容数据如何增删改（★最重要）

> 所有内容数据是 `frontend/src/game/monopoly/data/**/*.json` 下的 JSON 文件。引擎通过 `loader.ts` 加载。改内容 = 改 JSON，不改代码。

### 5.1 添加新卡片
1. 编辑 `data/cards/<version>-cards.json`，追加一个对象：
```json
{
  "id": "card-30",
  "name": "新卡片名",
  "description": "效果描述",
  "pointCost": 50,
  "targetType": "OPPONENT",
  "effectType": "SEND_TO_JAIL",
  "effectParams": { "days": 5 },
  "useTiming": "ON_TURN",
  "stackable": false,
  "duration": 0,
  "canUseOnCompany": false,
  "counterCards": ["card-20"],
  "versions": ["richman4"],
  "iconAssetRef": null
}
```
2. 若引入新的 `effectType`，需在 `types.ts` 的 `CardEffectType` 枚举加成员，并在 `engine/card.ts` 加对应 handler 分支。
3. 若该卡可被反制，把能反制它的卡 ID 加到 `counterCards`；同时在反制卡的 `counterCards` 反向引用（视反制链设计）。
4. 重启应用，`loader.ts` 自动加载。`validator.ts` 校验 `effectType` 合法、`counterCards` 引用存在。

### 5.2 添加新道具
1. 编辑 `data/items/<version>-items.json`，追加对象：
```json
{
  "id": "item-13",
  "name": "新道具",
  "description": "效果",
  "category": "TOOL",
  "pointCost": 30,
  "acquireMethod": "SHOP",
  "effectRange": -1,
  "durability": -1,
  "versions": ["richman4"]
}
```
2. 若引入新效果，在 `engine/item.ts` 加 handler 分支。

### 5.3 添加新神明
1. 编辑 `data/gods/<version>-gods.json`，追加对象：
```json
{
  "id": "god-13",
  "name": "新神明",
  "alignment": "GOOD",
  "durationDays": 7,
  "canDismiss": true,
  "transformTo": null,
  "effects": [{ "type": "RENT_BOOST", "value": 1.5, "target": "SELF" }]
}
```
2. 若引入新效果类型，在 `types.ts` 的 `GodEffect.type` 联合加成员，在 `engine/god.ts` 加 handler。

### 5.4 添加新角色
两种方式：
- **方式A（数据文件）**：编辑 `data/characters/<version>-characters.json`，追加角色对象。
- **方式B（M2 EntityCard 映射，推荐）**：在 M2 模块创建角色卡（`EntityCard.type='character'`），大富翁模块运行时调 `mapEntityCardToCharacter(card)` 自动映射。`NewGameModal` 角色选择器读 `store.cards`（M2 角色卡列表）。

```typescript
// engine/loader.ts
function mapEntityCardToCharacter(card: EntityCard): MonopolyCharacter {
  return {
    id: card.id,
    name: card.name,
    persona: `${card.description}\n语言风格：${card.styleNote ?? ''}\n例句：${(card.styleExamples ?? []).join('；')}`,
    color: generateColorFromName(card.name),
    avatarAssetRef: card.coverImageId ? { spriteId: card.coverImageId } : undefined,
  }
}
```

### 5.5 添加新公司
1. 编辑 `data/companies/<version>-companies.json`，追加对象：
```json
{
  "id": "company-07",
  "name": "新公司",
  "type": "TECH_COMPANY",
  "initialStockPrice": 100,
  "chairmanPrivilege": "持股>50% 时踩本公司免过路费"
}
```
2. `CompanyType` 枚举如需新类型，在 `types.ts` 加成员。

### 5.6 添加新闻 / 魔法屋 / 命运事件
- 新闻：编辑 `data/events/news-events.json`，追加 `NewsEvent`。
- 魔法屋：编辑 `data/events/magic-house-events.json`，追加 `MagicHouseEffect`。
- 命运：编辑 `data/events/fate-events.json`，追加 `FateEvent`。

字段对齐 `types.ts` 对应 interface。若引入新 `EventEffectType`，在枚举加成员 + `engine/event.ts` 加 handler。

### 5.7 添加小游戏
1. 编辑 `data/minigames/minigame-definitions.json`，追加 `MiniGameDef`。
2. `gameModuleId` 指向具体玩法模块（后置：独立子游戏）。本轮只定义触发条件与奖惩公式，玩法模块后置。

### 5.8 添加新地图
1. 在 `data/maps/` 新增 `<mapId>.json`，结构对齐 `BoardData`：
```json
{
  "mapId": "richman4-japan",
  "version": "richman4",
  "name": "日本地图",
  "size": 36,
  "tiles": [ /* Tile[] */ ],
  "groups": [ /* PropertyGroup[] */ ],
  "boardShape": { "kind": "ring", "gridSide": 11 },
  "layers": []
}
```
2. `tiles` 必须含完整 `id`/`index`/`type`/`name`/`coord`/`neighborIds`。
3. `validator.ts` 会校验：neighborIds 构成连通图、引用 ID 都存在、地产格有 `groupId` 且在 `groups` 中存在、`buildingLevels` 等级 0–5 连续。
4. `NewGameModal` 地图选择器自动列出 `data/maps/*.json`。

### 5.9 添加新变体（热斗模式等）
1. 在 `data/config/` 新增配置 JSON，`variant` 字段设 `'hot_fight'`。
2. 若变体需要新规则分支（如 ATTACK_SPACE 替换 PROPERTY），在 `engine/turn.ts` 或 `engine/board.ts` 按 `config.variant` 加分支。
3. `loadVariantRules(config)` 函数（`engine/loader.ts`）按 `variant` 返回对应规则集。

---

## 6. AI 接入方式

### 6.1 规则式三档难度（默认）
- `Player.aiDifficulty` 决定难度：`easy` / `normal` / `hard`。
- `engine/ai-strategies.ts` 三档配置见 `docs/monopoly_full_plan.md` §6.1。
- `aiNextAction(state)` 根据当前回合阶段返回 AI 玩家应执行的下一个 action；`aiDecide(state, request)` 在决策点选 option。

### 6.2 LLM 驱动（可选增强）
- `Player.aiNodeId` 指向 `ProviderNode.id`（项目 LLM 节点配置）。
- `engine/ai-llm.ts` 读 `aiNodeId` 取节点 baseURL/apiKey/model + `characterCardId` 取角色 persona，拼 prompt：
  ```
  system: 你是角色 {persona}，正在玩大富翁。
  user: 当前状态摘要：{state 摘要}。
        合法动作：{options}。
        请选择一个动作，只返回动作 ID。
  ```
- 调 `services/real/chat.ts:streamChat(params, events, signal)`，解析流式输出为 option ID。
- LLM 失败时降级到规则式（easy 档兜底）。

### 6.3 自动循环编排
`pages/monopoly/index.tsx` 的 `useEffect`：
```typescript
useEffect(() => {
  const action = aiNextAction(state)
  if (!action) return
  const timer = setTimeout(() => dispatch(action), AI_DELAY)
  return () => clearTimeout(timer)
}, [state])
```
轮到 AI 玩家时自动推进；轮到 human 玩家时停下等 UI 操作。

---

## 7. 2D/3D 渲染适配层

### 7.1 渲染层只读 state
- `Board.tsx`（2D）/ `Board3D.tsx`（3D）接收 `state: GameState`，只读不写。
- 所有修改通过 `dispatch(action)`。
- 2D/3D 切换在 `pages/monopoly/index.tsx` 顶栏 `Segmented`，不重建 state。

### 7.2 资产驱动（当前 blockout 兜底，资产就绪后填 assetRef）
- 当前：`Tile` 无 `assetRef` 时，2D 走色块 + 文字，3D 走几何体。
- 资产就绪后：`Tile.assetRef.spriteId` → 2D 从 Sprite Sheet 取瓦片；`Tile.assetRef.modelId` → 3D 用 `GLTFLoader` 加载模型。
- 渲染层对 `assetRef` 为 undefined 走 blockout 兜底，**不改逻辑层**。

### 7.3 Tilemap Editor（后置）
- 输入：`BoardData` JSON。
- 编辑：刷瓦片、放对象、连线 neighborIds、设 groupId、配置经济参数、预览 2D/3D。
- 输出：补全 `layers` + `assetRef` 的 `BoardData` JSON。
- `BoardData.layers` 与 `Tile.assetRef` 结构已为其就位。

---

## 8. Tilemap Editor 预留接口

### 8.1 数据结构（已在 `types.ts` 定义）
- `BoardData.layers: TilemapLayer[]`：图层列表。
- `TilemapLayer`：`{ id, name, type: 'tile'|'object'|'decoration', visible, zIndex, data }`。
- `TilemapObject`：`{ id, spriteId?, modelId?, coord, assetRef? }`。
- `AssetRef`：`{ spriteId?, modelId?, scale?, rotation?, idleAnimId?, actionAnimId?, effects? }`。

### 8.2 Editor 与引擎的契约
- Editor 产出的 JSON 必须通过 `validator.ts` 校验。
- Editor 不修改 `Tile` 的 `type`/`neighborIds`/`groupId`/经济参数（这些是规则数据，Editor 只管视觉层）。
- Editor 可读写 `layers` 与 `assetRef`，不碰 `PropertyState` 等运行态。

---

## 9. 常见扩展场景（Cookbook）

### 场景1：加一张新卡片
1. 编辑 `data/cards/richman4-cards.json` 追加对象。
2. 若新效果，`types.ts` 的 `CardEffectType` 加成员 + `engine/card.ts` 加 handler。
3. 重启应用。

### 场景2：加一张新地图
1. 在 `data/maps/` 新增 JSON（对齐 `BoardData`）。
2. 跑 `validator.ts` 校验连通性。
3. `NewGameModal` 自动列出新地图。

### 场景3：加一个新事件
1. 编辑 `data/events/news-events.json`（或 magic-house / fate）。
2. 若新效果类型，`types.ts` 的 `EventEffectType` 加成员 + `engine/event.ts` 加 handler。

### 场景4：加一个新角色
- 推荐：在 M2 模块创建角色卡（`EntityCard.type='character'`），大富翁自动映射。
- 或：编辑 `data/characters/*.json` 追加。

### 场景5：接 LLM 驱动 AI
1. 在设置页配置 LLM 节点（`ProviderNode`，文本类型）。
2. `NewGameModal` 把玩家控制器设为 AI + 选难度 + 选 LLM 节点（`aiNodeId`）。
3. `engine/ai-llm.ts` 自动调 `streamChat`。
4. LLM 失败时降级规则式。

### 场景6：加 2D 瓦片资产
1. 制作 Sprite Sheet（PNG + 瓦片映射 JSON）。
2. 在 `data/maps/<map>.json` 的 `tiles[].assetRef.spriteId` 填瓦片 ID。
3. 在 `data/cards/*.json` 的 `iconAssetRef.spriteId` 填卡片图标 ID。
4. `Renderer2D` 按 `spriteId` 从 Sprite Sheet 取瓦片绘制。

### 场景7：加 3D 模型资产
1. 制作 glTF 模型（.glb/.gltf + 动画）。
2. 在 `data/maps/<map>.json` 的 `tiles[].assetRef.modelId` 填模型 ID。
3. 在 `data/characters/*.json` 的 `pawnAssetRef.modelId` 填棋子模型 ID。
4. `Renderer3D` 用 `GLTFLoader` 加载模型 + `AnimationMixer` 播放动画。
5. `AssetManager` 管理模型缓存 + dispose。

---

## 10. 与项目其他模块的交互

| 模块 | 交互方式 |
|---|---|
| **M2 角色卡**（`EntityCard`） | `Player.characterCardId` 绑定 `EntityCard.id`；`mapEntityCardToCharacter` 映射 name/description/styleNote/images/coverImageId 到角色 persona/头像；`NewGameModal` 角色选择器读 `store.cards` |
| **LLM 节点**（`ProviderNode`） | `Player.aiNodeId` 绑定 `ProviderNode.id`；`engine/ai-llm.ts` 取节点 baseURL/apiKey/model 调 `streamChat` |
| **通用对话流式**（`streamChat`） | `services/real/chat.ts:streamChat(params, events, signal)` 复用于 AI 决策的 LLM 调用 |
| **role-chat 自动循环** | `services/roleChatEngine.ts` 的 `runAgentLoop` 状态机模式参考用于 AI 玩家自动行动 |
| **settings**（`settings.json`） | 大富翁默认配置持久化到 `monopolyDefaultConfig` 字段（加入 `settingsPayload`）；bootstrap 读取 |
| **zustand store** | 跨页面状态（如当前对局存档引用）后置接入；M0–M11 用页面内 `useReducer` |
| **Electron** | 打包、数据目录复用；内容数据文件放 `frontend/public/data/monopoly/`（前端打包内嵌）或 `server/src/data/monopoly/`（后端读取） |
| **路由**（`main.tsx`） | `/monopoly` 路由 + 懒加载（`lazy` + `Suspense`） |
| **侧栏菜单**（`AppLayout`） | `MENU_ITEMS` 已有「大富翁」入口 |

---

## 11. 调试与测试

### 11.1 单测
- `engine/*.ts` 每个子系统至少 3 个单测（`*.test.ts` 并列）。
- 运行：`npm --prefix frontend test`（走本地 vitest，含 jsdom；**勿用 `npx vitest`**）。
- 单测断言：`reducer(state, action)` 返回的 state 符合预期；`JSON.parse(JSON.stringify(state))` 深相等（验证可序列化）。

### 11.2 回归
- 每个里程碑完成后跑 `tsc --noEmit` + `eslint` + `vitest` 全绿。
- 改动 `engine/*` 后跑完整对局回归（AI 自动循环玩通一局）。

### 11.3 调试技巧
- `GamePanel.tsx` 的对局日志区显示所有 `GameLogEntry`（最新在上）。
- `awaitingDecision` 为非空时表示在等决策；可暂停自动循环手动逐步操作。
- `rngSeed` 固定可复现随机事件序列。
- `DecisionModal` 显示当前决策点的 `options` 与 `context`。
- AI 调试：`AIDecisionResult.reason` 字段记录 AI 决策理由（不影响逻辑）。

### 11.4 性能
- `GameState` 不可变更新，浅拷贝为主；`players`/`properties` 数量大时注意。
- `Board3D.tsx` 用 `stateRef` + `requestAnimationFrame` 循环读最新 state，避免重建场景。
- Three 资源在组件卸载时 `dispose`（`Board3D.tsx` 的 cleanup 已做）。

### 11.5 环境注意
- Windows bash，工作目录漂移频繁——跑测试/构建用 `npm --prefix <绝对路径>/frontend test`。
- git 用 `git -C <repo root>`。
- 提交规范：`type(scope): 描述`，中文。
- 不执行 git 操作（由用户手动）。

---

## 附录 A：关键文件快速定位

| 要改什么 | 改哪个文件 |
|---|---|
| 数据形状/枚举 | `game/monopoly/types.ts` |
| 回合状态机 | `game/monopoly/engine/turn.ts` |
| 地产规则（买/升级/抵押/联合租金） | `game/monopoly/engine/board.ts` |
| 破产清算 | `game/monopoly/engine/player.ts` |
| 卡片效果 | `game/monopoly/engine/card.ts` |
| 道具效果 | `game/monopoly/engine/item.ts` |
| 神明附身 | `game/monopoly/engine/god.ts` |
| 物价指数/银行/股票 | `game/monopoly/engine/economy.ts` |
| 事件触发 | `game/monopoly/engine/event.ts` |
| 公司企业落点 | `game/monopoly/engine/company.ts` |
| AI 决策 | `game/monopoly/engine/ai.ts` + `ai-strategies.ts` + `ai-llm.ts` |
| 数据校验 | `game/monopoly/engine/validator.ts` |
| 数据加载 | `game/monopoly/engine/loader.ts` |
| 存档读档 | `game/monopoly/engine/serializer.ts` |
| 2D 棋盘渲染 | `pages/monopoly/Board.tsx` + `Tile.tsx` |
| 3D 棋盘渲染 | `pages/monopoly/Board3D.tsx` |
| 玩家资产条 | `pages/monopoly/PlayerHUD.tsx` |
| 操作面板/骰子/日志 | `pages/monopoly/GamePanel.tsx` |
| 决策弹窗 | `pages/monopoly/DecisionModal.tsx` |
| 新游戏配置 | `pages/monopoly/NewGameModal.tsx` |
| 页面入口/AI 自动循环 | `pages/monopoly/index.tsx` |
| 地图数据 | `game/monopoly/data/maps/*.json` |
| 卡片数据 | `game/monopoly/data/cards/*.json` |
| 道具数据 | `game/monopoly/data/items/*.json` |
| 神明数据 | `game/monopoly/data/gods/*.json` |
| 角色数据 | `game/monopoly/data/characters/*.json` 或 M2 EntityCard |
| 公司数据 | `game/monopoly/data/companies/*.json` |
| 事件数据 | `game/monopoly/data/events/*.json` |
| 小游戏数据 | `game/monopoly/data/minigames/*.json` |
| 配置预设 | `game/monopoly/data/config/*.json` |

---

## 附录 B：版本变体对照

| 机制 | 大富翁4 | 大富翁8 | 大富翁10 | 大富翁11 |
|---|---|---|---|---|
| 卡片购买货币 | 点数 | 点数 | 金钱 | 金钱 |
| 物价指数模式 | asset_based | asset_based | auto_increment | auto_increment |
| 股票系统 | 有 | 有 | 无 | 无 |
| 热斗模式 | 无 | 无 | 有 | 有（4张热斗地图） |
| 角色天赋 | 无 | 无 | 初步 | 完整双天赋 |
| 配置文件 | `richman4-default.json` | 复用4 | `richman10-online.json` | `richman11-hotfight.json` |

切换：`NewGameModal` 选 `config.version`，`loader.ts` 加载对应版本的数据文件。

---

## 附录 C：扩展检查清单

新增内容时按此清单核对：
- [ ] JSON 字段对齐 `types.ts` 对应 interface
- [ ] 若引入新枚举成员，`types.ts` 枚举 + `engine/*.ts` handler 都加
- [ ] 若引入新 Action 类型，`types.ts` Action 联合 + `engine.ts` reducer 路由 + 对应 handler
- [ ] 若引入新 DecisionKind，`types.ts` 枚举 + `engine/turn.ts` 处理 + `DecisionModal.tsx` 渲染 + `ai-strategies.ts` 决策
- [ ] 若引入新 SpaceType，`types.ts` 枚举 + `engine/turn.ts` 落点处理 + `Tile.tsx`/`Board3D.tsx` 渲染 + `validator.ts` 校验
- [ ] `validator.ts` 通过（连通性/引用/枚举/等级连续）
- [ ] tsc 0 + eslint 0 + vitest 全绿
- [ ] `HANDOFF.md` 更新
