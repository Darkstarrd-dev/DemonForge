# 大富翁模块 · 数据驱动层全量落地实施计划

> 状态：**待实施**（2026-06-28 立项）
> 前序：`docs/monopoly_plan.md`（P0–P6 blockout 已完成，本计划在其基础上重构 + 全量扩展）
> 蓝本：`ref/gamedesign/richman.md`（台湾大富翁4 完整设计文档）
> 落点：DemonForge 项目内大富翁模块（`frontend/src/game/monopoly/` + `frontend/src/pages/monopoly/`）
> 本轮产物：**两份文档**（本计划 + `docs/monopoly_module_guide.md`），**不实际实施**
> 实施代理：高速实施 agent，按本计划分阶段 M0→M12 落地

---

## 0. 决策摘要（用户已拍板）

| 决策点 | 结论 | 影响 |
|---|---|---|
| 地图方案 | **双地图共存**：保留现有 40 格预设为「经典风格」地图，新增 richman.md 台湾地图为第二张可选地图；`BoardConfig` 加 `mapId` 字段，新游戏配置可选地图 | 地图数据结构需重新设计，预留 Tilemap Editor + 2D/3D 资产驱动能力 |
| 地图数据结构演进 | 现有 40 格是 blockout mock 阶段产物，**从现在开始设计能驱动 2D/3D 资产的地图数据结构**，为后续 Tilemap Editor 留接口 | `Tile` 接口大改，引入图层 / 瓦片 / 资产引用 |
| 规则落地深度 | **全量落地**：物价指数 + 卡片30种 + 道具13种 + 神明13种 + 股票 + 银行存贷 + 新闻/魔法屋事件池 + 小游戏 + 乐透 + 传送 + 宝箱 + 命运 + 热斗模式 + 多版本变体 + AI三档 | 工作量大，分 M0→M12 里程碑 |
| 现有代码处置 | **重构引擎**：按 richman.md 五子系统（Board/Player/Card/TurnFSM/Economy）拆分，旧 P0–P6 代码迁移重写 | `engine.ts` 拆多文件，P0–P6 功能需回归 |
| 2D/3D 美术资产 | **本轮不实施**，仅设计资产驱动数据结构与接口；资产制作与接入列为待实施计划（§9） | 渲染层保持现有 blockout + Three 几何体，资产接口预留 |

---

## 1. 项目定位与目标

### 1.1 模块定位
DemonForge 项目内独立游戏模块，复用项目既有能力：M2 角色卡（EntityCard）、LLM 节点（ProviderNode）、SSE 流式（streamChat）、zustand 状态、antd UI、Three 3D。

### 1.2 本轮目标
- **数据驱动层全量落地**：GameState 数据模型覆盖 richman.md 全部子系统，规则引擎实现全部机制，内容数据（地图/卡片/道具/神明/角色/公司/事件/小游戏/配置）以可编辑 JSON 数据文件形式提供。
- **2D/3D 资产驱动接口预留**：地图与瓦片数据结构设计好对 2D sprite / 3D mesh / 动画的引用方式，后续 Tilemap Editor 与资产制作可零改动接入。
- **不实施美术资产**：2D 瓦片图、3D 模型、贴图、动画等留待后续（§9 待实施计划）。

### 1.3 与现有 P0–P6 的关系
- 保留：2D/3D 双视图架构、决策点抽象、Controller 接口、角色卡接入预留、AI 自动循环编排、新游戏配置 UI、HUD/日志/地产面板骨架。
- 重构：`engine.ts` 拆五子系统、`types.ts` 扩展全部枚举与接口、`board.preset.ts` 改为数据文件加载 + 双地图、`ai.ts` 扩三档难度 + LLM 接口、`characters.preset.ts` 改为 M2 EntityCard 映射。
- 新增：卡片 / 道具 / 神明 / 事件 / 公司 / 小游戏 / 经济 / 多版本变体等数据文件与引擎分支。

---

## 2. 总体架构

### 2.1 五子系统分层

```
┌─────────────────────────────────────────────────────────────┐
│  控制层 Controllers                                          │
│  HumanController(antd UI) / AIController(规则三档 or LLM)    │
├─────────────────────────────────────────────────────────────┤
│  渲染适配层 Renderers（订阅 GameState，只读不写）             │
│  Renderer2D(blockout DOM/CSS → Tilemap+Sprite 后置)          │
│  Renderer3D(Three 几何体 → glTF 模型 后置)                   │
├─────────────────────────────────────────────────────────────┤
│  规则引擎 GameEngine（纯 TS，可单测，零渲染依赖）             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐    │
│  │ Board    │ Player   │ Card     │ TurnFSM  │ Economy  │    │
│  │ Engine   │ Engine   │ Engine   │ Engine   │ Engine   │    │
│  │(地图/地产)│(玩家/破产)│(卡片/道具)│(回合状态机)│(物价/银行/股)│   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘    │
│  reducer(state, action) → newState（组合五子系统）            │
│  + 决策点机 (awaitingDecision)                               │
├─────────────────────────────────────────────────────────────┤
│  数据层                                                      │
│  GameState（唯一真相源，JSON 可序列化）                       │
│  + BoardData / CardDefs / ItemDefs / GodDefs / CharDefs      │
│  + EventPools / MiniGameDefs / CompanyDefs / GameConfig      │
├─────────────────────────────────────────────────────────────┤
│  内容数据文件（JSON，可编辑，加载到运行时）                   │
│  /data/maps/*.json /cards/*.json /items/*.json /gods/*.json  │
│  /characters/*.json /companies/*.json /events/*.json         │
│  /minigames/*.json /config/*.json                            │
├─────────────────────────────────────────────────────────────┤
│  持久化：存档/读档（SaveGame，后置）                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心原则（继承 P0–P6 并强化）

| 原则 | 含义 |
|---|---|
| 数据驱动 / 逻辑与渲染分离 | 唯一真相源 `GameState`；规则是纯函数 `reducer`，**不 import** React/antd/Phaser/Three |
| 内容数据外置 | 卡片/道具/神明/角色/公司/事件/地图/配置全部 JSON 数据文件，引擎只加载不硬编码 |
| 双预留内生于架构 | 角色卡接入（`Player.characterCardId` → M2 EntityCard）、AI 驱动（`Player.controller`/`aiNodeId` + `DecisionRequest`） |
| 2D/3D 资产驱动接口前置 | `Tile` 与内容数据结构从开始就预留 `assetRef` 字段，资产制作后零改动接入 |
| 多版本兼容 | `GameConfig.variant` + `versions` 字段支持大富翁4/8/10/11 规则切换 |
| 简洁优先 | 每个里程碑只做该里程碑必要的最小实现，不引入未被要求的抽象 |

### 2.3 双地图共存方案
- `BoardData` 持有 `mapId` 字段（如 `"classic-40"` / `"richman4-taiwan"`）。
- `frontend/src/game/monopoly/data/maps/*.json` 存多张地图定义。
- 新游戏配置 UI（`NewGameModal`）加地图选择器。
- 两套地图共用同一引擎，差异仅在 `Tile.type` 分布与 `neighborIds` 拓扑。

### 2.4 与项目其他模块的集成

| 集成点 | 用途 | 接口 |
|---|---|---|
| M2 角色卡（`EntityCard`） | 大富翁角色数据源 | `EntityCard.id` → `Player.characterCardId`；`EntityCard.name/description/styleNote/images/coverImageId` → 角色 persona/头像 |
| LLM 节点（`ProviderNode`） | AI 驱动的决策调用 | `ProviderNode.baseURL/apiKey/model` → `AIController` 调 `streamChat` |
| 通用对话流式（`streamChat`） | AI 决策的 LLM 调用链路 | `services/real/chat.ts:streamChat(params, events, signal)` |
| role-chat 自动循环 | AI 玩家自动行动编排参考 | `services/roleChatEngine.ts` 的 `runAgentLoop` 状态机模式 |
| settings（`settings.json`） | 大富翁默认配置持久化 | 新增 `monopolyDefaultConfig` 字段到 `settingsPayload` |
| zustand store | 跨页面状态（如当前对局存档） | 后置；M0–M11 用页面内 `useReducer` |
| Electron | 打包、数据目录 | 复用现有；内容数据文件放 `server/src/data/monopoly/` 或 `frontend/public/data/monopoly/` |

---

## 3. 数据模型设计（核心）

> 所有 interface 放 `frontend/src/game/monopoly/types.ts`，按子系统分块。全部 JSON 可序列化，不含函数/类实例。

### 3.1 顶层 GameState

```typescript
interface GameState {
  // --- 元数据 ---
  version: string;              // 存档版本，如 "richman4@1.0"
  mapId: string;                // 当前地图 ID
  day: number;                  // 游戏内天数（每轮所有玩家行动一次 = 1天）
  phase: GamePhase;             // 顶层阶段枚举
  turnContext: TurnContext;     // 当前回合状态机上下文

  // --- 子系统 ---
  board: BoardState;            // 地图运行时状态
  players: Player[];            // 玩家列表，按行动顺序
  cardDeck: CardDeckState;      // 卡片定义表（静态）+ 商店库存（动态）
  economy: EconomyState;        // 物价指数、银行、股票
  config: GameConfig;           // 本局规则参数

  // --- 事件队列 ---
  pendingEvents: GameEvent[];

  // --- 决策点（双预留核心） ---
  awaitingDecision?: DecisionRequest;

  // --- 日志 ---
  log: GameLogEntry[];

  // --- 随机种子 ---
  rngSeed: number;

  // --- 游戏结束 ---
  status: GameStatus;
  winnerId?: string;
}

enum GamePhase { SETUP, PLAYING, GAME_OVER }
enum GameStatus { playing, ended }
```

### 3.2 地图数据结构（★重点：资产驱动 + Tilemap Editor 预留）

```typescript
// --- 地图静态定义（数据文件加载，运行时只读） ---
interface BoardData {
  mapId: string;                // 唯一标识，如 "richman4-taiwan"
  version: string;              // 所属版本，如 "richman4"
  name: string;                 // 地图名，如 "台湾地图"
  size: number;                 // 格子总数
  tiles: Tile[];                // 所有格子
  groups: PropertyGroup[];      // 路段分组（联合租金用）
  boardShape: BoardShape;       // 棋盘外形（环形 / 矩形 / 自定义，供渲染层布局）
  layers: TilemapLayer[];       // ★ Tilemap 图层（2D/3D 资产驱动用，见 §9）
  metadata?: Record<string, unknown>; // 扩展位（作者、难度等）
}

interface BoardShape {
  kind: 'ring' | 'grid' | 'custom';
  // ring: 环形布局（现有 40 格），需 gridSide 参数
  // grid: 矩形网格（支持非环形地图）
  // custom: 任意坐标（neighborIds 驱动）
  gridSide?: number;            // ring/grid 用
  centerArea?: CenterAreaDef;   // 中间区域定义（标题/骰子/UI 摆放）
}

interface CenterAreaDef {
  title: string;
  subtitle?: string;
  // 后置：可放 2D 纹理 / 3D 模型引用
  assetRef?: AssetRef;
}

// --- 格子（静态数据 + 资产引用） ---
interface Tile {
  id: string;                   // 唯一 ID，如 "tw_001"（从原来的 index: number 升级为 string）
  index: number;                // 0-based 序号（环形走动用，兼容旧逻辑）
  type: SpaceType;
  name: string;
  coord: TileCoord;             // 2D/3D 通用坐标（逻辑层忽略，渲染层读取）
  neighborIds: string[];        // 相邻格子 ID（支持分叉路，多个=分叉）
  groupId?: string;             // 路段 ID（地产用，null=非地产）

  // --- 地产经济参数（type=PROPERTY 时有效） ---
  landType?: 'RESIDENTIAL' | 'COMMERCIAL';
  basePrice?: number;           // 基础地价（100–600）
  buildingLevels?: BuildingLevel[]; // 下标即 level（0–5，共6项）
  isChainStoreCandidate?: boolean;  // 商业地是否可改建连锁店

  // --- 特殊格参数 ---
  taxRate?: number;             // type=TAX 用
  companyType?: CompanyType;    // type=COMPANY 用
  weaponType?: 'MINE' | 'MISSILE' | 'EXPLOSIVE' | 'NUKE'; // type=ATTACK_SPACE 用（热斗模式）
  damage?: number;
  damageRange?: number;

  // --- ★ 资产引用（本轮仅定义，资产后置） ---
  assetRef?: AssetRef;          // 该格的 2D/3D 资产引用
}

// --- 资产引用（2D/3D 通用，本轮仅定义结构，资产制作后填充） ---
interface AssetRef {
  // 2D 资产
  spriteId?: string;            // 引用 tilemap sprite sheet 中的瓦片 ID
  iconId?: string;              // 格子图标 sprite ID
  // 3D 资产
  modelId?: string;             // glTF 模型 ID
  scale?: [number, number, number];
  rotation?: [number, number, number];
  // 动画
  idleAnimId?: string;          // 待机动画
  actionAnimId?: string;        // 触发动画（如收租、升级）
  // 后置：粒子特效 / 音效等
  effects?: string[];
}

// --- 图层（Tilemap Editor 产物，本轮仅定义） ---
interface TilemapLayer {
  id: string;
  name: string;                 // 如 "base" / "buildings" / "decorations"
  type: 'tile' | 'object' | 'decoration';
  visible: boolean;
  zIndex: number;
  // 瓦片图层数据：二维数组存 spriteId（-1=空）
  // 或对象图层数据：放置的对象列表
  data?: number[][] | TilemapObject[];
}

interface TilemapObject {
  id: string;
  spriteId?: string;
  modelId?: string;
  coord: TileCoord;
  assetRef?: AssetRef;
}

interface TileCoord { row: number; col: number }
interface Position3D { x: number; y: number; z: number }

// --- 格子类型枚举（全量，含热斗模式） ---
enum SpaceType {
  PROPERTY = 'PROPERTY',        // 可建设地产
  COMPANY = 'COMPANY',          // 公司企业
  START = 'START',              // 起点
  JAIL_VISIT = 'JAIL_VISIT',    // 探监
  JAIL = 'JAIL',                // 监狱
  HOSPITAL = 'HOSPITAL',        // 医院
  MAGIC_HOUSE = 'MAGIC_HOUSE',  // 魔法屋
  BANK = 'BANK',                // 银行
  SHOP = 'SHOP',                // 商店
  LOTTERY = 'LOTTERY',          // 乐透
  NEWS = 'NEWS',                // 新闻
  MINI_GAME = 'MINI_GAME',      // 小游戏
  SCORE = 'SCORE',              // 点数格
  GAS_STATION = 'GAS_STATION',  // 加油站（1级不可升级）
  PARK = 'PARK',                // 公园（1级不可升级，不收租）
  TAX = 'TAX',                  // 税务
  TELEPORT = 'TELEPORT',        // 传送
  TREASURE_BOX = 'TREASURE_BOX',// 宝箱
  FATE = 'FATE',                // 命运
  ATTACK_SPACE = 'ATTACK_SPACE',// 热斗模式攻击格
  EMPTY = 'EMPTY',              // 空格
}

// --- 建筑等级 ---
interface BuildingLevel {
  level: number;                // 0=空地, 1=平房, 2=店铺, 3=商场, 4=商业大楼, 5=摩天大楼
  buildCost: number;
  baseRent: number;
}

// --- 路段分组（联合租金） ---
interface PropertyGroup {
  groupId: string;
  name: string;
  spaceIds: string[];
  // 联合租金：同 groupId 且同方向的小型建筑（含空地，不含连锁店）租金加总
  // 大型建筑（摩天楼）单独计算
}

// --- 地图运行时状态 ---
interface BoardState {
  data: BoardData;              // 静态定义
  properties: Record<string, PropertyState>;  // tileId → 运行态
  sealedGroups: Record<string, number>;       // groupId → 查封剩余天数
  priceUpGroups: Record<string, number>;      // groupId → 涨价剩余天数
}

// --- 地产运行态 ---
interface PropertyState {
  tileId: string;
  ownerId?: string;
  level: number;                // 0..5
  mortgaged: boolean;
  isChainStore: boolean;
  // 资产驱动：建筑等级对应 sprite/mesh（渲染层读 assetRef）
  buildingAssetRef?: AssetRef;
}
```

### 3.3 玩家 Player

```typescript
enum PlayerStatus { ACTIVE, IN_JAIL, IN_HOSPITAL, BANKRUPT }

interface Player {
  id: string;
  name: string;
  characterCardId?: string;     // ★ 绑定 M2 EntityCard.id
  isAI: boolean;
  aiDifficulty?: 'easy' | 'normal' | 'hard';
  color: string;

  // --- 财务 ---
  cash: number;
  totalAssets: number;          // 现金+地产估值+存款+股票市值
  ownedTileIds: string[];
  bankDeposit: number;
  bankLoan: number;
  loanDueDay: number;
  stocks: Record<string, number>; // companyId → 持股数

  // --- 位置 ---
  position: string;             // 当前格子 ID
  previousPosition: string;

  // --- 手牌与道具 ---
  hand: CardInstance[];         // 上限 15
  items: ItemInstance[];

  // --- 状态 ---
  status: PlayerStatus;
  jailTurns: number;
  hospitalTurns: number;
  skipTurns: number;
  isCollectingRent: boolean;    // 住院时 false
  consecutiveDoubles: number;

  // --- 神明附身 ---
  godId?: string;
  godRemainingDays: number;

  // --- 点数 ---
  points: number;               // 卡片/道具商店货币

  // --- 交通工具 ---
  vehicle: 'PEDESTRIAN' | 'MOTORCYCLE' | 'CAR';

  // --- AI 驱动预留 ---
  controller: 'human' | 'ai';
  aiNodeId?: string;            // LLM 节点 ID（ProviderNode.id）
}

interface CardInstance { definitionId: string; instanceId: string }
interface ItemInstance { definitionId: string; instanceId: string; durability: number }
```

### 3.4 卡片系统（30 种 + 反制链）

```typescript
enum CardEffectType {
  // 移动类
  TELEPORT_TO_SPACE, MOVE_BACKWARD, MOVE_FORWARD, CHANGE_DIRECTION, FORCE_MOVE,
  // 金钱类
  EQUALIZE_CASH_ALL, EQUALIZE_CASH_ONE, STEAL_CARD_ITEM, TAX_TARGET,
  // 建筑类
  UPGRADE_GROUP, DEMOLISH_GROUP, DEMOLISH_ONE, DOWNGRADE_ONE, CONVERT_CHAIN_STORE,
  // 地产类
  FORCE_PURCHASE, SWAP_LAND, SWAP_BUILDING, FORCE_AUCTION, PRICE_UP_GROUP, SEAL_GROUP,
  // 状态类
  SEND_TO_JAIL, FRAME_TRANSFER, REVENGE, IMMUNITY, FREE_PASS, FREEZE,
  SLOW_TURTLE, STOP_TURN,
  // 股票类
  STOCK_UP, STOCK_DOWN,
  // 神明类
  SUMMON_GOD, DISMISS_GOD,
  // 同盟类
  ALLIANCE,
}

enum CardUseTiming { ON_TURN, ON_RENT, REACTION, PASSIVE, ANYTIME }

interface CardDefinition {
  id: string;                   // "card-00" .. "card-29"
  name: string;
  description: string;
  pointCost: number;            // 大富翁4=点数；大富翁10+=金钱（config.pointSystem 切换）
  targetType: 'SELF' | 'OPPONENT' | 'ALL' | 'PROPERTY' | 'GLOBAL';
  effectType: CardEffectType;
  effectParams: Record<string, unknown>;
  useTiming: CardUseTiming;
  stackable: boolean;
  duration: number;             // 0=即时
  canUseOnCompany: boolean;
  counterCards: string[];       // 可反制此卡的卡片 ID 列表
  versions: string[];           // ['richman4', 'richman8', ...]
  // 资产驱动
  iconAssetRef?: AssetRef;
}

interface CardDeckState {
  definitions: CardDefinition[]; // 静态定义表
  drawPile: string[];            // 摸牌堆（definitionId 列表）
  discardPile: string[];
  shopInventory: ShopInventory;
}

interface ShopInventory {
  availableCards: string[];
  refreshOnDay: number;
}
```

### 3.5 道具系统（13 种）

```typescript
enum ItemCategory { VEHICLE, WEAPON, TRAP, TOOL }

interface ItemDefinition {
  id: string;                   // "item-00" .. "item-12"
  name: string;
  description: string;
  category: ItemCategory;
  pointCost: number;            // -1=非卖品（研究所研发）
  acquireMethod: 'SHOP' | 'RESEARCH_LAB' | 'PICKUP' | 'INITIAL';
  effectRange: number;          // 攻击范围，-1=不适用
  durability: number;           // -1=无限
  versions: string[];
  iconAssetRef?: AssetRef;
}
```

### 3.6 神明系统（13 种）

```typescript
interface GodDefinition {
  id: string;
  name: string;
  alignment: 'GOOD' | 'BAD' | 'NEUTRAL';
  durationDays: number;         // 通常7，死神13
  canDismiss: boolean;          // 死神=false
  transformTo?: string;         // 可变身目标神明 ID
  effects: GodEffect[];
  iconAssetRef?: AssetRef;
}

interface GodEffect {
  type: 'RENT_BOOST' | 'RENT_REDUCE' | 'CASH_GAIN' | 'CASH_LOSE' | 'CARD_DRAW' | 'MOVE_BOOST' | string;
  value: number;
  target: 'SELF' | 'OPPONENT' | 'ALL';
}
```

### 3.7 角色（与 M2 EntityCard 映射）

```typescript
// 大富翁模块的角色定义：映射到 M2 EntityCard
interface MonopolyCharacter {
  id: string;                   // 与 EntityCard.id 一致
  name: string;
  persona: string;              // AI 决策注入用（来自 EntityCard.description + styleNote）
  color: string;
  startingCash?: number;        // 角色专属初始资金（可选）
  specialAbility?: string;      // 大富翁11 起的量化天赋（可选）
  // 资产驱动
  avatarAssetRef?: AssetRef;    // 头像（来自 EntityCard.coverImageId）
  pawnAssetRef?: AssetRef;      // 棋子（2D sprite / 3D model）
}

// 映射函数（M10 接真实 M2 EntityCard）
function mapEntityCardToCharacter(card: EntityCard): MonopolyCharacter {
  return {
    id: card.id,
    name: card.name,
    persona: `${card.description}\n语言风格：${card.styleNote ?? ''}\n例句：${(card.styleExamples ?? []).join('；')}`,
    color: generateColorFromName(card.name),
    avatarAssetRef: card.coverImageId ? { spriteId: card.coverImageId } : undefined,
  };
}
```

### 3.8 公司企业

```typescript
enum CompanyType {
  BANK, DEPARTMENT_STORE, GAS_STATION, AMUSEMENT_PARK, RESTAURANT,
  TECH_COMPANY, INSURANCE_COMPANY,
}

interface CompanyDefinition {
  id: string;
  name: string;
  type: CompanyType;
  initialStockPrice: number;
  // 董事长特权（持股>50%）
  chairmanPrivilege: string;
  iconAssetRef?: AssetRef;
}

interface CompanyState {
  companyId: string;
  stockPrice: number;
  stockLimitUpDays: number;     // 涨停剩余天数
  stockLimitDownDays: number;
  shareholders: Record<string, number>; // playerId → 持股数
  chairmanId?: string;          // 持股>50% 的玩家
}
```

### 3.9 事件池（新闻 / 魔法屋 / 命运）

```typescript
enum EventEffectType {
  ALL_GAIN_CASH, ALL_LOSE_CASH, ALL_GAIN_PERCENT, ALL_LOSE_PERCENT,
  PROPERTY_PRICE_UP, PROPERTY_PRICE_DOWN,
  RANDOM_PLAYER_GAIN, RANDOM_PLAYER_LOSE,
  STOCK_SURGE, STOCK_CRASH,
}

interface EventEffect {
  type: EventEffectType;
  value: number;
  target: 'ALL' | 'RANDOM' | 'RICHEST' | 'POOREST';
}

interface NewsEvent {
  id: string;
  title: string;
  description: string;
  effect: EventEffect;
}

interface MagicHouseEffect {
  id: string;
  description: string;
  type: EventEffectType | 'TELEPORT' | 'GIVE_CARD' | 'STEAL_ALL_ITEMS' | 'CHANGE_VEHICLE';
  params: Record<string, unknown>;
  isPositive: boolean;
}

interface FateEvent {
  id: string;
  title: string;
  description: string;
  effect: EventEffect | 'TELEPORT' | 'GIVE_CARD' | 'SEND_TO_JAIL' | 'GOD_POSSESSION';
  params: Record<string, unknown>;
}
```

### 3.10 小游戏 / 乐透 / 宝箱 / 传送 / 命运点

```typescript
interface MiniGameDef {
  id: string;
  name: string;
  triggerCondition: 'LAND_ON_SPACE' | 'SPECIFIC_DAY' | 'CARD_EFFECT';
  rewardFormula: string;        // 如 "score * 100 * priceIndex"
  penaltyFormula: string;
  // 后置：小游戏的具体玩法（独立子游戏）
  gameModuleId?: string;
}

interface MiniGameResult {
  playerId: string;
  gameId: string;
  score: number;
  cashDelta: number;
  pointDelta: number;
}

interface LotteryConfig {
  betCost: number;              // 投注金
  prizeFormula: string;         // 奖金公式
}

interface TreasureBoxConfig {
  possibleRewards: Array<
    | { type: 'cash'; value: number }
    | { type: 'card'; cardId: string }
    | { type: 'item'; itemId: string }
    | { type: 'points'; value: number }
  >;
}

interface TeleportConfig {
  mode: 'RANDOM' | 'SPECIFIC' | 'NEAREST_TYPE';
  targetType?: SpaceType;       // NEAREST_TYPE 用
}
```

### 3.11 经济系统

```typescript
interface EconomyState {
  priceIndex: number;           // 当前物价指数，初始 1.0
  initialCash: number;
  initialPlayerCount: number;
  bankruptCount: number;
  priceIndexMode: 'asset_based' | 'auto_increment';
  autoIncrementIntervalDays?: number; // auto_increment 模式用
  lastAutoIncrementDay?: number;

  // 银行
  bankAccounts: Record<string, BankAccount>; // playerId → 账户

  // 股票
  companies: Record<string, CompanyState>; // companyId → 状态
  dividendDay: number;          // 下次分红日（每月15日）

  // 利率
  depositInterestRate: number;  // 存款月息（默认0.10）
  loanTermDays: number;         // 贷款期限（默认90天）
}

interface BankAccount {
  playerId: string;
  deposit: number;
  loan: number;
  loanDueDay: number;
}
```

### 3.12 游戏配置与多版本变体

```typescript
interface GameConfig {
  // 基础
  playerCount: number;
  startingCash: number;
  mapId: string;

  // 胜利条件
  victoryCondition: 'LAST_STANDING' | 'TARGET_ASSETS' | 'MAX_TURNS';
  targetAssets?: number;
  maxTurns?: number;

  // 骰子与移动
  diceMode: 'dice' | 'movement_card';
  allowDoubleRoll: boolean;     // 大富翁4默认 false
  allowConsecutiveDoublesJail: boolean; // 连续3次双数入狱

  // 经济
  priceIndexEnabled: boolean;
  priceIndexMode: 'asset_based' | 'auto_increment';
  bankEnabled: boolean;
  stockEnabled: boolean;        // 大富翁10=false
  initialDeposit: number;

  // 卡片/道具
  cardHandLimit: number;        // 默认15
  pointSystem: 'points' | 'cash'; // 大富翁4=points，大富翁10=cash

  // 破产
  bankruptcyMode: 'ELIMINATE' | 'DEBT';

  // 模式
  gameMode: 'STORY' | 'BIOGRAPHY' | 'HOT_SEAT' | 'ONLINE';
  variant: 'classic' | 'hot_fight' | 'richman_spinoff';

  // 渲染（逻辑层忽略）
  renderMode: '2D' | '3D';

  // 版本（决定加载哪套数据文件）
  version: 'richman4' | 'richman8' | 'richman10' | 'richman11';
}

// 预设配置（data/config/*.json）
interface ConfigPreset {
  id: string;                   // "richman4-default" / "richman10-online" 等
  name: string;
  config: GameConfig;
}
```

### 3.13 存档

```typescript
interface SaveGame {
  version: string;
  timestamp: number;
  gameState: GameState;
  config: GameConfig;
}
```

### 3.14 决策点（双预留核心，扩展）

```typescript
interface DecisionRequest {
  playerId: string;
  kind: DecisionKind;
  options: DecisionOption[];
  context: Record<string, unknown>;
  // 反制窗口专用：正在等待反制的攻击卡 ID
  cardUseWindowFor?: string;
}

type DecisionKind =
  | 'buyProperty' | 'upgradeProperty' | 'payOrMortgage' | 'jailChoice' | 'trade'
  | 'useCard' | 'useItem' | 'bankOperation' | 'stockTrade' | 'choosePath'
  | 'cardReaction'              // 反制窗口（免罪/嫁祸/复仇）
  | 'lotteryBet' | 'teleportTarget' | 'magicHouseEffect'

interface DecisionOption {
  id: string;
  label: string;
  // 可选：该选项的预览效果（AI 决策与 UI 提示用）
  preview?: { cashDelta?: number; description?: string }
}
```

### 3.15 Action（reducer 输入，全量）

```typescript
type Action =
  // 游戏
  | { type: 'NEW_GAME'; config: NewGameConfig }
  | { type: 'LOAD_GAME'; save: SaveGame }
  // 回合
  | { type: 'ROLL_DICE'; dice: number[] }      // 1–3 颗
  | { type: 'CHOOSE_PATH'; direction: 'LEFT' | 'RIGHT' }
  | { type: 'END_TURN' }
  // 决策
  | { type: 'RESOLVE_DECISION'; optionId: string; extra?: Record<string, unknown> }
  // 地产
  | { type: 'PURCHASE_PROPERTY'; tileId: string }
  | { type: 'DECLINE_PURCHASE' }
  | { type: 'BUILD_STRUCTURE'; tileId: string }
  | { type: 'DECLINE_BUILD' }
  | { type: 'MORTGAGE_PROPERTY'; tileId: string }
  | { type: 'REDEEM_PROPERTY'; tileId: string }
  // 卡片/道具
  | { type: 'USE_CARD'; cardInstanceId: string; targetId?: string; targetTileId?: string }
  | { type: 'USE_ITEM'; itemInstanceId: string; targetTileId?: string }
  | { type: 'BUY_CARD'; cardDefId: string }
  | { type: 'BUY_ITEM'; itemDefId: string }
  // 银行
  | { type: 'BANK_DEPOSIT'; amount: number }
  | { type: 'BANK_WITHDRAW'; amount: number }
  | { type: 'BANK_LOAN'; amount: number }
  | { type: 'BANK_REPAY'; amount: number }
  // 股票
  | { type: 'BUY_STOCK'; companyId: string; quantity: number }
  | { type: 'SELL_STOCK'; companyId: string; quantity: number }
  // 监狱
  | { type: 'PAY_JAIL_FEE' }
  | { type: 'USE_JAIL_CARD' }
  // 破产
  | { type: 'DECLARE_BANKRUPT' }
  // 事件
  | { type: 'TRIGGER_EVENT'; eventId: string }
  | { type: 'MINI_GAME_RESULT'; result: MiniGameResult }
```

---

## 4. 规则引擎重构

### 4.1 文件拆分方案

```
frontend/src/game/monopoly/
  types.ts                      全部 interface/enum（按子系统分块注释）
  engine.ts                     组合根 reducer + createInitialState（薄）
  engine/
    board.ts                    Board 子系统：地图/地产/路段/联合租金
    player.ts                   Player 子系统：破产清算/资产计算
    card.ts                     Card 子系统：30种效果执行 + 反制链
    item.ts                     Item 子系统：13种道具效果
    god.ts                      God 子系统：神明附身/变身/送神
    turn.ts                     TurnFSM：状态机 + 状态转移
    economy.ts                  Economy：物价指数/银行/股票/分红
    event.ts                    事件池：新闻/魔法屋/命运/宝箱/乐透/传送
    company.ts                  公司企业：董事长/过路费/股票
    ai.ts                       AI 控制器：三档难度规则 + LLM 接口
    ai-strategies.ts            三档难度策略实现（easy/normal/hard）
    ai-llm.ts                   LLM 决策实现（复用 streamChat）
    validator.ts                数据校验（地图连通性/引用完整性等）
    loader.ts                   数据加载器（loadMap/loadCards/...）
    serializer.ts               存档/读档序列化
  data/                         内容数据文件（JSON）
    maps/
      classic-40.json           现有40格预设（迁移）
      richman4-taiwan.json      台湾地图（新增）
    cards/
      richman4-cards.json       30种卡片
      richman10-cards.json      大富翁10卡片变体
    items/
      richman4-items.json       13种道具
    gods/
      richman4-gods.json        13种神明
    characters/
      richman4-characters.json  12名角色（或映射 M2 EntityCard）
    companies/
      richman4-companies.json   7类公司
    events/
      news-events.json          20条新闻
      magic-house-events.json   15条魔法屋
      fate-events.json          命运点事件
    minigames/
      minigame-definitions.json
    config/
      richman4-default.json     大富翁4默认配置
      richman10-online.json     大富翁10联网配置差异
      richman11-hotfight.json   大富翁11热斗配置
```

### 4.2 reducer 组合策略

`engine.ts` 是薄组合根，按 action.type 路由到对应子系统 handler：

```typescript
export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'NEW_GAME': return createInitialState(action.config)
    case 'LOAD_GAME': return action.save.gameState
    case 'ROLL_DICE': return turnEngine.handleRoll(state, action.dice)
    case 'CHOOSE_PATH': return turnEngine.handleChoosePath(state, action.direction)
    case 'END_TURN': return turnEngine.handleEndTurn(state)
    case 'RESOLVE_DECISION': return turnEngine.handleResolveDecision(state, action.optionId, action.extra)
    case 'PURCHASE_PROPERTY': case 'DECLINE_PURCHASE':
    case 'BUILD_STRUCTURE': case 'DECLINE_BUILD':
    case 'MORTGAGE_PROPERTY': case 'REDEEM_PROPERTY':
      return boardEngine.handle(state, action)
    case 'USE_CARD': return cardEngine.handleUseCard(state, action)
    case 'USE_ITEM': return itemEngine.handleUseItem(state, action)
    case 'BUY_CARD': case 'BUY_ITEM': return boardEngine.handleShop(state, action)
    case 'BANK_DEPOSIT': case 'BANK_WITHDRAW':
    case 'BANK_LOAN': case 'BANK_REPAY':
      return economyEngine.handleBank(state, action)
    case 'BUY_STOCK': case 'SELL_STOCK': return economyEngine.handleStock(state, action)
    case 'PAY_JAIL_FEE': case 'USE_JAIL_CARD': return turnEngine.handleJail(state, action)
    case 'DECLARE_BANKRUPT': return playerEngine.handleBankrupt(state)
    case 'TRIGGER_EVENT': return eventEngine.handleTrigger(state, action.eventId)
    case 'MINI_GAME_RESULT': return eventEngine.handleMiniGameResult(state, action.result)
    default: return state
  }
}
```

### 4.3 TurnFSM 状态机（全量状态转移）

```
TURN_START
  │
  ├─[玩家在监狱]──→ 询问出狱方式（付罚款/出狱卡/等骰子相同）
  │   └─ 出狱成功 → ROLL_DICE
  │   └─ 继续坐牢 → TURN_END（jailTurns--）
  │
  ├─[玩家在医院]──→ hospitalTurns-- → TURN_END（跳过行动，isCollectingRent=false）
  │
  ├─[skipTurns > 0]→ skipTurns-- → TURN_END
  │
  └─[正常] ──────→ ROLL_DICE
  │
  ├─[连续3次双数]──→ 入狱 → TURN_END
  │
  └─[正常掷骰] ──→ MOVING
  │
  └─ 逐格移动 → SPACE_RESOLUTION
  │
  ┌────────────────┼───────────────────────┐
  │                │                       │
  PURCHASE_DECISION RENT_PAYMENT         SPECIAL_SPACE
  │                │                       │
  └────────────────┴───────────────────────┘
  │
  CARD_USE_WINDOW（反制窗口，REACTION 类卡片）
  │
  STOCK_TRADE（可选）
  │
  TURN_END
```

```typescript
enum TurnPhase {
  TURN_START, ROLL_DICE, MOVING, SPACE_RESOLUTION,
  PURCHASE_DECISION, BUILD_DECISION, RENT_PAYMENT,
  CARD_EVENT, SPECIAL_SPACE, CARD_USE_WINDOW,
  STOCK_TRADE, TURN_END,
}

interface TurnContext {
  currentPlayerId: string;
  phase: TurnPhase;
  diceResults: number[];        // 1–3 颗
  diceCount: number;            // 由 vehicle 决定
  moveSteps: number;            // 剩余移动步数
  movePath: string[];           // 已规划的格子 ID 路径
  pendingRent?: RentInfo;
  pendingPurchase?: PurchaseInfo;
  cardUseWindowFor?: string;    // 正在等待反制的攻击卡 ID
  consecutiveDoubles: number;
}
```

### 4.4 随机源外置（保持 reducer 纯）
- 骰子：`rollDice(count)` 在 reducer 之外调用，dice 经 action 传入。
- 事件抽取：`pickEvent(pool, rng)` 在 reducer 之外调用，eventId 经 action 传入。
- 神明随机效果：同上。
- `rngSeed` 仅用于可复现的回放/调试，生产用 `Math.random`。

### 4.5 破产清算流程
1. **强制出售建筑**：自有地产逐级降级，每降一级回收 `buildCost × 0.5`，直到 `cash ≥ 0` 或无建筑可售。
2. **抵押地产**：无建筑地产抵押，抵押价 = `basePrice × 0.5`（赎回价 = `basePrice × 0.6`）。
3. **仍不足**：`status = BANKRUPT`；地产归债权方（若因踩地触发则归该地主），否则归公。

### 4.6 物价指数计算（双模式）

```typescript
// 大富翁4（asset_based）
function calcPriceIndexAsset(state: GameState): number {
  const totalAssets = state.players.reduce((s, p) => s + p.totalAssets, 0)
  const alive = state.players.filter(p => p.status !== PlayerStatus.BANKRUPT).length
  return totalAssets / state.economy.initialCash / alive
}

// 大富翁10（auto_increment）
function calcPriceIndexAuto(state: GameState): number {
  if (state.day - (state.economy.lastAutoIncrementDay ?? 0) >= state.economy.autoIncrementIntervalDays!) {
    return state.economy.priceIndex + 1  // 上升一档
  }
  return state.economy.priceIndex
}
```

### 4.7 租金计算（全量，含联合租金/连锁店/查封/涨价/住院）

```typescript
function calculateRent(landingPlayer: Player, space: PropertySpace, gs: GameState): number {
  const owner = gs.players.find(p => p.id === space.ownerId)!
  if (owner.status === PlayerStatus.IN_HOSPITAL) return 0          // 住院不收租
  if (gs.board.sealedGroups[space.groupId] > 0) return 0           // 查封
  if (space.currentLevel === 5) {                                  // 摩天楼单独算
    return Math.floor(space.buildingLevels[2].baseRent * gs.economy.priceIndex)
  }
  if (space.isChainStore) {                                        // 连锁店全图加总
    const chainRent = gs.board.data.tiles
      .filter(t => t.type === SpaceType.PROPERTY && /* isChainStore && ownerId===owner.id */)
      .reduce((s, t) => s + /* baseRent */, 0)
    return Math.floor(chainRent * gs.economy.priceIndex)
  }
  // 小型建筑：同路段同方向加总
  const group = gs.board.data.groups.find(g => g.groupId === space.groupId)!
  const groupRent = group.spaceIds
    .map(id => gs.board.properties[id])
    .filter(p => p.ownerId === owner.id && !p.isChainStore && p.level < 5)
    .reduce((s, p) => s + /* buildingLevels[level].baseRent */, 0)
  let rent = Math.floor(groupRent * gs.economy.priceIndex)
  if (gs.board.priceUpGroups[space.groupId] > 0) rent *= 2         // 涨价卡
  return rent
}
```

---

## 5. 内容数据清单

### 5.1 双地图数据
- `classic-40.json`：迁移现有 `board.preset.ts` 的 40 格环形预设为数据文件，补 `id`/`neighborIds`/`groupId`/`assetRef` 字段。
- `richman4-taiwan.json`：按 `ref/gamedesign/richman.md` §2.3 台湾地图示例，约 36 格，含台北车站/忠孝东路/西门町/中正纪念堂/淡水渔人码头/阿里山等具体格子数据。
- 两套地图均填 `layers` 占位（空数组，待 Tilemap Editor 产物填充）。

### 5.2 30 种卡片（`data/cards/richman4-cards.json`）
完整效果表见 `ref/gamedesign/richman.md` §4.2。每张卡片字段对齐 §3.4 `CardDefinition`。反制链：
- 陷害卡(17) → 免罪卡(20) 抵消 → 嫁祸卡(18) 转嫁 → 复仇卡(19) 反击

### 5.3 13 种道具（`data/items/richman4-items.json`）
完整定义见 `ref/gamedesign/richman.md` §7.3。每件道具字段对齐 §3.5 `ItemDefinition`。

### 5.4 13 种神明（`data/gods/richman4-gods.json`）
见 `ref/gamedesign/richman.md` §7.4。死神 `durationDays=13`、`canDismiss=false`，其余 7 天。好神/坏神互斥出现。

### 5.5 12 名角色（`data/characters/richman4-characters.json` 或映射 M2）
见 `ref/gamedesign/richman.md` §3.2。大富翁4 角色无数值化天赋，`specialAbility` 留空；`aiDifficulty` 字段体现 AI 性格（乖宝宝/普通人/大老奸）。M10 接真实 M2 EntityCard 时改用 `mapEntityCardToCharacter`。

### 5.6 7 类公司（`data/companies/richman4-companies.json`）
银行/百货/加油站/游乐园/餐厅/科技公司/保险公司。每类含 `initialStockPrice` + `chairmanPrivilege`。

### 5.7 事件池
- `data/events/news-events.json`：20 条新闻（见 richman.md §7.1）
- `data/events/magic-house-events.json`：15 条魔法屋（见 §7.2）
- `data/events/fate-events.json`：命运点事件池（参考 richman.md，需补全）

### 5.8 小游戏（`data/minigames/minigame-definitions.json`）
定义小游戏触发条件、奖惩公式。具体玩法模块（`gameModuleId`）后置。

### 5.9 多版本配置
- `data/config/richman4-default.json`：大富翁4 默认（见 richman.md §9.2）
- `data/config/richman10-online.json`：大富翁10 联网差异（见 §9.3）
- `data/config/richman11-hotfight.json`：大富翁11 热斗

---

## 6. AI 行为模型

### 6.1 三档难度策略

```typescript
interface AIConfig {
  difficulty: 'easy' | 'normal' | 'hard'
  purchaseThreshold: number     // 现金/地价最低比值
  buildThreshold: number
  attackCardPropensity: number  // 0–1
  targetLeader: boolean
  considerPriceIndex: boolean
}

const AI_CONFIGS: Record<string, AIConfig> = {
  easy:   { difficulty: 'easy',   purchaseThreshold: 0.5, buildThreshold: 0.5, attackCardPropensity: 0.1, targetLeader: false, considerPriceIndex: false },
  normal: { difficulty: 'normal', purchaseThreshold: 1.5, buildThreshold: 2.0, attackCardPropensity: 0.5, targetLeader: false, considerPriceIndex: false },
  hard:   { difficulty: 'hard',   purchaseThreshold: 2.0, buildThreshold: 3.0, attackCardPropensity: 0.9, targetLeader: true,  considerPriceIndex: true  },
}
```

- **Easy**：随机决策，购买概率约 50%，不主动使用攻击卡。
- **Normal**：基于评估函数（`score = cash/totalAssets` + 路段完整度），优先购买高价值路段，物价指数低时多建设。
- **Hard**：贪心策略，评估每张攻击卡对领先玩家的期望伤害，优先针对总资产最高对手；物价指数高时优先购地，低时优先建设；考虑贷款时机。

### 6.2 AI 决策接口

```typescript
interface AIDecisionContext {
  gameState: GameState
  playerId: string
  legalActions: PlayerAction[]
  request?: DecisionRequest       // 当前决策点（若有）
}

interface AIDecisionResult {
  action: PlayerAction
  reason: string                  // 调试用
}

type AIDecisionFn = (ctx: AIDecisionContext) => Promise<AIDecisionResult>
```

### 6.3 LLM 接入方案（复用项目能力）
- `AIController` 读 `Player.aiNodeId`（对应 `ProviderNode.id`）+ `characterCardId`（角色人设）。
- 拼 prompt：`state 摘要 + request.options + 角色卡 persona`。
- 调 `services/real/chat.ts:streamChat(params, events, signal)`，解析流式输出为选定 option。
- 复用 `services/roleChatEngine.ts` 的 `runAgentLoop` 状态机模式做「AI 玩家自动行动 + 思考延迟 + 回合推进」。
- 本轮接接口 + 一个最简实现（规则式），LLM 实际调用作为可选增强（M8）。

### 6.4 自动循环编排
- 现有 `pages/monopoly/index.tsx` 的 `useEffect + aiNextAction + setTimeout` 模式保留。
- `aiNextAction(state)` 根据当前回合阶段返回 AI 玩家应执行的下一个 action。

---

## 7. 分阶段实施路线（M0→M12）

| 里程碑 | 内容 | 可演示成果 | 依赖 |
|---|---|---|---|
| **M0 重构地基** | `types.ts` 全量扩展（§3 全部 interface）+ `engine.ts` 拆五子系统骨架 + 数据加载器 `loader.ts` + 数据校验 `validator.ts` + 内容数据文件目录结构 + 双地图 JSON（迁移 + 台湾） | tsc 0 + 单测全绿；P0–P6 功能回归（用新引擎跑通原 40 格 demo） | — |
| **M1 地图数据双地图** | `BoardData` 含 `mapId/layers/assetRef` + 双地图 JSON 完整 + `NewGameModal` 加地图选择器 + 渲染层适配新 `Tile.id`（string） | 两张地图可切换；资产引用字段就位（资产未填） | M0 |
| **M2 经济系统** | 物价指数（双模式）+ 银行存贷（10% 月息、3 月无息贷款）+ 股票（即时交易、月中分红）+ 公司企业（董事长特权） | 物价指数随资产变化；银行可存取贷；股票可买卖、董事长收股息 | M0 |
| **M3 卡片系统** | 30 种卡片定义 + 效果执行 + 反制链（REACTION 窗口）+ 商店库存 + 点数系统 + 手牌上限 15 | 商店可买卡；使用卡片触发效果；反制链可走通 | M0 |
| **M4 道具系统** | 13 种道具定义 + 持有/使用 + 研究所研发 + 工程车/机器工人/飞弹等效果 + 持有上限 | 道具可持有/使用/研发；武器可投放伤害建筑 | M0 |
| **M5 神明系统** | 13 种神明 + 附身机制 + 变身（小财神→大财神）+ 送神符 + 死神不可送 | 神明可附身、定时离开、变身、被送神符移除 | M0 |
| **M6 事件系统** | 新闻(20) + 魔法屋(15) + 命运 + 小游戏定义 + 乐透 + 宝箱 + 传送 | 踩事件格触发随机事件；小游戏奖惩回写；乐透可投注；宝箱可开 | M0 |
| **M7 多版本变体** | `GameConfig.version` 切换 + 热斗模式（ATTACK_SPACE 替换 PROPERTY、移除 HOSPITAL、金钱=生命值）+ 大富翁10 联网配置 | 可切换大富翁4/8/10/11 配置；热斗模式可玩 | M0–M6 |
| **M8 AI 三档 + LLM 接口** | 三档难度规则实现（`ai-strategies.ts`）+ LLM 接口（`ai-llm.ts` 复用 streamChat）+ NewGameModal 选难度 | AI 三档行为差异可观察；LLM 驱动可选启用 | M0–M6 |
| **M9 角色卡接入真实 M2** | `mapEntityCardToCharacter` + `NewGameModal` 角色选择改读 `store.cards`（M2 EntityCard）+ 棋子/HUD 显示真实头像 | 用 M2 角色卡里的角色玩大富翁 | M0、M2模块就绪 |
| **M10 存档/读档** | `serializer.ts` + SaveGame 文件 IO（Electron 主进程 IPC）+ 对局列表 UI | 可保存当前对局、读取继续 | M0–M8 |
| **M11 回归与单测** | 全子系统单测（engine/* 每个文件）+ 端到端玩通一局 + lint/tsc/vitest 全绿 | vitest 全绿；完整对局可玩通 | M0–M10 |
| **M12（待实施）2D/3D 资产驱动** | 见 §9，资产制作后接入 | 2D Tilemap + 3D glTF 模型替换 blockout | M0–M11 + 资产就绪 |

---

## 8. 文件组织结构

```
frontend/src/game/monopoly/           ← 纯 TS 规则引擎（可单测，零渲染依赖）
  types.ts                            全部 interface/enum
  engine.ts                           组合根 reducer + createInitialState（薄）
  engine/
    board.ts  player.ts  card.ts  item.ts  god.ts  turn.ts
    economy.ts  event.ts  company.ts
    ai.ts  ai-strategies.ts  ai-llm.ts
    validator.ts  loader.ts  serializer.ts
  data/                               ← 内容数据文件（JSON，可编辑）
    maps/  cards/  items/  gods/  characters/  companies/
    events/  minigames/  config/

frontend/src/pages/monopoly/          ← 渲染 + UI（DOM/CSS + antd，blockout 阶段）
  index.tsx                           页面入口（useReducer 接引擎 + AI 自动循环）
  Board.tsx  Board3D.tsx  Tile.tsx    2D/3D 棋盘（订阅 GameState）
  PlayerHUD.tsx  GamePanel.tsx       HUD/操作面板/日志
  DecisionModal.tsx  NewGameModal.tsx 决策弹窗/新游戏配置（加地图选择器、难度选择器）
  panels/                             后置：各子系统操作面板（卡片手牌/银行/股票/神明/道具）
```

---

## 9. 2D/3D 资产驱动方案（待实施计划，本轮仅设计接口）

### 9.1 资产驱动数据结构（已融入 §3.2 `AssetRef` + `TilemapLayer`）
- `Tile.assetRef`：每格的 2D sprite / 3D model 引用。
- `BoardData.layers`：Tilemap 图层（base/buildings/decorations）。
- `CardDefinition.iconAssetRef` / `ItemDefinition.iconAssetRef` / `GodDefinition.iconAssetRef`：图标。
- `MonopolyCharacter.avatarAssetRef` / `pawnAssetRef`：头像 + 棋子。

### 9.2 Renderer2D 适配层演进路线
1. **当前**：DOM/CSS 色块 + antd（blockout）。
2. **资产阶段**：引入 Tilemap（Tiled 或自研编辑器产物 JSON）+ Sprite Sheet，`Renderer2D` 按 `Tile.assetRef.spriteId` 从 Sprite Sheet 取瓦片绘制。
3. **Tilemap Editor**：可视化编辑地图、刷瓦片、放对象、配置 `neighborIds`、导出 `BoardData` JSON。

### 9.3 Renderer3D 适配层演进路线
1. **当前**：Three 几何体（Box/Cylinder）。
2. **资产阶段**：按 `Tile.assetRef.modelId` 加载 glTF 模型（`GLTFLoader`），按 `idleAnimId`/`actionAnimId` 播放动画（`AnimationMixer`）。
3. **资源管理**：`AssetManager`（缓存 glTF/纹理/sprite sheet，引用计数 + dispose）。

### 9.4 Tilemap Editor 预留接口
- 输入：`BoardData` JSON。
- 输出：补全 `layers` + `assetRef` 的 `BoardData` JSON。
- 编辑能力：刷瓦片、放对象、连线 `neighborIds`、设路段 `groupId`、配置地产经济参数、预览 2D/3D。
- 本轮不实施，但 `BoardData` 结构已为其就位。

### 9.5 资产清单（待制作，后置）
- 2D：Tilemap 瓦片集（地形/建筑/角色/卡片图标/道具图标/神明图标/UI 元素）。
- 3D：glTF 模型（格子/建筑/棋子/角色/特效）+ 动画。
- 音效：BGM/SE（掷骰、移动、收租、升级、破产、事件）。

---

## 10. 验收标准

### 10.1 每个里程碑通用验收
- 前端 `tsc --noEmit` 0
- 前端 `eslint` 改动文件 0 error
- 前端 `vitest` 全绿（含新增单测）
- 后端 `tsc --noEmit` 0（若涉及后端）
- 改动文件 `eslint` 0/0

### 10.2 M0 验收（重构地基）
- P0–P6 功能用新引擎跑通（40 格 demo 可玩）
- `engine/*` 每个子系统至少 3 个单测
- `data/` 目录结构就位，双地图 JSON 可加载
- `validator.ts` 通过双地图连通性/引用完整性校验

### 10.3 M11 终态验收
- 完整对局可玩通（含卡片/道具/神明/事件/股票/银行/物价指数/破产/胜负）
- 大富翁4 / 大富翁10 配置可切换
- 热斗模式可玩
- AI 三档难度行为差异可观察
- 用 M2 真实角色卡玩
- 存档/读档可用
- vitest 全绿

---

## 11. 风险与回避

| 风险 | 回避 |
|---|---|
| 重构导致 P0–P6 回归 | M0 完成后立即跑 P0–P6 回归；每里程碑附单测 |
| 全量规则工作量大 | 严格分 M0→M12 里程碑，每里程碑可独立验证；M12 资产后置 |
| 引擎 import 渲染库 | `engine/` 目录 ESLint 规则禁止 import React/antd/Phaser/Three |
| 数据文件与代码不同步 | `loader.ts` 加载时跑 `validator.ts`，失败即报错 |
| GameState 不可序列化 | `types.ts` 注释强制「JSON 可序列化，不含函数/类实例」；单测断言 `JSON.parse(JSON.stringify(state))` 深相等 |
| Tile.id 从 number 改 string 破坏旧逻辑 | M0 集中迁移，`properties`/`ownedTileIds`/`position` 全部改 string；单测覆盖 |
| 双地图拓扑差异（环形 vs 矩形） | `BoardShape.kind` 区分；`turn.ts` 走动逻辑用 `neighborIds` 而非 `index ± 1`，统一支持分叉 |
| 资产字段空值 | `assetRef` 全部可选；渲染层对 undefined 走 blockout 兜底 |
| AI LLM 调用失败 | LLM 失败时降级到规则式决策（easy 档兜底） |

---

## 12. 实施代理工作指引

1. **读文档顺序**：本计划 → `docs/monopoly_module_guide.md` → `ref/gamedesign/richman.md` → 现有 `frontend/src/game/monopoly/` 代码。
2. **里程碑顺序**：严格按 M0→M12，每个里程碑完成后更新 `HANDOFF.md`。
3. **每里程碑产物**：代码 + 单测 + `HANDOFF.md` 进度更新 + 该里程碑的验收命令输出。
4. **不跨里程碑**：M0 未完成不开 M1；M3 卡片未完成不开 M4 道具。
5. **遇到设计模糊**：参考 `ref/gamedesign/richman.md` 对应章节；仍不明确则向用户提问，不脑补。
6. **git 操作**：由用户手动执行，实施代理不执行 git。
7. **每完成一项更新 `HANDOFF.md`**。

---

## 附录 A：与现有 `monopoly_plan.md` 的差异

| 维度 | 旧计划（P0–P6） | 本计划（M0–M12） |
|---|---|---|
| 数据模型 | `Tile` 简单（index/coord/type/price） | 全量（§3，含 AssetRef/TilemapLayer/30卡片/13道具/13神明/股票/银行/事件/小游戏/多版本） |
| 引擎 | 单文件 `engine.ts` 301 行 | 五子系统拆分（`engine/*.ts`） |
| 地图 | 单张 40 格硬编码预设 | 双地图 JSON 数据文件 + mapId 切换 + Tilemap Editor 预留 |
| 规则覆盖 | 移动/地产/破产/胜负/抵押 | 全量（物价指数/卡片/道具/神明/事件/股票/银行/小游戏/热斗/多版本） |
| AI | 单档规则式 | 三档难度 + LLM 接口 |
| 角色 | preset 占位 6 个 | 12 名 + M2 EntityCard 真实接入 |
| 资产 | 无 | 数据结构预留 + 渲染层 blockout 兜底 + 资产后置计划 |
| 存档 | 无 | SaveGame（M10） |

旧 `monopoly_plan.md` 保留作为历史记录，本计划 supersedes 其 P0–P6 部分。
