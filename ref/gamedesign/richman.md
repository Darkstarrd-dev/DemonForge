# 台湾大富翁游戏完整设计文档（网页端 2D/3D 数据驱动版）

**基准版本**：大富翁4（Richman 4，大宇资讯 1998）[1] 
**兼容版本**：大富翁8 / 大富翁10 / 大富翁11（差异处逐一标注） 
**适用场景**：网页端 2D/3D 双模式数据驱动实现；视觉渲染层完全排除

---

## 第一节：系统骨架与顶层状态对象

### 1.1 五大子系统职责

| 子系统 | 标识符 | 职责 |
|--------|--------|------|
| 地图系统 | `Board` | 持有所有格子的静态定义和运行时状态（建筑等级、所有权） |
| 玩家系统 | `Player` | 追踪每名玩家的现金、资产、位置、手牌、状态标志 |
| 卡片系统 | `Card` | 定义30种卡片的效果、费用、使用时机及反制关系 |
| 回合状态机 | `TurnFSM` | 驱动 TURN_START → ROLL_DICE → MOVING → … → TURN_END 的状态转移 |
| 经济系统 | `Economy` | 维护物价指数、银行账户、股票价格，并向租金/地价计算提供乘数 |

### 1.2 顶层 GameState（唯一数据源）

`GameState` 是渲染层（2D/3D）的唯一数据源。渲染层只读取该对象，不修改它；所有修改通过 `Move` 函数完成 [2][3]。

```typescript
// ======================================================
// 顶层游戏状态（必须完全 JSON 可序列化，不含函数/类实例）[3]
// ======================================================
interface GameState {
 // --- 元数据 ---
 version: string; // 存档版本，如 "richman4@1.0"
 day: number; // 游戏内天数（每轮所有玩家行动一次 = 1天）[1]
 phase: GamePhase; // 顶层阶段枚举
 turnContext: TurnContext; // 当前回合状态机上下文

 // --- 子系统 ---
 board: BoardState; // 地图运行时状态
 players: Player[]; // 玩家列表，按行动顺序排列
 cardDeck: CardDeck; // 卡片定义表（静态）+ 商店库存（动态）
 economy: EconomyState; // 物价指数、银行、股票
 config: GameConfig; // 本局规则参数

 // --- 事件队列（待处理的格子/卡片事件） ---
 pendingEvents: GameEvent[];

 // --- 随机种子（用于可复现的随机事件） ---
 rngSeed: number;
}

enum GamePhase {
 SETUP = 'SETUP',
 PLAYING = 'PLAYING',
 GAME_OVER = 'GAME_OVER',
}
```

### 1.3 2D/3D 渲染模式切换约定

逻辑层不感知渲染模式。每个格子同时存储 `position2D` 和 `position3D`，渲染层根据 `config.renderMode` 决定读取哪套坐标。

```typescript
interface Position2D { x: number; y: number; }
interface Position3D { x: number; y: number; z: number; }
```

### 1.4 版本差异速查表

| 机制维度 | 大富翁4 | 大富翁8 | 大富翁10 | 大富翁11 |
|----------|---------|---------|---------|---------|
| 骰子机制 | 路人1颗、机车最多2颗、汽车最多3颗 [1] | 类似大富翁4 | 类似大富翁4 | 类似大富翁4 |
| 移动方式 | 骰子制（大富翁5起曾改移动牌，4代为骰子）[4] | 骰子制 | 骰子制 | 骰子制 |
| 卡片种类 | 30种 [1] | 有调整 | 卡片用金钱购买，取消点数系统 [5] | 34种含合成机制 |
| 手牌上限 | 15张 [1] | 15张 | 无明确上限说明 | 有调整 |
| 物价指数计算 | 资产总和 ÷ 初始资金 ÷（初始人数－破产人数）| 同大富翁4 | 改为每隔固定回合数自动上升 | 同大富翁10 |
| 联机模式 | 无 | 有 | 故事/传记/热座/联网 [5] | 有 |
| 热斗模式 | 无 | 无 | 引入（小地产格替换为攻击卡格）[6] | 12传统+4热斗地图 |
| 股票系统 | 即时交易，月中分红 [7] | 有 | 有调整 | 有 |

---

## 第二节：地图数据结构（Board Data Model）

### 2.1 格子类型枚举

```typescript
// 来源：大富翁4官方说明书 [1] + 大富翁4 Fun特殊格子类型 [8]
enum SpaceType {
 PROPERTY = 'PROPERTY', // 可建设地产（住宅用地 / 商业用地）
 COMPANY = 'COMPANY', // 公司企业格（银行、百货等7类）
 START = 'START', // 起点（经过/停留均获得过路费）
 JAIL_VISIT = 'JAIL_VISIT', // 探监（仅路过，不触发坐牢）
 JAIL = 'JAIL', // 监狱（被送入时触发）
 HOSPITAL = 'HOSPITAL', // 医院（住院期间丧失收租权）[1]
 MAGIC_HOUSE = 'MAGIC_HOUSE', // 魔法屋（随机正负效果）[1]
 BANK = 'BANK', // 银行（存款/取款/贷款）
 SHOP = 'SHOP', // 百货公司/商店（购买卡片/道具）
 LOTTERY = 'LOTTERY', // 乐透（随机奖金）
 NEWS = 'NEWS', // 新闻（抽取新闻事件）
 MINI_GAME = 'MINI_GAME', // 小游戏（触发小游戏，获得点数/金钱）
 SCORE = 'SCORE', // 点数格（获得卡片点数）
 GAS_STATION = 'GAS_STATION', // 加油站（1级建筑，不可升级）[1]
 PARK = 'PARK', // 公园（1级建筑，不可升级，不收过路费）[1]
 TAX = 'TAX', // 税务（按总资产比例扣税）
 TELEPORT = 'TELEPORT', // 传送（随机或指定传送）
 TREASURE_BOX = 'TREASURE_BOX', // 宝箱（随机道具/卡片/金钱）
 FATE = 'FATE', // 命运点（随机专属事件）
 ATTACK_SPACE = 'ATTACK_SPACE', // 热斗模式：攻击型卡片格（地雷/飞弹等）[6]
 EMPTY = 'EMPTY', // 空格（路过无效果）
}
```

### 2.2 基础格子与地产格子数据结构

```typescript
// --- 基础格子（所有格子共有字段）---
interface BoardSpace {
 id: string; // 唯一ID，如 "tw_001"
 type: SpaceType;
 name: string;
 position2D: Position2D; // 渲染层读取，逻辑层忽略
 position3D: Position3D; // 渲染层读取，逻辑层忽略
 neighborIds: string[]; // 相邻格子ID列表（支持分叉路，多个元素=分叉）
 groupId: string | null; // 路段ID（null=非地产格）
}

// --- 建筑等级定义 ---
interface BuildingLevel {
 level: number; // 0=空地, 1=平房, 2=店铺, 3=商场, 4=商业大楼, 5=摩天大楼
 buildCost: number; // 建造费用（基础值，乘以物价指数后为实际费用）
 baseRent: number; // 基础租金（乘以物价指数后为实际租金）[1]
}

// --- 地产格子（住宅用地 / 商业用地）---
interface PropertySpace extends BoardSpace {
 type: SpaceType.PROPERTY;
 landType: 'RESIDENTIAL' | 'COMMERCIAL'; // 住宅地/商业地
 basePrice: number; // 基础地价（100–600）[9]
 buildingLevels: BuildingLevel[]; // 下标即 level（共6项，0–5）
 currentLevel: number; // 当前建筑等级，0=空地
 ownerId: string | null; // 玩家ID，null=无主
 mortgaged: boolean; // 是否抵押
 isChainStore: boolean; // 商业地是否已改建为连锁店
}

// 注：公园、加油站为1级建筑，currentLevel 固定为1，不可升级 [1]
// 注：物价指数修正：实际租金 = baseRent × priceIndex [1]
// 注：同路段联合租金：同 groupId 且同方向的小型建筑（含空地）租金加总 [1]
```

### 2.3 大富翁4台湾地图格子数据（参考社区共识，建议以官方说明书校验）

以下为台湾地图的格子结构示例（数值为社区共识值，建议开发者对照 Steam 版官方说明书 PDF [1] 校验）：

```json
[
 { "id": "tw_00", "type": "START", "name": "起点", "groupId": null },
 { "id": "tw_01", "type": "PROPERTY", "name": "台北车站", "groupId": "g_taipei",
 "basePrice": 600,
 "buildingLevels": [
 { "level": 0, "buildCost": 0, "baseRent": 60 },
 { "level": 1, "buildCost": 600, "baseRent": 180 },
 { "level": 2, "buildCost": 600, "baseRent": 360 },
 { "level": 3, "buildCost": 600, "baseRent": 600 },
 { "level": 4, "buildCost": 600, "baseRent": 900 },
 { "level": 5, "buildCost": 600, "baseRent": 1200 }
 ]
 },
 { "id": "tw_02", "type": "PROPERTY", "name": "忠孝东路", "groupId": "g_taipei",
 "basePrice": 500,
 "buildingLevels": [
 { "level": 0, "buildCost": 0, "baseRent": 50 },
 { "level": 1, "buildCost": 500, "baseRent": 150 },
 { "level": 2, "buildCost": 500, "baseRent": 300 },
 { "level": 3, "buildCost": 500, "baseRent": 500 },
 { "level": 4, "buildCost": 500, "baseRent": 750 },
 { "level": 5, "buildCost": 500, "baseRent": 1000 }
 ]
 },
 { "id": "tw_03", "type": "NEWS", "name": "新闻", "groupId": null },
 { "id": "tw_04", "type": "PROPERTY", "name": "西门町", "groupId": "g_ximen",
 "basePrice": 400,
 "buildingLevels": [
 { "level": 0, "buildCost": 0, "baseRent": 40 },
 { "level": 1, "buildCost": 400, "baseRent": 120 },
 { "level": 2, "buildCost": 400, "baseRent": 240 },
 { "level": 3, "buildCost": 400, "baseRent": 400 },
 { "level": 4, "buildCost": 400, "baseRent": 600 },
 { "level": 5, "buildCost": 400, "baseRent": 800 }
 ]
 },
 { "id": "tw_05", "type": "SCORE", "name": "点数格", "groupId": null },
 { "id": "tw_06", "type": "COMPANY", "name": "银行总部", "groupId": null, "companyType": "BANK" },
 { "id": "tw_07", "type": "PROPERTY", "name": "中正纪念堂", "groupId": "g_zhongzheng",
 "basePrice": 300, "buildingLevels": [
 { "level": 0, "buildCost": 0, "baseRent": 30 },
 { "level": 1, "buildCost": 300, "baseRent": 90 },
 { "level": 2, "buildCost": 300, "baseRent": 180 },
 { "level": 3, "buildCost": 300, "baseRent": 300 },
 { "level": 4, "buildCost": 300, "baseRent": 450 },
 { "level": 5, "buildCost": 300, "baseRent": 600 }
 ]
 },
 { "id": "tw_08", "type": "JAIL_VISIT", "name": "探监", "groupId": null },
 { "id": "tw_09", "type": "PROPERTY", "name": "淡水渔人码头","groupId": "g_danshui",
 "basePrice": 200, "buildingLevels": [
 { "level": 0, "buildCost": 0, "baseRent": 20 },
 { "level": 1, "buildCost": 200, "baseRent": 60 },
 { "level": 2, "buildCost": 200, "baseRent": 120 },
 { "level": 3, "buildCost": 200, "baseRent": 200 },
 { "level": 4, "buildCost": 200, "baseRent": 300 },
 { "level": 5, "buildCost": 200, "baseRent": 400 }
 ]
 },
 { "id": "tw_10", "type": "MAGIC_HOUSE","name": "魔法屋", "groupId": null },
 { "id": "tw_11", "type": "PROPERTY", "name": "阿里山", "groupId": "g_alishan",
 "basePrice": 100, "buildingLevels": [
 { "level": 0, "buildCost": 0, "baseRent": 10 },
 { "level": 1, "buildCost": 100, "baseRent": 30 },
 { "level": 2, "buildCost": 100, "baseRent": 60 },
 { "level": 3, "buildCost": 100, "baseRent": 100 },
 { "level": 4, "buildCost": 100, "baseRent": 150 },
 { "level": 5, "buildCost": 100, "baseRent": 200 }
 ]
 },
 { "id": "tw_12", "type": "MINI_GAME", "name": "小游戏", "groupId": null },
 { "id": "tw_13", "type": "SHOP", "name": "百货公司", "groupId": null },
 { "id": "tw_14", "type": "HOSPITAL", "name": "医院", "groupId": null },
 { "id": "tw_15", "type": "LOTTERY", "name": "乐透", "groupId": null },
 { "id": "tw_16", "type": "JAIL", "name": "监狱", "groupId": null },
 { "id": "tw_17", "type": "TELEPORT", "name": "传送点", "groupId": null },
 { "id": "tw_18", "type": "FATE", "name": "命运", "groupId": null },
 { "id": "tw_19", "type": "TAX", "name": "税务局", "groupId": null },
 { "id": "tw_20", "type": "BANK", "name": "银行", "groupId": null }
]
```

> **注**：大富翁4台湾地图完整格子数约36格（含资料片地图），上表为核心格子类型示例。地价区间 100–600 [9]，具体每格数值以官方说明书 PDF（Steam 版附带）[1] 为准。

### 2.4 路段分组表与联合租金触发条件

```typescript
// 路段分组（groupId → 路段信息）
interface PropertyGroup {
 groupId: string;
 name: string;
 spaceIds: string[]; // 该路段所有格子ID
 // 联合租金规则：
 // 同 groupId 且同方向的小型建筑（含空地，不含连锁店）全部租金加总 [1]
 // 大型建筑（摩天楼等）单独用特殊方法计算，不参与加总
}

// 示例
const groups: PropertyGroup[] = [
 { groupId: "g_taipei", name: "台北区", spaceIds: ["tw_01", "tw_02"] },
 { groupId: "g_ximen", name: "西门区", spaceIds: ["tw_04"] },
 { groupId: "g_zhongzheng", name: "中正区", spaceIds: ["tw_07"] },
 { groupId: "g_danshui", name: "淡水区", spaceIds: ["tw_09"] },
 { groupId: "g_alishan", name: "阿里山区", spaceIds: ["tw_11"] },
];
```

---

## 第三节：玩家数据结构（Player Data Model）

### 3.1 Player Interface

```typescript
enum PlayerStatus {
 ACTIVE = 'ACTIVE',
 IN_JAIL = 'IN_JAIL',
 IN_HOSPITAL = 'IN_HOSPITAL',
 BANKRUPT = 'BANKRUPT',
}

interface CardInstance {
 definitionId: string; // 对应 CardDefinition.id
 instanceId: string; // 运行时唯一ID（UUID）
}

interface ItemInstance {
 definitionId: string;
 instanceId: string;
 durability: number; // 剩余使用次数（-1=无限）
}

interface Player {
 // --- 身份 ---
 id: string;
 name: string;
 characterId: string; // 对应角色表
 isAI: boolean;
 aiDifficulty: 'easy' | 'normal' | 'hard';

 // --- 财务 ---
 cash: number; // 现金
 totalAssets: number; // 总资产（现金+地产估值+存款），用于物价指数计算
 ownedProperties: string[]; // 地产格子ID列表
 bankDeposit: number; // 银行存款余额
 bankLoan: number; // 未还贷款金额
 loanDueDay: number; // 贷款到期日（游戏内天数）
 stocks: Record<string, number>; // companyId → 持股数量

 // --- 位置 ---
 position: string; // 当前格子ID
 previousPosition: string; // 上一格子ID

 // --- 手牌与道具 ---
 hand: CardInstance[]; // 手牌，上限15张 [1]
 items: ItemInstance[]; // 持有道具

 // --- 状态 ---
 status: PlayerStatus;
 jailTurns: number; // 剩余坐牢回合数
 hospitalTurns: number; // 剩余住院回合数
 skipTurns: number; // 跳过回合计数（冬眠/夢遊等卡片效果）
 isCollectingRent: boolean; // 住院期间为 false，丧失收租权 [1]
 consecutiveDoubles: number; // 连续骰子相同次数（用于入狱判定）

 // --- 神明附身 ---
 godId: string | null; // 当前附身神明ID，null=无
 godRemainingDays: number; // 神明附身剩余天数

 // --- 点数（卡片/道具商店货币）---
 points: number; // 点数余额（不可与金钱互换）[7]

 // --- 交通工具 ---
 vehicle: 'PEDESTRIAN' | 'MOTORCYCLE' | 'CAR';
 // PEDESTRIAN=1颗骰子, MOTORCYCLE=最多2颗, CAR=最多3颗 [1]
}
```

### 3.2 角色数据表

```typescript
interface Character {
 id: string;
 name: string;
 description: string;
 specialAbility: string; // 被动能力描述（大富翁11起有量化天赋，大富翁4为性格差异）
 startingCash: number; // 初始资金（大富翁4可在游戏设置中调整，默认值因地图而异）
}

// 大富翁4十二名角色 [9][10]
const richman4Characters: Character[] = [
 { id: "john_joe", name: "约翰乔", description: "外国商人", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "shalon_bas", name: "沙隆巴斯",description: "神秘旅行者", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "ninja_taro", name: "忍太郎", description: "忍者", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "money_lady", name: "钱夫人", description: "富豪夫人", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "old_tu", name: "阿土伯", description: "老农夫", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "sara", name: "莎拉公主",description: "公主", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "miyamoto", name: "宫本宝藏",description: "武士", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "tangtang", name: "糖糖", description: "甜美少女", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "wumi", name: "乌咪", description: "猫女", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "sun_mei", name: "孙小美", description: "活泼少女", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "danny", name: "小丹尼", description: "小男孩", specialAbility: "无特殊被动", startingCash: 10000 },
 { id: "gold_baby", name: "金贝贝", description: "富家子弟", specialAbility: "无特殊被动", startingCash: 10000 },
];
// 注：大富翁4角色无数值化天赋，AI性格（乖宝宝/普通人/大老奸）在 aiDifficulty 字段体现
// 大富翁11起角色拥有量化天赋（如忍太郎：土地公附身时间+2天）
```

### 3.3 破产与资产清算规则

破产触发条件：`cash < 0` 且无法通过抵押地产或出售建筑补足差额。

清算流程（按顺序执行，补足后停止）：
1. **强制出售建筑**：将自有地产建筑逐级降级，每降一级回收 `buildCost × 0.5`，直到 `cash ≥ 0` 或无建筑可售。
2. **抵押地产**：将无建筑地产抵押，抵押价 = `basePrice × 0.5`（赎回价 = `basePrice × 0.6`；具体系数以官方说明书为准 [1]）。
3. **仍不足**：宣告破产，`status = BANKRUPT`；地产归债权方（若因踩地触发破产则归该地主），否则归公（移除所有权）。

---

## 第四节：卡片系统数据结构（Card System）

卡片系统是大富翁系列区别于其他强手棋的核心原创特色 [6]。

### 4.1 CardDefinition Interface

```typescript
enum CardEffectType {
 // 移动类
 TELEPORT_TO_SPACE = 'TELEPORT_TO_SPACE', // 传送到指定格子
 MOVE_BACKWARD = 'MOVE_BACKWARD', // 倒退N步
 MOVE_FORWARD = 'MOVE_FORWARD', // 前进N步
 CHANGE_DIRECTION = 'CHANGE_DIRECTION', // 改变行走方向
 FORCE_MOVE = 'FORCE_MOVE', // 强制对手移动（夢遊）
 // 金钱类
 EQUALIZE_CASH_ALL = 'EQUALIZE_CASH_ALL', // 均富：全体现金平分
 EQUALIZE_CASH_ONE = 'EQUALIZE_CASH_ONE', // 均贫：与指定对手平分
 STEAL_CARD_ITEM = 'STEAL_CARD_ITEM', // 抢夺对手卡片/道具
 TAX_TARGET = 'TAX_TARGET', // 查税：令目标缴纳20%现金
 // 建筑类
 UPGRADE_GROUP = 'UPGRADE_GROUP', // 天使卡：路段全部+1级
 DEMOLISH_GROUP = 'DEMOLISH_GROUP', // 恶魔卡：路段全部清零
 DEMOLISH_ONE = 'DEMOLISH_ONE', // 怪兽卡：指定地产清零
 DOWNGRADE_ONE = 'DOWNGRADE_ONE', // 拆除卡：降一级
 CONVERT_CHAIN_STORE = 'CONVERT_CHAIN_STORE', // 改建卡：改建为连锁店
 // 地产类
 FORCE_PURCHASE = 'FORCE_PURCHASE', // 购地卡：强制以市价收购
 SWAP_LAND = 'SWAP_LAND', // 换地卡：交换同大小地产
 SWAP_BUILDING = 'SWAP_BUILDING', // 换屋卡：交换建筑位置
 FORCE_AUCTION = 'FORCE_AUCTION', // 拍卖卡：强制拍卖地产
 PRICE_UP_GROUP = 'PRICE_UP_GROUP', // 涨价卡：路段涨价5天
 SEAL_GROUP = 'SEAL_GROUP', // 查封卡：路段查封5天
 // 状态类
 SEND_TO_JAIL = 'SEND_TO_JAIL', // 陷害卡：坐牢5天
 FRAME_TRANSFER = 'FRAME_TRANSFER', // 嫁祸卡：转嫁给对手
 REVENGE = 'REVENGE', // 复仇卡：使陷害者同样入狱
 IMMUNITY = 'IMMUNITY', // 免罪卡：抵消一次负面效果
 FREE_PASS = 'FREE_PASS', // 免费卡：免除一次高额罚款
 FREEZE = 'FREEZE', // 冬眠卡：全体（除自己）冬眠5天
 SLOW_TURTLE = 'SLOW_TURTLE', // 乌龟卡：目标每次只走1步（3天）
 STOP_TURN = 'STOP_TURN', // 停留卡：目标原地停留1回合
 // 股票类
 STOCK_UP = 'STOCK_UP', // 红卡：指定股票涨停3天
 STOCK_DOWN = 'STOCK_DOWN', // 黑卡：指定股票跌停3天
 // 神明类
 SUMMON_GOD = 'SUMMON_GOD', // 请神符：召来最近神明
 DISMISS_GOD = 'DISMISS_GOD', // 送神符：送走附身坏神明
 // 同盟类
 ALLIANCE = 'ALLIANCE', // 同盟卡：结盟7天，免过路费
}

enum CardUseTiming {
 ON_TURN = 'ON_TURN', // 自己回合内主动使用
 ON_RENT = 'ON_RENT', // 踩到对方地产时（支付租金前）
 REACTION = 'REACTION', // 被攻击时反制（如免罪卡、嫁祸卡）
 PASSIVE = 'PASSIVE', // 被动触发（无需主动使用）
 ANYTIME = 'ANYTIME', // 任意时刻
}

interface CardDefinition {
 id: string;
 name: string;
 description: string;
 pointCost: number; // 购买所需点数
 targetType: 'SELF' | 'OPPONENT' | 'ALL' | 'PROPERTY' | 'GLOBAL';
 effectType: CardEffectType;
 effectParams: Record<string, unknown>; // 效果参数，随effectType变化
 useTiming: CardUseTiming;
 stackable: boolean; // 是否可叠加
 duration: number; // 持续回合数（0=即时）
 canUseOnCompany: boolean; // 是否可对公司企业使用（购地卡/天使卡=false）[11]
 counterCards: string[]; // 可反制此卡的卡片ID列表
 versions: string[]; // 存在于哪些版本 ['richman4', 'richman8',...]
}

interface CardInstance {
 definitionId: string;
 instanceId: string;
}
```

### 4.2 大富翁4完整30种卡片效果表 [11][1]

| ID | 卡片名称 | 点数 | 目标类型 | 效果描述 | effectType | 大富翁10变体 |
|----|----------|------|----------|----------|------------|-------------|
| 0 | 均富卡 | 200 | ALL | 全体玩家现金平分 | EQUALIZE_CASH_ALL | 保留，用金钱购买 |
| 1 | 均贫卡 | 200 | OPPONENT | 与指定对手平分现金 | EQUALIZE_CASH_ONE | 保留 |
| 2 | 购地卡 | 35 | PROPERTY | 强制以市价收购踩到的地产（不可对公司使用）[11] | FORCE_PURCHASE | 保留 |
| 3 | 换地卡 | 30 | PROPERTY | 与对手交换同等大小地产 | SWAP_LAND | 保留 |
| 4 | 换屋卡 | 30 | PROPERTY | 交换两处建筑位置 | SWAP_BUILDING | 保留 |
| 5 | 改建卡 | 40 | PROPERTY | 将空地建成房屋后改建为连锁店 | CONVERT_CHAIN_STORE | 有调整 |
| 6 | 拍卖卡 | 20 | PROPERTY | 强制拍卖踩到的地产，使用者不参与竞标 | FORCE_AUCTION | 保留 |
| 7 | 天使卡 | 160 | PROPERTY | 指定路段所有建筑+1级（不可对公司使用）[11] | UPGRADE_GROUP | 保留 |
| 8 | 恶魔卡 | 180 | PROPERTY | 指定路段所有建筑清零 | DEMOLISH_GROUP | 保留 |
| 9 | 怪兽卡 | 80 | PROPERTY | 指定地产建筑清零 | DEMOLISH_ONE | 保留 |
| 10 | 拆除卡 | 40 | PROPERTY | 指定地产降一级 | DOWNGRADE_ONE | 保留 |
| 11 | 转向卡 | 20 | SELF/OPPONENT | 改变自己或对手行走方向 | CHANGE_DIRECTION | 保留 |
| 12 | 停留卡 | 30 | OPPONENT | 令指定对手原地停留1回合 | STOP_TURN | 保留 |
| 13 | 乌龟卡 | 30 | OPPONENT | 令指定对手每次只走1步（3天有效）| SLOW_TURTLE | 保留 |
| 14 | 抢夺卡 | 50 | OPPONENT | 抢夺对手的卡片或道具 | STEAL_CARD_ITEM | 保留 |
| 15 | 夢遊卡 | 60 | OPPONENT | 使指定对手强制夢遊5天 | FORCE_MOVE | 保留 |
| 16 | 冬眠卡 | 100 | ALL | 使用者以外全体玩家冬眠5天 | FREEZE | 保留 |
| 17 | 陷害卡 | 50 | OPPONENT | 使指定对手坐牢5天 | SEND_TO_JAIL | 保留 |
| 18 | 嫁祸卡 | 30 | REACTION | 被陷害时可转嫁给对手 | FRAME_TRANSFER | 保留 |
| 19 | 复仇卡 | 40 | REACTION | 被对手陷害时使其遭受同样下场 | REVENGE | 保留 |
| 20 | 免罪卡 | 50 | REACTION | 抵消陷害/催眠/命运卡效果一次 | IMMUNITY | 保留 |
| 21 | 免费卡 | 80 | REACTION | 免除一次高额罚款支付 | FREE_PASS | 保留 |
| 22 | 红卡 | 60 | GLOBAL | 使指定股票涨停三天 | STOCK_UP | 大富翁10无股票，此卡移除 |
| 23 | 黑卡 | 60 | GLOBAL | 使指定股票跌停三天 | STOCK_DOWN | 大富翁10无股票，此卡移除 |
| 24 | 查税卡 | 50 | OPPONENT | 使指定玩家缴纳20%现金税款 | TAX_TARGET | 保留 |
| 25 | 涨价卡 | 40 | PROPERTY | 指定路段地价上涨5天 | PRICE_UP_GROUP | 保留 |
| 26 | 查封卡 | 40 | PROPERTY | 指定路段地产查封5天（停止收租）| SEAL_GROUP | 保留 |
| 27 | 同盟卡 | 80 | OPPONENT | 与指定玩家结盟7天，互免过路费 | ALLIANCE | 保留 |
| 28 | 请神符 | 30 | SELF | 召来最靠近自己的神明 | SUMMON_GOD | 有调整 |
| 29 | 送神符 | 30 | SELF | 送走附身的坏神明（死神无效）| DISMISS_GOD | 有调整 |

> **卡片数量说明**：官方说明书明确记载30种 [1]，Wiki 卡片列表记录29–30种（差异来源于"拍卖卡"是否单独计入）[11]。上表以说明书30种为准，ID 0–29。

### 4.3 卡片反制链与使用时机

反制链（三者相互 counter）：
- **陷害卡**（id:17）→ 被**免罪卡**（id:20）抵消 → 被**嫁祸卡**（id:18）转嫁 → 被**复仇卡**（id:19）反击

使用时机规则：
- `REACTION` 类卡片（免罪、嫁祸、复仇）在对方宣告攻击后、效果生效前，有一个"反应窗口"（`CARD_USE_WINDOW` 阶段）可打出。
- `ON_RENT` 类卡片（购地卡）仅在踩到对方地产、系统询问是否支付租金时可使用。

### 4.4 点数系统与商店

点数（Points）获取途径 [7]：经过点数格、小游戏奖励、宝箱随机获得。点数不可与金钱互换 [7]。

```typescript
interface ShopInventory {
 availableCards: string[]; // 当前可购卡片的 CardDefinition.id 列表
 refreshOnDay: number; // 下次刷新的游戏内天数（-1=不刷新）
}
```

大富翁10起卡片改用金钱购买，`pointCost` 字段转为金钱价格，`ShopInventory` 逻辑不变 [5]。

---

## 第五节：回合状态机与交互逻辑（Turn FSM）

### 5.1 TurnContext 与状态机定义

```typescript
enum TurnPhase {
 TURN_START = 'TURN_START',
 ROLL_DICE = 'ROLL_DICE',
 MOVING = 'MOVING',
 SPACE_RESOLUTION = 'SPACE_RESOLUTION',
 PURCHASE_DECISION = 'PURCHASE_DECISION',
 BUILD_DECISION = 'BUILD_DECISION',
 RENT_PAYMENT = 'RENT_PAYMENT',
 CARD_EVENT = 'CARD_EVENT',
 SPECIAL_SPACE = 'SPECIAL_SPACE',
 CARD_USE_WINDOW = 'CARD_USE_WINDOW', // 反制窗口
 STOCK_TRADE = 'STOCK_TRADE', // 可选：股票操作
 TURN_END = 'TURN_END',
}

interface TurnContext {
 currentPlayerId: string;
 phase: TurnPhase;
 diceResults: number[]; // 如 [12][5]
 diceCount: number; // 本次使用骰子数（1–3，取决于交通工具）
 moveSteps: number; // 剩余移动步数
 movePath: string[]; // 已规划的格子ID路径（渲染层消费）
 pendingRent: RentInfo | null;
 pendingPurchase: PurchaseInfo | null;
 cardUseWindowFor: string | null; // 正在等待反制的攻击卡ID
 consecutiveDoubles: number; // 当前回合连续双数次数
}
```

### 5.2 状态转移图

```
TURN_START
 │
 ├─[玩家在监狱]──→ 询问出狱方式（付罚款/使用出狱卡/等待骰子相同）
 │ └─ 出狱成功 → ROLL_DICE
 │ └─ 继续坐牢 → TURN_END（jailTurns--）
 │
 ├─[玩家在医院]──→ hospitalTurns-- → TURN_END（跳过行动）
 │
 ├─[skipTurns > 0]→ skipTurns-- → TURN_END
 │
 └─[正常] ──────→ ROLL_DICE
 │
 ├─[连续3次双数]──→ 入狱 → TURN_END （consecutiveDoubles=3）
 │
 └─[正常掷骰] ──→ MOVING
 │
 └─ 逐格移动 → SPACE_RESOLUTION
 │
 ┌────────────────┼───────────────────────┐
 │ │ │
 PURCHASE_DECISION RENT_PAYMENT SPECIAL_SPACE
 │ │ │
 └────────────────┴───────────────────────┘
 │
 CARD_USE_WINDOW（反制窗口）
 │
 STOCK_TRADE（可选）
 │
 TURN_END
```

### 5.3 骰子与移动逻辑

**骰子数量**：由玩家当前交通工具决定——路人最多1颗，机车最多2颗，汽车最多3颗；除路人外骰子数可任意切换 [1]。

**连续双数入狱**：同一回合内连续3次 `die1 === die2`，直接入狱，不执行移动 [1]。

**骰子相同额外回合**：大富翁4中，单次骰子相同不触发额外回合（与标准西方大富翁不同）；此行为以官方说明书为准 [1]，可通过 `config.allowDoubleRoll` 开关兼容其他规则。

**移动路径生成**（逻辑层输出，渲染层消费）：
```typescript
interface MoveAnimation {
 path: string[]; // 按顺序经过的格子ID列表（含起点，不含终点）
 duration: number; // 建议动画总时长（毫秒），逻辑层建议值，渲染层可覆盖
}
```

路径通过 BFS/DFS 沿 `neighborIds` 展开，步数为 `diceResults` 之和。遇到分叉路时，AI 自动选择或等待玩家输入。

**大富翁5移动牌变体**（可选配置）[4]：
```typescript
// config.diceMode = 'movement_card' 时启用
// 玩家从手牌中打出移动牌（0–9步）代替骰子
```

### 5.4 格子落地事件处理（Space Resolution）

```
PROPERTY（地产）：
 if ownerId === null:
 → PURCHASE_DECISION（询问是否购买，price = basePrice × priceIndex）
 elif ownerId === currentPlayer.id:
 → BUILD_DECISION（询问是否升级建筑）
 elif owner.status === IN_HOSPITAL:
 → 无需支付（住院玩家丧失收租权）[1]
 else:
 → RENT_PAYMENT（计算租金，见第六节）

START（起点）：
 → 经过或停留均获得：passBonus × priceIndex（passBonus = 基础过路费，以说明书为准）[1]

JAIL（监狱）：
 → player.status = IN_JAIL
 → player.jailTurns = 3
 出狱条件：① 支付罚款（罚款 = 基础值 × priceIndex）
 ② 使用出狱卡
 ③ 骰子相同（die1 === die2）

HOSPITAL（医院）：
 → player.status = IN_HOSPITAL
 → player.hospitalTurns = 3
 → player.isCollectingRent = false [1]
 出院条件：hospitalTurns 归零自动出院

MAGIC_HOUSE（魔法屋）：
 → 从魔法屋效果池随机抽取一条效果执行（见第七节）[1]

BANK（银行）：
 → 进入银行交互（存款/取款/贷款/还款/融资，三选一）[9]
 → 存款：每月1号自动获得10%利息 [9]
 → 贷款：获得 cash + deposit 等量金额，3个月期限，无利息 [9]

SHOP（商店/百货公司）：
 → 打开 ShopInventory，玩家可用点数购买卡片/道具
 → 百货公司董事长进入时额外获得随机免费道具或卡片 [10]

LOTTERY（乐透）：
 → 支付投注金（参考社区共识：约1000元），随机开奖

NEWS（新闻）：
 → 从新闻事件池随机抽取一条执行（见第七节）

MINI_GAME（小游戏）：
 → 触发 MiniGame，结果回写到 GameState（见第七节）

TAX（税务）：
 → 扣税额 = player.totalAssets × taxRate（taxRate 在 GameConfig 中配置）

TELEPORT（传送）：
 → 随机传送到地图上另一格子，或按卡片指定目标

COMPANY（公司企业）：
 → 非董事长玩家踩到：支付过路费（金额由公司类型和持股决定）
 → 停留可进行股票操作（买入/卖出）
 → 月中（游戏内15日）：董事长获得股息分红 [7]
```

### 5.5 购买与建造逻辑

```typescript
function canPurchase(player: Player, space: PropertySpace, gs: GameState): boolean {
 return space.ownerId === null
 && player.cash >= space.basePrice * gs.economy.priceIndex;
}

function canBuild(player: Player, space: PropertySpace, gs: GameState): boolean {
 if (space.ownerId !== player.id) return false;
 if (space.mortgaged) return false;
 if (space.currentLevel >= 5) return false; // 已达最高等级
 const nextLevel = space.buildingLevels[space.currentLevel + 1];
 return player.cash >= nextLevel.buildCost * gs.economy.priceIndex;
}

// 大型建筑（5级摩天楼）特殊条件：需拥有同 groupId 的全部地产
function canBuildMaxLevel(player: Player, space: PropertySpace, gs: GameState): boolean {
 if (space.currentLevel !== 4) return false;
 const group = gs.board.groups[space.groupId!];
 return group.spaceIds.every(id => {
 const s = gs.board.spaces[id] as PropertySpace;
 return s.ownerId === player.id;
 });
}
```

### 5.6 PlayerAction 联合类型

```typescript
type PlayerAction =
 | { type: 'ROLL_DICE'; diceCount: number }
 | { type: 'CHOOSE_PATH'; direction: 'LEFT' | 'RIGHT' } // 分叉路选择
 | { type: 'PURCHASE_PROPERTY'; spaceId: string }
 | { type: 'DECLINE_PURCHASE' }
 | { type: 'BUILD_STRUCTURE'; spaceId: string }
 | { type: 'DECLINE_BUILD' }
 | { type: 'USE_CARD'; cardInstanceId: string; targetId?: string; targetSpaceId?: string }
 | { type: 'PAY_RENT'; amount: number }
 | { type: 'MORTGAGE_PROPERTY'; spaceId: string }
 | { type: 'REDEEM_PROPERTY'; spaceId: string }
 | { type: 'BUY_STOCK'; companyId: string; quantity: number }
 | { type: 'SELL_STOCK'; companyId: string; quantity: number }
 | { type: 'BANK_DEPOSIT'; amount: number }
 | { type: 'BANK_WITHDRAW'; amount: number }
 | { type: 'BANK_LOAN' }
 | { type: 'BANK_REPAY' }
 | { type: 'PAY_JAIL_FEE' }
 | { type: 'DECLARE_BANKRUPT' }
 | { type: 'END_TURN' };
```

### 5.7 多人同步与 boardgame.io 集成

热座模式与联网模式的逻辑层完全相同，差异仅在 `PlayerAction` 的来源：热座为本地输入，联网为网络消息。

基于 boardgame.io 的状态同步方案 [2][3]：
- `G`（即 `GameState`）为开发者管理的游戏状态，必须 JSON 可序列化，不含函数或类实例 [3]。
- `ctx` 为框架只读元数据（`currentPlayer`、`turn`、`numPlayers`）[2]。
- Moves 为修改 `G` 的纯函数，不得有副作用 [2]。
- Phases 支持不同阶段有不同的合法 moves（如 `CARD_USE_WINDOW` 阶段仅允许 `USE_CARD` 和 `END_TURN`）[3]。

游戏模式枚举 [5]：
```typescript
enum GameMode {
 STORY = 'STORY', // 故事模式
 BIOGRAPHY = 'BIOGRAPHY', // 传记模式
 HOT_SEAT = 'HOT_SEAT', // 多人热座
 ONLINE = 'ONLINE', // 联网
}
```

---

## 第六节：经济系统——物价指数机制（Economy System）

### 6.1 物价指数定义与计算

物价指数（`priceIndex`）影响：过路费、事件金额、地价、租金 [1]。**不影响**：卡片售价（大富翁10后明确排除）。

**大富翁10以前版本**（含大富翁4）的计算公式 [1]：

```
priceIndex = 所有玩家资产总和 / 初始资金 / (初始人数 - 已破产人数)
```

- 游戏开始时所有玩家资产相等，故 `priceIndex = 1.0` [1]。
- 物价指数正常最大值约为 107374（理论上限约 214748，基于 32 位整数限制）[9]。
- 每回合结束后重新计算。

**大富翁10及以后版本**：物价指数改为每经过固定回合数自动上升，不再依据资产总和计算（默认约每18天/次上升一档）。

```typescript
interface EconomyState {
 priceIndex: number; // 当前物价指数，初始值 1.0
 initialCash: number; // 游戏开始时人均初始资金
 initialPlayerCount: number; // 游戏开始时玩家总数
 bankruptCount: number; // 已破产玩家数

 // 银行系统
 bankAccounts: Record<string, BankAccount>; // playerId → 账户

 // 股票系统（大富翁4有，大富翁10无）
 stockPrices: Record<string, number>; // companyId → 当前股价
 stockLimitUp: Record<string, number>; // companyId → 涨停剩余天数
 stockLimitDown: Record<string, number>; // companyId → 跌停剩余天数
 dividendDay: number; // 下次分红的游戏内天数（每月15日）[7]
}

interface BankAccount {
 playerId: string;
 deposit: number; // 存款余额
 loan: number; // 贷款余额
 loanDueDay: number; // 贷款到期日
 // 利率：存款每月1日获得10%利息 [9]
 // 贷款：3个月期限，无利息 [9]
}
```

### 6.2 租金计算完整伪代码

```typescript
function calculateRent(
 landingPlayer: Player,
 space: PropertySpace,
 gs: GameState
): number {
 // 0. 住院玩家无法收租 [1]
 const owner = gs.players.find(p => p.id === space.ownerId)!;
 if (owner.status === PlayerStatus.IN_HOSPITAL) return 0;

 // 1. 查封状态：免收租金
 if (space.sealed) return 0;

 // 2. 大型建筑（5级摩天楼）：单独计算，不参与路段加总 [1]
 if (space.currentLevel === 5) {
 const baseRent = space.buildingLevels[2].baseRent;
 return Math.floor(baseRent * gs.economy.priceIndex);
 }

 // 3. 连锁店：全地图同方向连锁店租金加总
 if (space.isChainStore) {
 const chainRent = gs.board.spaces
.filter(s => s.type === SpaceType.PROPERTY
 && (s as PropertySpace).isChainStore
 && (s as PropertySpace).ownerId === owner.id)
.reduce((sum, s) => {
 const ps = s as PropertySpace;
 return sum + ps.buildingLevels[ps.currentLevel].baseRent;
 }, 0);
 return Math.floor(chainRent * gs.economy.priceIndex);
 }

 // 4. 小型建筑（0–4级）：同路段同方向所有格子租金加总 [1]
 const group = gs.board.groups[space.groupId!];
 const groupRent = group.spaceIds
.map(id => gs.board.spaces[id] as PropertySpace)
.filter(s => s.ownerId === owner.id && !s.isChainStore && s.currentLevel < 5)
.reduce((sum, s) => sum + s.buildingLevels[s.currentLevel].baseRent, 0);

 let rent = Math.floor(groupRent * gs.economy.priceIndex);

 // 5. 卡片效果修正（涨价卡：路段租金×2；查封卡：租金=0）
 if (space.priceUpDays > 0) rent *= 2;

 return rent;
}
```

### 6.3 物价指数影响范围映射表

| 金额类型 | 受物价指数影响 | 备注 |
|----------|----------------|------|
| 地产过路费（租金） | ✅ | × priceIndex |
| 购地价格 | ✅ | × priceIndex |
| 建筑费用 | ✅ | × priceIndex |
| 起点过路费 | ✅ | × priceIndex |
| 事件金额（新闻/魔法屋） | ✅ | × priceIndex |
| 小游戏奖励/惩罚 | ✅ | × priceIndex |
| 热斗模式爆裂物伤害 | ✅（大富翁10后）| × priceIndex |
| 卡片售价 | ❌ | 大富翁10后明确排除 |
| 银行利率 | ❌ | 固定值 |

---

## 第七节：游戏内容数据——完整内容表

### 7.1 新闻事件池

```typescript
enum EventEffectType {
 ALL_GAIN_CASH = 'ALL_GAIN_CASH',
 ALL_LOSE_CASH = 'ALL_LOSE_CASH',
 ALL_GAIN_PERCENT = 'ALL_GAIN_PERCENT', // 按总资产比例
 ALL_LOSE_PERCENT = 'ALL_LOSE_PERCENT',
 PROPERTY_PRICE_UP = 'PROPERTY_PRICE_UP',
 PROPERTY_PRICE_DOWN= 'PROPERTY_PRICE_DOWN',
 RANDOM_PLAYER_GAIN = 'RANDOM_PLAYER_GAIN',
 RANDOM_PLAYER_LOSE = 'RANDOM_PLAYER_LOSE',
 STOCK_SURGE = 'STOCK_SURGE',
 STOCK_CRASH = 'STOCK_CRASH',
}

interface EventEffect {
 type: EventEffectType;
 value: number; // 金额或百分比
 target: 'ALL' | 'RANDOM' | 'RICHEST' | 'POOREST';
}

interface NewsEvent {
 id: string;
 title: string;
 description: string;
 effect: EventEffect;
}

// 大富翁4风格新闻事件池（示例20条）
const newsEvents: NewsEvent[] = [
 { id: "n01", title: "经济景气上扬", description: "全体玩家获得奖金", effect: { type: 'ALL_GAIN_CASH', value: 5000, target: 'ALL' } },
 { id: "n02", title: "股市大涨", description: "全体玩家资产增值", effect: { type: 'ALL_GAIN_PERCENT', value: 0.10, target: 'ALL' } },
 { id: "n03", title: "房地产热潮", description: "地价全面上涨", effect: { type: 'PROPERTY_PRICE_UP', value: 0.20, target: 'ALL' } },
 { id: "n04", title: "政府发放红包", description: "每人获得红包", effect: { type: 'ALL_GAIN_CASH', value: 3000, target: 'ALL' } },
 { id: "n05", title: "彩票中奖", description: "随机一名玩家中奖", effect: { type: 'RANDOM_PLAYER_GAIN', value: 20000, target: 'RANDOM' } },
 { id: "n06", title: "景气复苏", description: "地价回升", effect: { type: 'PROPERTY_PRICE_UP', value: 0.10, target: 'ALL' } },
 { id: "n07", title: "旅游业兴旺", description: "全体获得旅游收入", effect: { type: 'ALL_GAIN_CASH', value: 2000, target: 'ALL' } },
 { id: "n08", title: "科技股大涨", description: "电脑公司股票暴涨", effect: { type: 'STOCK_SURGE', value: 0.30, target: 'ALL' } },
 { id: "n09", title: "金融危机", description: "全体玩家损失资产", effect: { type: 'ALL_LOSE_PERCENT', value: 0.10, target: 'ALL' } },
 { id: "n10", title: "房产税开征", description: "按地产数量缴税", effect: { type: 'ALL_LOSE_CASH', value: 3000, target: 'ALL' } },
 { id: "n11", title: "地震灾害", description: "随机玩家房屋受损", effect: { type: 'RANDOM_PLAYER_LOSE', value: 10000, target: 'RANDOM' } },
 { id: "n12", title: "股市崩盘", description: "股价全面下跌", effect: { type: 'STOCK_CRASH', value: 0.20, target: 'ALL' } },
 { id: "n13", title: "通货膨胀", description: "地价下跌", effect: { type: 'PROPERTY_PRICE_DOWN', value: 0.15, target: 'ALL' } },
 { id: "n14", title: "政府征税", description: "全体缴纳所得税", effect: { type: 'ALL_LOSE_PERCENT', value: 0.05, target: 'ALL' } },
 { id: "n15", title: "台风来袭", description: "全体玩家损失", effect: { type: 'ALL_LOSE_CASH', value: 5000, target: 'ALL' } },
 { id: "n16", title: "火灾事故", description: "最富有玩家受损", effect: { type: 'ALL_LOSE_CASH', value: 8000, target: 'RICHEST' } },
 { id: "n17", title: "交通事故", description: "随机玩家支付医疗费", effect: { type: 'RANDOM_PLAYER_LOSE', value: 6000, target: 'RANDOM' } },
 { id: "n18", title: "能源危机", description: "全体缴纳能源附加税", effect: { type: 'ALL_LOSE_CASH', value: 4000, target: 'ALL' } },
 { id: "n19", title: "环保罚款", description: "工业公司股价下跌", effect: { type: 'STOCK_CRASH', value: 0.10, target: 'ALL' } },
 { id: "n20", title: "贫富差距扩大", description: "最穷玩家获得补贴", effect: { type: 'RANDOM_PLAYER_GAIN', value: 10000, target: 'POOREST' } },
];
```

### 7.2 魔法屋效果池

```typescript
interface MagicHouseEffect {
 id: string;
 description: string;
 type: EventEffectType | 'TELEPORT' | 'GIVE_CARD' | 'STEAL_ALL_ITEMS' | 'CHANGE_VEHICLE';
 params: Record<string, unknown>;
 isPositive: boolean;
}

// 大富翁4风格魔法屋效果池（15条）[1]
const magicHouseEffects: MagicHouseEffect[] = [
 { id: "m01", description: "获得一笔意外之财", type: 'ALL_GAIN_CASH', params: { value: 10000 }, isPositive: true },
 { id: "m02", description: "所有道具被变卖，获得等值金钱", type: 'STEAL_ALL_ITEMS', params: {}, isPositive: false },
 { id: "m03", description: "传送到随机格子", type: 'TELEPORT', params: { random: true }, isPositive: false },
 { id: "m04", description: "获得随机一张卡片", type: 'GIVE_CARD', params: { random: true }, isPositive: true },
 { id: "m05", description: "交通工具升级为汽车", type: 'CHANGE_VEHICLE', params: { vehicle: 'CAR' }, isPositive: true },
 { id: "m06", description: "交通工具降级为路人", type: 'CHANGE_VEHICLE', params: { vehicle: 'PEDESTRIAN' }, isPositive: false },
 { id: "m07", description: "损失一笔金钱", type: 'ALL_LOSE_CASH', params: { value: 8000 }, isPositive: false },
 { id: "m08", description: "获得双倍过路费奖励", type: 'ALL_GAIN_CASH', params: { value: 15000 }, isPositive: true },
 { id: "m09", description: "被传送到监狱", type: 'TELEPORT', params: { targetType: 'JAIL' }, isPositive: false },
 { id: "m10", description: "获得3张随机卡片", type: 'GIVE_CARD', params: { count: 3 }, isPositive: true },
 { id: "m11", description: "缴纳总资产10%罚款", type: 'ALL_LOSE_PERCENT', params: { value: 0.10 }, isPositive: false },
 { id: "m12", description: "获得总资产5%奖励", type: 'ALL_GAIN_PERCENT', params: { value: 0.05 }, isPositive: true },
 { id: "m13", description: "传送到最贵地产", type: 'TELEPORT', params: { targetType: 'MOST_EXPENSIVE' }, isPositive: false },
 { id: "m14", description: "获得一辆机车", type: 'CHANGE_VEHICLE', params: { vehicle: 'MOTORCYCLE' }, isPositive: true },
 { id: "m15", description: "随机获得或失去金钱", type: 'RANDOM_PLAYER_GAIN', params: { value: 5000 }, isPositive: true },
];
```

### 7.3 道具系统

道具与卡片的区别：道具为持有物品（交通工具、武器等），多数被动生效或主动投放；卡片为主动打出的即时/持续效果。

```typescript
enum ItemCategory {
 VEHICLE = 'VEHICLE', // 交通工具（机车/汽车/工程车）
 WEAPON = 'WEAPON', // 武器（地雷/飞弹/核子飞弹）
 TRAP = 'TRAP', // 陷阱（路障/定时炸弹）
 TOOL = 'TOOL', // 工具（机器工人/机器娃娃/传送机/遥控骰子/时光机）
}

interface ItemDefinition {
 id: string;
 name: string;
 description: string;
 category: ItemCategory;
 pointCost: number; // -1 = 非卖品（研究所研发）
 acquireMethod: 'SHOP' | 'RESEARCH_LAB' | 'PICKUP' | 'INITIAL';
 // INITIAL = 玩家初始持有（机器工人、机器娃娃等）
 effectRange: number; // 攻击范围（格数），-1=不适用
}

// 大富翁4完整13种道具 [11]（ID 0–12）
const richman4Items: ItemDefinition[] = [
 { id: "i00", name: "机车", description: "骑机车状态，可用1–2颗骰子", category: 'VEHICLE', pointCost: -1, acquireMethod: 'PICKUP', effectRange: -1 },
 { id: "i01", name: "汽车", description: "开汽车状态，可用1–3颗骰子", category: 'VEHICLE', pointCost: -1, acquireMethod: 'PICKUP', effectRange: -1 },
 { id: "i02", name: "工程车", description: "7回合内拆除经过的对手房屋到空地", category: 'VEHICLE', pointCost: -1, acquireMethod: 'RESEARCH_LAB', effectRange: -1 },
 { id: "i03", name: "机器工人", description: "在指定地点加盖1层房屋", category: 'TOOL', pointCost: -1, acquireMethod: 'RESEARCH_LAB', effectRange: -1 },
 { id: "i04", name: "机器娃娃", description: "清除前方道路障碍", category: 'TOOL', pointCost: 15, acquireMethod: 'SHOP', effectRange: -1 },
 { id: "i05", name: "传送机", description: "可传送几乎所有事物", category: 'TOOL', pointCost: -1, acquireMethod: 'RESEARCH_LAB', effectRange: -1 },
 { id: "i06", name: "路障", description: "放置后拦截通过人员", category: 'TRAP', pointCost: 30, acquireMethod: 'INITIAL', effectRange: 0 },
 { id: "i07", name: "地雷", description: "放置后任意人经过即爆炸，住院3天", category: 'WEAPON', pointCost: 25, acquireMethod: 'INITIAL', effectRange: 0 },
 { id: "i08", name: "定时炸弹", description: "附于停留者倒数计时爆炸", category: 'TRAP', pointCost: 25, acquireMethod: 'INITIAL', effectRange: 0 },
 { id: "i09", name: "核子飞弹", description: "大范围建筑全毁（9×9格）", category: 'WEAPON', pointCost: -1, acquireMethod: 'RESEARCH_LAB', effectRange: 9 },
 { id: "i10", name: "飞弹", description: "小范围建筑受损（3×3格），住院3天", category: 'WEAPON', pointCost: 100, acquireMethod: 'SHOP', effectRange: 3 },
 { id: "i11", name: "遥控骰子", description: "决定6步内的行走点数", category: 'TOOL', pointCost: 30, acquireMethod: 'INITIAL', effectRange: -1 },
 { id: "i12", name: "时光机", description: "所有人回到上一回合", category: 'TOOL', pointCost: -1, acquireMethod: 'RESEARCH_LAB', effectRange: -1 },
];

// 富甲天下4道具持有上限参考（作为扩展变体）[13]：
// 机关类：上限10个；锦囊类：各10个；其余武品：20个
```

### 7.4 神明系统

```typescript
interface GodDefinition {
 id: string;
 name: string;
 alignment: 'GOOD' | 'BAD' | 'NEUTRAL';
 durationDays: number; // 附身持续天数（通常7天，死神13天）
 canDismiss: boolean; // 是否可用送神符移除（死神=false）
 transformTo: string | null; // 可变身为另一神明的ID（如小财神→大财神）
 effects: GodEffect[];
}

// 大富翁4共13种神明，除死神外附身时间均为7天，死神为13天 [1]
// 神明分好/坏两类，互斥出现（好神/坏神交替）
```

### 7.5 小游戏触发数据

```typescript
interface MiniGame {
 id: string;
 name: string;
 triggerCondition: 'LAND_ON_SPACE' | 'SPECIFIC_DAY' | 'CARD_EFFECT';
 rewardFormula: string; // 如 "score * 100 * priceIndex"
 penaltyFormula: string; // 如 "score < 50 ? -2000: 0"
}

// 小游戏结果回写接口
interface MiniGameResult {
 playerId: string;
 gameId: string;
 score: number;
 cashDelta: number; // 金钱变化（正=获得，负=损失）
 pointDelta: number; // 点数变化
}

// 结果通过 Move 函数写入 GameState.players[i].cash 和.points
```

---

## 第八节：AI玩家行为策略（AI Behavior Model）

### 8.1 AI决策接口

```typescript
interface AIDecisionContext {
 gameState: GameState;
 playerId: string; // 当前AI玩家ID
 legalActions: PlayerAction[]; // 当前合法操作列表
}

interface AIDecisionResult {
 action: PlayerAction;
 reason: string; // 调试用，不影响游戏逻辑
}

// AI决策器签名
type AIDecisionFn = (ctx: AIDecisionContext) => AIDecisionResult;
```

### 8.2 三档难度策略

```typescript
interface AIConfig {
 difficulty: 'easy' | 'normal' | 'hard';
 purchaseThreshold: number; // 购买地产时现金/地价的最低比值（如1.5=剩余现金≥地价1.5倍才买）
 buildThreshold: number; // 建造时现金/建造费的最低比值
 attackCardPropensity: number; // 使用攻击卡的倾向系数（0–1）
 targetLeader: boolean; // 是否优先攻击领先玩家
 considerPriceIndex: boolean; // 是否考虑物价指数趋势
}

// 三档默认配置
const aiConfigs: Record<string, AIConfig> = {
 easy: {
 difficulty: 'easy',
 purchaseThreshold: 0.5, // 50%概率购买
 buildThreshold: 0.5,
 attackCardPropensity: 0.1, // 几乎不主动使用攻击卡
 targetLeader: false,
 considerPriceIndex: false,
 },
 normal: {
 difficulty: 'normal',
 purchaseThreshold: 1.5, // 现金≥地价1.5倍才购买
 buildThreshold: 2.0,
 attackCardPropensity: 0.5,
 targetLeader: false,
 considerPriceIndex: false,
 },
 hard: {
 difficulty: 'hard',
 purchaseThreshold: 2.0,
 buildThreshold: 3.0,
 attackCardPropensity: 0.9, // 优先使用攻击卡
 targetLeader: true, // 优先攻击领先玩家
 considerPriceIndex: true, // 考虑物价指数趋势决策
 },
};
```

**Easy**：随机决策，购买概率约50%，不主动使用攻击卡。

**Normal**：基于评估函数——`score = cash / totalAssets`（现金占比）+ 路段完整度（已拥有/总格数）。优先购买高价值路段，物价指数低时多建设。

**Hard**：贪心策略——评估每张攻击卡对领先玩家的期望伤害，优先针对总资产最高的对手使用攻击卡；物价指数高时优先购地，低时优先建设；考虑贷款时机（贷款后立即购买高价值地产）。

**AI决策点**：
- 购买地产：`cash >= space.basePrice * priceIndex * purchaseThreshold`
- 建造建筑：`cash >= buildCost * priceIndex * buildThreshold`
- 使用攻击卡：随机数 < `attackCardPropensity`，目标为总资产最高玩家（Hard）
- 破产应对：优先出售建筑，其次抵押低价值地产

---

## 第九节：游戏配置与规则变体（Game Config）

### 9.1 GameConfig Interface

```typescript
interface GameConfig {
 // --- 基础参数 ---
 playerCount: number; // 2–4（大富翁4最多4人）
 startingCash: number; // 初始资金（大富翁4可设定 10000–300000）
 mapId: string; // 地图ID，如 "richman4-taiwan"

 // --- 胜利条件 ---
 victoryCondition: 'LAST_STANDING' | 'TARGET_ASSETS' | 'MAX_TURNS';
 targetAssets: number; // victoryCondition=TARGET_ASSETS 时有效
 maxTurns: number; // victoryCondition=MAX_TURNS 时有效

 // --- 骰子与移动 ---
 diceMode: 'dice' | 'movement_card'; // 骰子制/移动牌制 [4]
 allowDoubleRoll: boolean; // 骰子相同是否额外回合（大富翁4默认false）

 // --- 经济系统 ---
 priceIndexEnabled: boolean; // 是否启用物价指数（默认true）
 priceIndexMode: 'asset_based' | 'auto_increment'; // 大富翁4=asset_based
 bankEnabled: boolean; // 是否启用银行系统
 stockEnabled: boolean; // 是否启用股票系统（大富翁10=false）
 initialDeposit: number; // 银行初始存款（通常0）

 // --- 卡片/道具 ---
 cardHandLimit: number; // 手牌上限，默认15 [1]
 pointSystem: 'points' | 'cash'; // 大富翁4=points，大富翁10=cash [5]

 // --- 破产规则 ---
 bankruptcyMode: 'ELIMINATE' | 'DEBT'; // 淘汰/负债继续

 // --- 游戏模式 ---
 gameMode: GameMode;
 variant: 'classic' | 'hot_fight'; // 经典模式/热斗模式

 // --- 渲染（逻辑层忽略，渲染层读取）---
 renderMode: '2D' | '3D';
}
```

### 9.2 大富翁4默认配置

```json
{
 "playerCount": 4,
 "startingCash": 10000,
 "mapId": "richman4-taiwan",
 "victoryCondition": "LAST_STANDING",
 "targetAssets": 0,
 "maxTurns": 0,
 "diceMode": "dice",
 "allowDoubleRoll": false,
 "priceIndexEnabled": true,
 "priceIndexMode": "asset_based",
 "bankEnabled": true,
 "stockEnabled": true,
 "initialDeposit": 0,
 "cardHandLimit": 15,
 "pointSystem": "points",
 "bankruptcyMode": "ELIMINATE",
 "gameMode": "HOT_SEAT",
 "variant": "classic",
 "renderMode": "2D"
}
```

### 9.3 大富翁10联网模式配置差异

```json
{
 "stockEnabled": false,
 "pointSystem": "cash",
 "priceIndexMode": "auto_increment",
 "gameMode": "ONLINE",
 "variant": "hot_fight"
}
```

---

## 第十节：数据文件组织结构与接口规范

### 10.1 推荐目录结构

```
/data
 /maps
 richman4-taiwan.json # 台湾地图格子数据
 richman4-taiwan-groups.json # 路段分组数据
 richman4-japan.json # 日本地图
 richman4-usa.json # 美国地图
 richman4-china.json # 中国大陆地图
 /cards
 richman4-cards.json # 卡片定义表（30种）
 /items
 richman4-items.json # 道具定义表（13种）
 richman10-items.json # 大富翁10扩展道具
 /characters
 richman4-characters.json # 角色数据（12名）
 /gods
 richman4-gods.json # 神明定义表（13种）
 /companies
 richman4-companies.json # 公司定义表（7类）
 /events
 news-events.json # 新闻事件池
 magic-house-events.json # 魔法屋效果池
 fate-events.json # 命运点事件池
 /config
 default-config.json # 大富翁4默认配置
 richman10-config.json # 大富翁10配置差异
 /minigames
 minigame-definitions.json # 小游戏定义
```

### 10.2 数据加载与验证接口

```typescript
interface GameDataLoader {
 loadMap(mapId: string): Promise<BoardDefinition>;
 loadCards(version: string): Promise<CardDefinition[]>;
 loadItems(version: string): Promise<ItemDefinition[]>;
 loadCharacters(version: string): Promise<Character[]>;
 loadGods(version: string): Promise<GodDefinition[]>;
 loadEvents(type: 'news' | 'magic_house' | 'fate'): Promise<NewsEvent[]>;
 loadConfig(preset: string): Promise<GameConfig>;
}

// 数据校验规则
interface ValidationRules {
 // 1. 地图连通性：neighborIds 必须构成连通图（所有格子可达）
 // 2. 格子引用完整性：neighborIds 中的每个 ID 必须存在于格子列表
 // 3. 路段完整性：groupId 引用的分组必须在 groups 中存在
 // 4. 卡片参数匹配：effectParams 的 key 必须与 effectType 的参数规范匹配
 // 5. 角色ID唯一性：characters 中 id 不重复
 // 6. 建筑等级连续：buildingLevels 的 level 字段必须从 0 连续递增到 5
}
```

### 10.3 状态序列化与存档

`GameState` 必须完全 JSON 可序列化，不含函数或类实例 [3]。

```typescript
interface SaveGame {
 version: string; // 存档格式版本，如 "1.0"
 timestamp: number; // Unix 时间戳（毫秒）
 gameState: GameState; // 完整游戏状态快照
 config: GameConfig; // 本局配置
}

// 断线重连：服务端保存最新 GameState 快照
// 重连时客户端请求完整 GameState，从当前状态继续
// 不需要重放历史操作——完整快照即为充分状态 [3]
```

---

## 第十一节：版本差异与扩展机制

### 11.1 版本机制对比表

| 机制维度 | 大富翁4 | 大富翁8 | 大富翁10 | 大富翁11 |
|----------|---------|---------|---------|---------|
| 地图数量 | 4张（+资料片4张）[7] | 有扩展 | 多张含热斗地图 | 12张（8传统+4热斗）[6] |
| 卡片种类 | 30种 [1] | 有调整 | 有调整，用金钱购买 [5] | 34种含合成机制 |
| 道具种类 | 13种 [11] | 有扩展 | 有扩展 | 有扩展 |
| 角色数量 | 12名 [9] | 有扩展 | 有扩展 | 16名含天赋技能 |
| 物价指数 | 资产总和公式 [1] | 同大富翁4 | 固定回合自动上升 | 同大富翁10 |
| 银行系统 | 有（10%月息，3月无息贷款）[9] | 有 | 有调整 | 有 |
| 股票系统 | 有（即时交易，月中分红）[7] | 有 | 无 [5] | 无 |
| 神明系统 | 13种神明 [1] | 有 | 有调整 | 有 |
| 故事模式 | 无 | 无 | 有 [5] | 有 |
| 热斗模式 | 无 | 无 | 引入 [6] | 有（4张热斗地图）|
| 联机支持 | 无 | 有 | 有 [5] | 有 |
| 角色天赋 | 无（AI性格差异）| 无 | 有初步天赋 | 完整双天赋系统 |

### 11.2 热斗模式扩展

热斗模式始于大富翁10 [6]，地图中小地产格替换为攻击型卡片格（地雷、飞弹、炸药等）。金钱即生命值，攻击型卡片直接造成金钱伤害。

```typescript
// ATTACK_SPACE 格子扩展字段
interface AttackSpace extends BoardSpace {
 type: SpaceType.ATTACK_SPACE;
 weaponType: 'MINE' | 'MISSILE' | 'EXPLOSIVE' | 'NUKE';
 damage: number; // 基础伤害（× priceIndex）
 damageRange: number; // 伤害范围（格数）
}

// config.variant = 'hot_fight' 时：
// 1. 部分 PROPERTY 格替换为 ATTACK_SPACE 格
// 2. HOSPITAL 格移除（热斗模式无医院）
// 3. player.cash 降至0即破产（金钱=生命值）
```

### 11.3 富甲天下城市占领机制（扩展变体参考）

富甲天下系列引入城市占领机制 [14]：城市提供税收和士兵，可向对手收取过路费。过路费受人口、发展金、州属关系三因子影响，战争结果（胜/败/平）对过路费有倍率修饰（双倍/一半/免缴）。

```typescript
// 通过 config.variant = 'richman_spinoff' 启用
interface CitySpace extends BoardSpace {
 type: 'CITY';
 population: number;
 ownerId: string | null;
 cityLevel: 1 | 2 | 3 | 4 | 5 | 6; // 村镇→首邑 [14]
 facilities: string[]; // 设施ID列表（粮仓/市集/兵营等）
 maxFacilities: number; // 随城市等级变化（1–36座）[14]
}
```

### 11.4 通过 `GameConfig.variant` 切换变体

```typescript
// 引擎加载逻辑伪代码
function loadVariantRules(config: GameConfig): VariantRules {
 switch (config.variant) {
 case 'classic': return classicRules;
 case 'hot_fight': return hotFightRules; // 替换格子类型+修改胜利条件
 case 'richman_spinoff': return spinoffRules; // 城市占领机制
 default: return classicRules;
 }
}
// 一套引擎，多套内容：仅数据文件和 variant 字段不同
```

---

## 更多探索

**物价指数的平衡性含义**：资产总和公式（大富翁4）使领先玩家面临更高的地价和租金压力，形成自动追赶机制。玩家数量越多，初期物价指数变化越平缓（分母更大）；破产玩家减少时，分母缩小会加速物价指数上升，进一步压缩剩余玩家的现金空间。调优时可通过调整公式中的权重系数来控制这一追赶强度。

**卡片系统完整效果实现参考**：大富翁4 Wiki（richman.fandom.com/zh）提供了30张卡片的完整效果与点数费用列表 [11]，可作为本文档卡片表格的数值校验来源，建议开发者在实现前逐一比对官方说明书 PDF（Steam 版大富翁4附带）[1]。

**boardgame.io 框架集成**：本文档的 `GameState` 设计与 boardgame.io 的 `G` 对象高度兼容 [2][3]。`TurnPhase` 状态机可直接映射到 boardgame.io 的 Phases/Stages 系统——每个 `TurnPhase` 对应一个 Phase，每个 Phase 内仅开放对应的合法 Moves，框架自动处理玩家轮换和状态广播，实现开箱即用的多人联网支持 [2][3]。

## 参考文献

[1] 大富翁4說明書.pdf. https://cdn.akamai.steamstatic.com/steam/apps/2059810/manuals/%E5%A4%A7%E5%AF%8C%E7%BF%814%E8%AA%AA%E6%98%8E%E6%9B%B8.pdf?t=1658992525
[2] boardgame.io documentation. https://boardgame.io/documentation/
[3] Concepts - Boardgame.io. https://boardgame.io/documentation/#/concepts
[4] 大人小孩都喜歡！歷代大富翁演進史 - 大宇SOFTSTAR. http://km.softstar.com.tw/topic.aspx?tid=184
[5] 在Steam 上购买大富翁10 (RichMan 10) 立省40%. https://store.steampowered.com/app/1162520/10_RichMan_10/?l=schinese
[6] 大富翁11 官方網站. https://rmxi.softstargames.com.tw/
[7] 大富翁4 | 大宇大富翁wiki. https://richman.fandom.com/zh/wiki/%E5%A4%A7%E5%AF%8C%E7%BF%814?variant=zh-tw
[8] 大富翁4 Fun 歡樂聖誕版 - 大宇SOFTSTAR. http://km.softstar.com.tw/topic.aspx?tid=456
[9] 《大富翁4》游戏图文攻略全人物属性介绍各种隐藏细节技巧玩法秘籍. https://www.bilibili.com/read/cv28566011
[10] 大富翁4 | 大宇大富翁wiki. https://richman.fandom.com/zh/wiki/%E5%A4%A7%E5%AF%8C%E7%BF%814
[11] 大富翁 4/卡片一覽 - Wiki Index. https://richman.fandom.com/zh/wiki/%E5%A4%A7%E5%AF%8C%E7%BF%814/%E5%8D%A1%E7%89%87%E4%B8%80%E8%A6%BD
[12] 42749 Rules Monopoly - Hasbro. https://www.hasbro.com/common/instruct/Monopoly_Vintage.pdf
[13] 富甲天下4遊戲手冊. https://shared.steamstatic.com/store_item_assets/steam/apps/2400280/manuals/%E5%AF%8C%E7%94%B2%E5%A4%A9%E4%B8%8B4%E9%81%8A%E6%88%B2%E6%89%8B%E5%86%8A.pdf?t=1738905415
[14] 富甲天下5遊戲手冊. https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2490910/manuals/%E5%AF%8C%E7%94%B2%E5%A4%A9%E4%B8%8B5%E9%81%8A%E6%88%B2%E6%89%8B%E5%86%8A.pdf?t=1691659686
