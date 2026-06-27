# 大富翁（Monopoly-like）复刻 · 实施计划

> 状态：**已定稿，进入实现**（2026-06-28）
> 风格基准：**大陆「大富翁」风格**（非美版 Monopoly）
> 落点：**当前 DemonForge 项目内新模块**
> 2D 渲染：**纯 DOM/CSS + antd**（blockout），3D 后置（Three）

---

## 1. 项目定位与目标

在 DemonForge 项目内新增一个大富翁游戏模块，先用 **2D blockout**（色块 + 文字 + antd UI）拼出可玩 demo，验证规则与手感；美术资产全部后置。之后用**同一套游戏数据**驱动 3D 版本。

两个长期目标从一开始就预留进架构：
- **角色卡接入**：玩家棋子可绑定项目里的角色卡（`cardId`）。
- **AI 驱动角色行动**：玩家可由 LLM 节点（`nodeId`）自动决策、自动行动。

## 2. 核心原则

| 原则 | 含义 | 为什么 |
|---|---|---|
| 数据驱动 / 逻辑与渲染分离 | 唯一真相源是 `GameState`；规则是纯函数 `reducer(state, action) → state`，不依赖任何渲染库 | 2D blockout 完成后用**同一套数据**驱动 3D 的根本——2D/3D 都只是 `GameState` 的「视图」 |
| 2D blockout 先行 | 色块 + 文字 + antd UI，美术资产后置 | 先验证规则与手感，再投资源 |
| 双预留内生于架构 | 角色卡接入、AI 驱动用「决策点」抽象统一进引擎 | 见 §6，本计划技术核心 |
| 复用现有能力 | Phaser/Three/角色卡/节点/SSE 流式/zustand/antd 直接复用 | 不重造轮子 |
| 简洁优先 | 每个阶段只做该阶段必要的最小实现 | 项目既定工作方式 |

## 3. 分层架构

```
┌─────────────────────────────────────────────┐
│  控制层 Controllers                          │
│  HumanController(UI) / AIController(LLM节点) │  ← §6 双预留在此
├─────────────────────────────────────────────┤
│  渲染适配层 Renderers（订阅 GameState）       │
│  Renderer2D(DOM色块) │ Renderer3D(Three,后置) │  ← 可替换，互不影响逻辑
├─────────────────────────────────────────────┤
│  规则引擎 GameEngine（纯 TS，可单测）         │
│  reducer(state, action) → newState           │  ← 核心，2D/3D 共享
│  + 决策点机 (awaitingDecision)               │
├─────────────────────────────────────────────┤
│  数据层 GameState  +  BoardConfig（地图数据） │  ← 唯一真相源
├─────────────────────────────────────────────┤
│  持久化：存档/读档（后置）                    │
└─────────────────────────────────────────────┘
```

**纪律**：规则引擎里**不出现** `React`/`antd`/`Phaser`/`Three` 任何 import。只吃 `Action`、吐 `GameState`。做到这点，3D 版本就是「换一个 Renderer」，逻辑零改动。

## 4. 数据模型

```ts
// —— 地图（静态数据，「地图生成系统」的产物） ——
BoardConfig = { size, tiles: Tile[] }
Tile = {
  index, coord: {row, col},      // 环形布局：index 排序 + 坐标定位（支持非规整地图/3D）
  type: 'go'|'property'|'station'|'utility'|'chance'|'fate'|'news'
       |'jail'|'hospital'|'tax'|'bank'|'shop'|'parking',
  name,
  zoneId?,                       // 街区（连号加成用，本期不强制）
  price?, upgradeCost?,          // 地产经济参数
  rentByLevel?,                  // [持有, 1级, 2级, 3级, 地标]
  color?,                        // blockout 街区色
}

// —— 玩家运行态 ——
Player = {
  id, name, color,
  cash,
  position,                      // 当前格 index
  inJailTurns,                   // >0 表示被困（监狱/医院）
  ownedTileIds: number[],
  bankrupt,
  characterCardId?,             // ← 角色卡预留：绑定 M2 角色卡 cardId
  controller: 'human' | 'ai',   // ← AI 预留：谁来决策
  aiNodeId?,                     // ← AI 预留：用哪个 LLM 节点
}

// —— 地产运行态（与 Tile 静态数据分离） ——
PropertyState = { tileId, ownerId?, level: 0..4, mortgaged }

// —— 全局 ——
GameState = {
  board: BoardConfig,
  players: Player[],
  properties: Record<tileId, PropertyState>,
  turn: { currentPlayerId, phase, dice?, doublesCount },
  awaitingDecision?: DecisionRequest,   // ← §6 决策点
  log: GameEvent[],                     // 事件流，便于回放 / AI 读历史
  status: 'playing' | 'ended', winnerId?,
}
```

**回合阶段机 `phase`**：
`ROLL`（待掷骰）→ `MOVE`（移动动画）→ `SETTLE`（结算落点）→ `DECIDE`（待玩家决策，可选）→ `END_TURN`（结束/连走再来）。
渲染层只读 `phase` 决定显示什么按钮/动画；引擎只在合法 `phase` 接受对应 `Action`。

## 5. 本期四大系统（大富翁风格）

### 5.1 地图生成系统
- 产物 `BoardConfig`。blockout 用预设地图（40 格环形，11×11 grid 外圈，中间区放标题/骰子/日志）。
- `Tile` 带 `coord`，数据结构支持任意坐标 → 将来不规整地图 / 3D 不改逻辑。
- 后续可加参数化生成器（边长、地产密度、特殊格分布），本期只留预设。
- **2D 表现**：CSS Grid 画方环；每格色块 div（街区同底色）+ 名称/价格 + 角标（业主色点、等级）。
- **验收**：渲染出完整 40 格环形棋盘，类型/价格正确，窗口自适应。

### 5.2 骰子移动系统
- 默认单向环路 + 双骰求和；经过/停在起点发薪。
- 美版「doubles 连走 / 三连入狱」**默认关**；入狱由「踩入狱格 / 卡片」触发。
- **2D 表现**：骰子数字色块 + CSS 动画；棋子沿格逐格 `translate`（引擎只改 `position`，插值在渲染层）。
- **验收**：掷骰→棋子走到正确格→触发落点结算。

### 5.3 金钱系统
- 所有金钱变动走统一 `Transaction` 事件（玩家↔银行 / 玩家↔玩家），进 `log`。
- 过路费、过起点发薪、税收扣款、**资不抵债→破产判定→清算退出**、**胜负判定**（仅剩一人 / 达目标资产）。
- **2D 表现**：顶部每玩家资产 HUD（现金/净资产/头像色块）；金钱变动飘字。
- **验收**：收支正确记账、破产正确触发、能分胜负。

### 5.4 房地产购买 / 升级系统（大富翁核心）
- **无**美版「同色组垄断才能建房」。买下空地后**单块地独立逐级投资升级**。
- 地产等级 `level: 0→4`（0 持有 / 1 / 2 / 3 / 地标）。每级花 `upgradeCost` 升级，过路费按等级跳档（`rentByLevel`）。
- 可选「连号加成」：同一玩家拥有同 `zoneId` 全部地产 → 过路费 ×系数。**本期留字段、默认关**。
- 停他人地产付租（抵押则不收租）；抵押/赎回。
- 决策点 `buyProperty`（买空地）+ `upgradeProperty`（停自己地产可升级）。
- **验收**：买地/升级/收租/破产清算闭环；过路费随等级正确。

## 6. 双预留设计（架构核心）

把「玩家要做选择」的每个时刻统一建模成**决策点**，一个抽象同时喂饱「手感」和「AI 驱动」：

```ts
DecisionRequest = {
  playerId,
  kind: 'buyProperty'|'upgradeProperty'|'payOrMortgage'|'jailChoice'|'trade'|...,
  options: DecisionOption[],   // 引擎算好的「当前合法动作集」
  context: {...},              // 该决策相关的状态快照
}
```

引擎推进到需要选择时，进入 `phase=DECIDE` 并挂出 `awaitingDecision`，等待一个 `Action` 消解它。谁产生这个 Action 由 `Player.controller` 决定：

### 6.1 角色卡接入预留
- `Player.characterCardId` 绑定 M2 角色卡（复用现成 `cardId`）。
- blockout：棋子 / HUD 显示角色卡名字与头像（角色卡已有图片字段）。
- 不改任何规则逻辑——纯展示层增强，随时可接。

### 6.2 AI 驱动角色行动预留
- `Controller` 接口：`decide(state, request: DecisionRequest) → Promise<Action>`。
  - `HumanController`：把 `options` 渲染成 antd 按钮，等用户点。
  - `AIController`：把 `state 摘要 + request.options + 角色卡人设` 拼 prompt，调**现有节点流式接口**（复用 `role-chat` 的 `sendLocalRoleMessage` 同款链路 + `aiNodeId`），解析出选定 option。
- 复用 `role-chat` 的自动循环编排（`runAgentLoop` 状态机）做「AI 玩家自动行动 + 思考延迟 + 回合推进」。
- 本期**只做接口 + 一个最简实现**（如买得起就买 / 随机决策），把链路打通；有策略的 AI 后置。

## 7. 后置系统（仅预留扩展位，本期不实现）

股市交易、卡片/道具、载具、随机事件，通过既有扩展点接入，本期只确保架构不挡路：
- 新增系统 = 新增 `Action` 类型 + reducer 加分支 + 新增 `Tile.type` 或 `DecisionRequest.kind`，不动核心。
- 机会/命运/新闻格已在地图类型里占位，后续挂卡池即可。
- 载具 = 「移动修饰符」；股市 = 独立子系统读写 `Player.cash`。

## 8. 分阶段路线（里程碑）

| 阶段 | 内容 | 可演示成果 | 状态 |
|---|---|---|---|
| **P0 地基** | `GameState`/`BoardConfig` 类型 + 规则引擎骨架 + 2D 静态棋盘渲染 | 完整 40 格彩色棋盘 + 玩家初始位 | ✅ |
| **P1 移动** | 骰子 + 棋子移动 + 回合阶段机 + 监狱 | 多人轮流掷骰走位 | ✅ |
| **P2 经济** | 金钱系统 + 地产购买（决策点 v1）+ 破产/胜负 | 能买地、收租、分胜负的最小可玩 demo | ✅ |
| **P3 地产深化** | 升级/地标 + 过路费曲线 + 抵押/赎回 | 完整地产玩法 | ✅ |
| **P4 AI 预留落地** | `Controller` 抽象 + `AIController` 最简实现 + 自动循环 | AI 玩家能自动玩完一局 | 🚧 进行中 |
| **P5 角色卡接入** | 棋子/HUD 绑定角色卡，AI 决策注入人设 | 「用角色卡里的角色玩大富翁」 | ⬜ |
| **P6 3D 版本** | Three 渲染适配层，复用同一 GameState | 3D 棋盘，逻辑零改动 | ⬜ |
| 后置 | 股市 / 卡片道具 / 载具 / 随机事件 | 按需排期 | ⬜ |

## 9. 目录结构

```
frontend/src/game/monopoly/      ← 纯 TS 规则引擎（可单测，零渲染依赖）
  types.ts                       类型（GameState/BoardConfig/Tile/Player/...）
  board.preset.ts                大富翁风格 40 格预设地图
  engine.ts                      createInitialState + reducer
  controllers/                   Human / AI（P4）
frontend/src/pages/monopoly/     ← 2D 渲染 + UI（DOM/CSS + antd）
  index.tsx                      页面入口（useReducer 接引擎）
  Board.tsx                      棋盘（CSS Grid 环形）
  Tile.tsx                       单格
  PlayerHUD.tsx                  玩家资产条
main.tsx                         加 lazy import + <Route path="/monopoly">
layouts/AppLayout.tsx            MENU_ITEMS 加入口
```

## 10. 规则数值（默认，可调）

| 项 | 值 |
|---|---|
| 棋盘格数 | 40（11×11 grid 外圈） |
| 升级等级 | 4 级（空地→1→2→3→地标） |
| 连号/整条街加成 | 本期**关**（留字段） |
| 监狱/医院停留 | 各 2 回合 |
| 玩家人数 | 2–4（混合 human/ai） |
| 初始现金 | 15000 |
| 过起点发薪 | +2000 |
| 骰子 | 双骰求和 |

## 11. 状态管理决策

P0–P3：游戏状态用**页面内 `useReducer` 包裹纯函数引擎**（引擎即 reducer，天然契合），持久化/存档后置。不引入 zustand 切片，避免过度设计。
