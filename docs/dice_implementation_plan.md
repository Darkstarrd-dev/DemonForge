# 骰子模块详细实施计划

**创建**：2026-06-29 | **状态**：待实施

---

## 1. 全局概览

**一句话目标**：自建一套零新依赖、可复用的骰子核心模块（`game/dice/`，纯 TS，Web Crypto 随机数，支持 d6/d8/d10/d12/d20 五种 + 预设落点），并在 demo-2d（Phaser Sprite 帧动画 + Matter 刚体双模式）和 demo-3d（Three.js + Rapier 物理骰子）各新增一个可调参数的骰子演示场景。

**技术栈与版本**（全部为项目现有，零新增依赖）：
- React 19.2.6 + antd 6.4.3 + Vite 8.0.12
- Phaser 4.1.0（2D 引擎 + Matter 物理）
- three 0.184.0 + @dimforge/rapier3d-compat 0.19.3（3D 引擎 + WASM 物理）
- vitest 4.1.9（测试）、typescript ~6.0.2、eslint 10.3.0 + typescript-eslint 8.59.2
- 随机数：浏览器原生 Web Crypto API（`crypto.getRandomValues`）

**受影响的模块/文件/服务清单**：

| 类别 | 路径 | 动作 |
|---|---|---|
| 新增核心 | `frontend/src/game/dice/types.ts` | 新建 |
| 新增核心 | `frontend/src/game/dice/DiceRoller.ts` | 新建 |
| 新增核心 | `frontend/src/game/dice/geometry.ts` | 新建 |
| 新增核心 | `frontend/src/game/dice/faceDetection.ts` | 新建 |
| 新增核心 | `frontend/src/game/dice/presets.ts` | 新建 |
| 新增核心 | `frontend/src/game/dice/index.ts` | 新建（导出门面） |
| 新增测试 | `frontend/src/game/dice/__tests__/*.test.ts` | 新建 4 个 |
| 新增资源 | `frontend/public/dice-assets/yahtzee/dice.png` + `dice.json` | 新建（下载） |
| 修改 | `frontend/src/pages/demo-2d/index.tsx` | 改造下拉菜单+集成 |
| 新增 | `frontend/src/pages/demo-2d/DiceSpriteScene.ts` | 新建 |
| 新增 | `frontend/src/pages/demo-2d/DiceMatterScene.ts` | 新建 |
| 新增 | `frontend/src/pages/demo-2d/Dice2DPanel.tsx` | 新建 |
| 修改 | `frontend/src/pages/demo-3d/index.tsx` | 改造下拉菜单+集成 |
| 新增 | `frontend/src/pages/demo-3d/Dice3DEngine.ts` | 新建 |
| 新增 | `frontend/src/pages/demo-3d/Dice3DPanel.tsx` | 新建 |

**绝不改动的区域**：
- `package.json` 的 dependencies（零新增依赖）
- `server/`（后端不动，随机数纯前端）
- `electron/`（Electron 主进程/preload 不动，不走 IPC）
- `game/monopoly/`（现有大富翁模块不动，仅作为未来复用方）
- `eslint.config.js` / `tsconfig*.json` / `vite.config.ts`
- 现有 demo 的 `rigid`/`character` 场景逻辑（仅在其外层增加下拉分支，不删改原有代码）

---

## 2. 三层边界规则

| 类别 | 操作 | 说明 |
|---|---|---|
| ✅ Always | 新建 `game/dice/` 下文件 | 公共模块目录，按 monopoly 同款分层 |
| ✅ Always | 新建 `public/dice-assets/` 并放入 yahtzee 资源 | Vite 静态目录约定，无需配置 |
| ✅ Always | 新建 demo 页面子文件（Scene/Panel） | demo 目录内扩展 |
| ✅ Always | 修改 `demo-2d/index.tsx` / `demo-3d/index.tsx` 的下拉菜单 options 与场景分支 | 仅新增枚举值与条件分支，不删原有 |
| ✅ Always | 运行 `npm run lint` / `npm run build` / `npm test` 验证 | 标准验证命令 |
| ⚠️ Ask first | 从 GitHub 下载 yahtzee `dice.png`/`dice.json` | 涉及外网下载，若网络受限需告知用户手动放置 |
| ⚠️ Ask first | 修改 `AppLayout.tsx` 菜单标签 | 计划不动导航菜单（demo-2d/demo-3d 路由不变），若需改标签须确认 |
| ❌ Never | 安装任何 npm 包（`npm install`） | 决策已确认零新依赖 |
| ❌ Never | 改 `package.json` dependencies | 同上 |
| ❌ Never | 改 `server/` 或 `electron/` | 随机数纯前端 Web Crypto |
| ❌ Never | 删除或重写现有 `rigid`/`character` 场景代码 | 仅在外层加分支 |
| ❌ Never | 在 `game/dice/` 核心 TS 文件中 import React/antd/Phaser/Three | 核心层零渲染依赖（与 monopoly/types.ts 同约束） |
| ❌ Never | 在渲染层 import `crypto`（Node 模块） | 用浏览器 `window.crypto.getRandomValues` |
| ❌ Never | 执行 git commit/push | 用户手动执行 git |

---

## 3. 任务分解与执行步骤

### 步骤 1：创建 dice 模块目录与 types.ts

| 步骤序号 | 1 |
|---|---|
| 步骤名称 | 创建 dice 模块目录与类型定义 |
| 需要的输入 | 无 |
| 具体操作说明 | ① 新建目录 `frontend/src/game/dice/` 及 `frontend/src/game/dice/__tests__/`。② 新建文件 `frontend/src/game/dice/types.ts`，内容包含以下类型定义（用 `const X = {} as const` + `type X` 模式，与 `monopoly/types.ts` 一致）：<br>- `DiceSides` 常量：`{ D6: 6, D8: 8, D10: 10, D12: 12, D20: 20 } as const`，导出 `type DiceSides = (typeof DiceSides)[keyof typeof DiceSides]` 以及 `type DiceSideValue = 6\|8\|10\|12\|20`<br>- `interface DiceRollConfig { count: number; sides: DiceSideValue; presetValues?: number[]; }`（count≥1，presetValues 长度须等于 count，每项 1..sides）<br>- `interface DiceRollResult { notation: string; sides: number; values: number[]; total: number; timestamp: number; preset: boolean; }`<br>- `interface DiceThemeColors { face: string; pip: string; edge: string; }`（骰子面底色/点数色/边色）<br>- `interface DicePhysicsParams { friction: number; restitution: number; gravity: number; throwForce: number; spinForce: number; }`（3D 物理参数，含默认值常量 `DEFAULT_PHYSICS`）<br>- `interface DiceAnimParams { duration: number; }`（2D 帧动画时长 ms）<br>- `type Dice2DMode = 'sprite' \| 'matter'`<br>- `type DiceSpriteSource = 'yahtzee' \| 'custom'`<br>- `interface DiceSpriteConfig { source: DiceSpriteSource; atlasKey: string; atlasPath: string; framePrefix: string; frameCount: number; }`<br>- `interface RollHistoryEntry extends DiceRollResult {}` |
| 预期输出 | `types.ts` 文件存在，导出上述全部类型 |
| 验收标准 | ① `Test-Path frontend/src/game/dice/types.ts` 为 true；② `npx tsc --noEmit -p frontend/tsconfig.app.json` 无新增错误（可单独编译该文件）；③ 文件中无 `import React`/`import Phaser`/`import three` |
| 依赖的前序步骤 | 无 |

### 步骤 2：实现 DiceRoller.ts 核心类

| 步骤序号 | 2 |
|---|---|
| 步骤名称 | 实现纯 TS 骰子核心类 DiceRoller |
| 需要的输入 | 步骤 1 的 types.ts |
| 具体操作说明 | 新建 `frontend/src/game/dice/DiceRoller.ts`，实现一个纯 TS 类（零渲染依赖，不 import React/Phaser/Three）：<br><br>**类 `DiceRoller`**：<br>- `constructor()`：初始化空历史 `RollHistoryEntry[]`<br>- `private validate(config: DiceRollConfig): void`：校验 count≥1；sides ∈ {6,8,10,12,20}；若 presetValues 存在则长度须等于 count 且每项 ∈ [1,sides]，否则 throw Error（信息含非法值）<br>- `private randomInt(min: number, max: number): number`：用 `window.crypto.getRandomValues(new Uint32Array(1))[0]` 取 32 位无符号整数，再映射到 [min,max] 闭区间（用 `min + (val % (max-min+1))`，因 32 位范围远大于骰子面数，模偏倚可忽略）<br>- `roll(config: DiceRollConfig): DiceRollResult`：① 调 validate；② 若 presetValues 存在则 values=presetValues.slice()，否则 values = Array.from({length:count}, ()=>randomInt(1,sides))；③ total = values.reduce((a,b)=>a+b,0)；④ notation = `${count}d${sides}`；⑤ timestamp = Date.now()；⑥ preset = !!config.presetValues；⑦ push 到 history；⑧ 返回结果对象<br>- `rollMany(count: number, sides: DiceSideValue, presetValues?: number[]): DiceRollResult`：roll 的便捷包装<br>- `parseNotation(notation: string): { count: number; sides: number }`：正则 `/^(\d+)d(\d+)$/` 解析，失败 throw Error<br>- `getHistory(): RollHistoryEntry[]`：返回历史副本<br>- `clearHistory(): void`<br>- `formatNotation(count: number, sides: number, values?: number[]): string`：返回 `${count}d${sides}` 或 `${count}d${sides}@${values.join(',')}`<br><br>顶部加注释说明：与 `monopoly/engine.ts` 的 `rollDice` 设计一致——随机源独立于渲染/规则，结果通过参数传入，保持调用方纯函数性。 |
| 预期输出 | `DiceRoller.ts` 文件，导出 `DiceRoller` 类 |
| 验收标准 | ① 文件存在且 `export class DiceRoller`；② 文件中无 React/Phaser/Three import；③ `npx tsc --noEmit -p frontend/tsconfig.app.json` 无错误 |
| 依赖的前序步骤 | 1 |

### 步骤 3：实现 geometry.ts（3D 五种正多面体几何 + 面贴图）

| 步骤序号 | 3 |
|---|---|
| 步骤名称 | 实现 3D 骰子几何体与面贴图生成器 |
| 需要的输入 | Three.js 0.184.0（已装） |
| 具体操作说明 | 新建 `frontend/src/game/dice/geometry.ts`，import `* as THREE from 'three'`。实现以下函数：<br><br>**面定义表**（核心数据，供 faceDetection 与 presets 共用）：<br>- 导出 `interface DiceFaceDef { normal: THREE.Vector3; faceValue: number; }`（normal 为该面在"标准朝向"下的局部法向量，faceValue 为该面对应的点数）<br>- 导出 `const DICE_FACE_DEFS: Record<number, DiceFaceDef[]>`，为 6/8/10/12/20 各定义面表。约定**对面之和 = sides+1**（标准骰子约定）。各多面体法向量来源：<br>&nbsp;&nbsp;- **d6**：6 面，法向量 ±X/±Y/±Z 单位向量，faceValue 按 ±Y=1/6、±Z=2/5、±X=3/4 配对<br>&nbsp;&nbsp;- **d8**：8 面，正八面体顶点法向量 (±1,±1,±1) 归一化，8 种符号组合，配对面之和=9<br>&nbsp;&nbsp;- **d10**：10 面，五角双锥（pentagonal trapezohedron），上下各 5 个面，法向量绕 Y 轴每 72° 一面，倾斜角约 26.57°（arctan(1/2)），配对面之和=11<br>&nbsp;&nbsp;- **d12**：12 面，正十二面体，法向量取自 12 个五边形面心（可用顶点 (±1,±1,±1) 与 (0,±1/φ,±φ) 与 (±1/φ,±φ,0) 与 (±φ,0,±1/φ) 的组合，φ=黄金比），配对面之和=13<br>&nbsp;&nbsp;- **d20**：20 面，正二十面体，法向量取自 20 个三角形面心（顶点为 (0,±1,±φ) 与 (±1,±φ,0) 与 (±φ,0,±1) 的组合），配对面之和=21<br>- 注释中标注每种几何体的面法向量数值来源（数学标准坐标），后续 faceDetection 与 presets 直接读此表<br><br>**几何体工厂**：<br>- `createDiceGeometry(sides: number, size: number): THREE.BufferGeometry`：用 Three.js 内置几何体——d6→`BoxGeometry(size,size,size)`；d8→`OctahedronGeometry(size)`；d4 不需要（不在范围）；d12→`DodecahedronGeometry(size)`；d20→`IcosahedronGeometry(size)`；d10→手动构造 BufferGeometry（五角双锥，10 个顶点 + 10 个三角面），或用 `OctahedronGeometry` 不可行，必须手写。**若 d10 手写复杂度超出预期，停止并上报**（见异常处理）。<br><br>**面贴图生成器**：<br>- `createDiceFaceTextures(sides: number, theme: DiceThemeColors): Map<number, THREE.CanvasTexture>`：为每个面值 1..sides 创建一个离屏 `<canvas>`（128×128），用 Canvas 2D 绘制：填充 `theme.face` 底色 + `theme.edge` 边框 + 居中绘制点数数字（`theme.pip` 色，fontSize 64，字体 Arial bold）。d6 可选绘制圆点 pip 而非数字（加参数 `usePips: boolean`，默认 false 用数字）。对每个 canvas 调 `new THREE.CanvasTexture(canvas)`，设 `texture.needsUpdate=true`，存入 Map（key=faceValue）。返回 Map。<br>- `applyFaceTextures(geometry: THREE.BufferGeometry, sides: number, textures: Map<number, THREE.CanvasTexture>, faceDefs: DiceFaceDef[]): THREE.Material[]`：为每个面创建独立 `MeshStandardMaterial({ map: textures.get(faceValue) })`，返回材质数组。geometry 的 groups（`addGroup`）需按面切分以支持多材质——对 BoxGeometry 已内置 6 groups；对 Octahedron/Dodeca/Icosa 需手动 `geometry.clearGroups()` 后按三角形索引 `addGroup(startIndex*3, 3, groupIndex)` 切分。 |
| 预期输出 | `geometry.ts` 文件 |
| 验收标准 | ① 文件存在；② `npx tsc --noEmit -p frontend/tsconfig.app.json` 无错误；③ `DICE_FACE_DEFS[6].length===6`、`[20].length===20` 等（测试覆盖） |
| 依赖的前序步骤 | 1 |

### 步骤 4：实现 faceDetection.ts（朝向判定）

| 步骤序号 | 4 |
|---|---|
| 步骤名称 | 实现 3D 骰子静止后朝上面判定 |
| 需要的输入 | 步骤 3 的 `DICE_FACE_DEFS` |
| 具体操作说明 | 新建 `frontend/src/game/dice/faceDetection.ts`，import `* as THREE from 'three'`，import `DICE_FACE_DEFS, DiceFaceDef` from `./geometry`。<br><br>实现函数：<br>- `getUpFace(quaternion: THREE.Quaternion, sides: number): number`：① 取 `faceDefs = DICE_FACE_DEFS[sides]`；② 世界 up 向量 `worldUp = new THREE.Vector3(0,1,0)`；③ 遍历 faceDefs，对每个 `normal` 用 `normal.clone().applyQuaternion(quaternion)` 变换到世界坐标；④ 计算与 worldUp 的点积 `dot`；⑤ 取 dot 最大者的 `faceValue` 返回；⑥ 若最大 dot < 0.5（骰子未水平停稳）仍返回最大者（物理层保证接近停稳）。<br>- `getUpFaces(quaternions: THREE.Quaternion[], sides: number): number[]`：批量调用，返回每颗骰子的朝上值。<br><br>注释说明：此函数纯数学，不依赖物理引擎，可在测试中直接构造四元数验证。 |
| 预期输出 | `faceDetection.ts` 文件 |
| 验收标准 | ① 文件存在；② `npx tsc --noEmit` 无错误；③ 单元测试：构造 d6 单位四元数（无旋转），`getUpFace(identity, 6)===1`（因 ±Y 面 faceValue=1 为朝上） |
| 依赖的前序步骤 | 3 |

### 步骤 5：实现 presets.ts（预设朝向四元数）

| 步骤序号 | 5 |
|---|---|
| 步骤名称 | 实现预设落点的目标四元数计算 |
| 需要的输入 | 步骤 3 的 `DICE_FACE_DEFS` |
| 具体操作说明 | 新建 `frontend/src/game/dice/presets.ts`，import `* as THREE from 'three'`，import `DICE_FACE_DEFS` from `./geometry`。<br><br>核心思路：要让某面（faceValue）朝上，需计算一个四元数，使该面的局部法向量旋转到世界 up (0,1,0)。<br><br>实现：<br>- `getTargetQuaternion(sides: number, targetFaceValue: number): THREE.Quaternion`：① 取 `faceDef = DICE_FACE_DEFS[sides].find(f => f.faceValue === targetFaceValue)`，不存在则 throw；② `q = new THREE.Quaternion().setFromUnitVectors(faceDef.normal.clone().normalize(), new THREE.Vector3(0,1,0))`；③ 返回 q。<br>- `getTargetQuaternions(sides: number, targetValues: number[]): THREE.Quaternion[]`：批量调用。<br>- `correctDiceOrientation(mesh: THREE.Mesh, targetQuaternion: THREE.Quaternion, durationMs: number, onComplete: ()=>void): void`：用 `THREE.Quaternion.slerp` 在 durationMs 内平滑插值（手动 tween，每帧 `q.slerp(target, t)`，t=elapsed/duration），完成后 mesh.quaternion=targetQuaternion 并调 onComplete。**此函数用于物理仿真停止后校准朝向**（预设落点的实现策略）。<br><br>注释说明：物理仿真无法精确保证落点，采用"物理滚动→静止后检测→不符则 slerp 校准"双阶段策略。 |
| 预期输出 | `presets.ts` 文件 |
| 验收标准 | ① 文件存在；② `npx tsc --noEmit` 无错误；③ 单元测试：`getTargetQuaternion(6, 1)` 对应单位四元数附近；`getTargetQuaternion(6, 6)` 对应 180° 翻转 |
| 依赖的前序步骤 | 3 |

### 步骤 6：实现 index.ts 导出门面

| 步骤序号 | 6 |
|---|---|
| 步骤名称 | 创建 dice 模块导出门面 |
| 需要的输入 | 步骤 1-5 |
| 具操作说明 | 新建 `frontend/src/game/dice/index.ts`，re-export 所有公开符号：`export * from './types'`、`export * from './DiceRoller'`、`export * from './geometry'`、`export * from './faceDetection'`、`export * from './presets'`。 |
| 预期输出 | `index.ts` 文件 |
| 验收标准 | ① 文件存在；② 从 `game/dice` 可 import 所有类型与类 |
| 依赖的前序步骤 | 5 |

### 步骤 7：编写核心单元测试

| 步骤序号 | 7 |
|---|---|
| 步骤名称 | 编写 dice 核心模块单元测试 |
| 需要的输入 | 步骤 1-6 |
| 具体操作说明 | 在 `frontend/src/game/dice/__tests__/` 下新建 4 个测试文件，风格对齐 `monopoly/__tests__/turn.test.ts`（`import { describe, it, expect } from 'vitest'`）：<br><br>**`DiceRoller.test.ts`**：<br>- describe 'DiceRoller.validate'：count<1 抛错；sides=7 抛错；presetValues 长度不符抛错；presetValues 超范围抛错；合法配置不抛<br>- describe 'DiceRoller.roll'：roll({count:2,sides:6}) 返回 values.length===2，每项 1-6，total 正确，preset===false，history 增长；roll({count:1,sides:20,presetValues:[17]}) 返回 values===[17]，preset===true<br>- describe 'DiceRoller.parseNotation'：'2d6'→{2,6}；'1d20'→{1,20}；'abc' 抛错<br>- describe 'DiceRoller.history'：getHistory 返回副本（修改不影响内部）；clearHistory 后为空<br>- **注意**：测试环境 jsdom 可能无 `window.crypto`，需在文件顶部 `if (!globalThis.crypto) { globalThis.crypto = { getRandomValues: (arr) => { for (let i=0;i<arr.length;i++) arr[i] = Math.floor(Math.random()*256); return arr } } as any }` mock（仅测试用）<br><br>**`geometry.test.ts`**：<br>- it 'DICE_FACE_DEFS 面数正确'：6→6, 8→8, 10→10, 12→12, 20→20<br>- it 'd6 对面之和=7'：遍历 d6 faceDefs，对面（normal 相反方向）faceValue 之和===7（用 normal.negate() 查找对面）<br>- it 'd20 对面之和=21'：同上逻辑<br>- it 'createDiceFaceTextures 返回正确数量'：createDiceFaceTextures(6, {...}) 返回 Map size===6<br><br>**`faceDetection.test.ts`**：<br>- it 'identity 四元数 d6 朝上=1'：getUpFace(new THREE.Quaternion(), 6)===1<br>- it '翻转 180° d6 朝上=6'：getUpFace(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI), 6)===6<br>- import `* as THREE from 'three'`<br><br>**`presets.test.ts`**：<br>- it 'getTargetQuaternion(6,1) 使 face1 朝上'：用 getTargetQuaternion(6,1) 旋转后，getUpFace 结果===1<br>- it 'getTargetQuaternion(20,17) 使 17 朝上'：同上验证 getUpFace===17<br>- import `* as THREE from 'three'` |
| 预期输出 | 4 个测试文件 |
| 验收标准 | ① `npm test` 全部通过（在 `frontend/` 目录运行）；② 测试数量 ≥ 15 个 |
| 依赖的前序步骤 | 6 |

### 步骤 8：下载 yahtzee 资源到 public 目录

| 步骤序号 | 8 |
|---|---|
| 步骤名称 | 下载 Phaser 官方 yahtzee 骰子 Sprite 资源 |
| 需要的输入 | 网络访问（文档已给 URL） |
| 具体操作说明 | ① 新建目录 `frontend/public/dice-assets/yahtzee/`；② 下载 `dice.png`（图片）与 `dice.json`（atlas 配置）。URL 见文档 [15]：`https://github.com/photonstorm/phaser-examples/blob/master/examples/assets/games/yahtzee/dice.png` 和 `dice.json`。**注意 GitHub blob URL 需改为 raw URL**：`https://raw.githubusercontent.com/photonstorm/phaser-examples/master/examples/assets/games/yahtzee/dice.png`（及 dice.json）；③ 放入 `frontend/public/dice-assets/yahtzee/`；④ 用 `read` 工具检查 `dice.json` 的帧名格式（确认是否为 `dieWhite1`-`dieWhite6` / `dieRed1`-`dieRed6`）。若 URL 不可达或文件不存在，**停止并上报**（见异常处理），让用户手动放置。 |
| 预期输出 | `frontend/public/dice-assets/yahtzee/dice.png` + `dice.json` |
| 验收标准 | ① 两个文件存在；② dice.json 是合法 JSON（可 `read` 解析）；③ 帧名含 `dieWhite1`..`dieWhite6` |
| 依赖的前序步骤 | 无（可与 1-7 并行） |

### 步骤 9：改造 demo-2d 页面（下拉菜单 + 双骰子模式）

| 步骤序号 | 9 |
|---|---|
| 步骤名称 | 改造 demo-2d 增加骰子演示场景 |
| 需要的输入 | 步骤 6（dice 核心）、步骤 8（yahtzee 资源）、现有 `demo-2d/index.tsx` |
| 具体操作说明 | <br>**9a. 修改 `frontend/src/pages/demo-2d/index.tsx`**：<br>- 将 `type DemoType` 从 `'rigid' \| 'character'` 扩展为 `'rigid' \| 'character' \| 'dice-sprite' \| 'dice-matter'`<br>- 在下拉 Select 的 options 增加 `{ value: 'dice-sprite', label: '骰子演示·Sprite帧动画' }` 和 `{ value: 'dice-matter', label: '骰子演示·Matter刚体' }`<br>- 在 useEffect 中增加条件分支：`demoType === 'dice-sprite'` 时创建 DiceSpriteScene 的 Phaser 游戏；`demoType === 'dice-matter'` 时创建 DiceMatterScene 的 Phaser 游戏（沿用现有 createGame/destroyGame 模式）<br>- 引入 `Dice2DPanel` 组件，在 `demoType` 为 dice-sprite/dice-matter 时渲染（替换原有斥力 Slider 区）<br>- 参数传递沿用现有 `game.registry.set` 模式：将面板参数写入 registry，Scene 内读取<br><br>**9b. 新建 `frontend/src/pages/demo-2d/DiceSpriteScene.ts`**：<br>- `export default class DiceSpriteScene extends Phaser.Scene`，key='DiceSpriteScene'<br>- `preload()`：加载 yahtzee atlas——`this.load.atlas('dice-yahtzee', '/dice-assets/yahtzee/dice.png', '/dice-assets/yahtzee/dice.json')`（路径以 `/dice-assets/` 开头，Vite 会从 public 根解析）；从 registry 读 `spriteConfig`，若 source==='custom' 则 `this.load.atlas(config.atlasKey, config.atlasPath, config.atlasPath.replace('.png','.json'))`<br>- `create()`：从 registry 读参数（count, sides, theme, animDuration, presetValues）；创建 count 个 Sprite，用 `this.add.sprite(x, y, atlasKey, framePrefix+'1')`；注册"投掷"事件监听（通过 `this.game.events.on('roll', handler)` 或 registry flag）<br>- `rollDice(presetValues?: number[])`：对每个 sprite 执行帧动画——`this.scene.time.addEvent` 按 60ms 间隔切换随机帧，持续 animDuration ms 后停在 `framePrefix+targetValue` 帧（targetValue 来自 DiceRoller.roll({count,sides,presetValues}).values）；emit 'rollComplete' 事件带结果<br>- **注意**：yahtzee 资源仅 d6（6 帧）。当 sides≠6 时，若 source==='yahtzee' 则限制 sides=6 并提示；若 source==='custom' 则按 frameCount+framePrefix 从用户 atlas 取帧<br>- 帧名约定：yahtzee 为 `dieWhite{1-6}`；custom 由 spriteConfig.framePrefix+面值<br><br>**9c. 新建 `frontend/src/pages/demo-2d/DiceMatterScene.ts`**：<br>- `export default class DiceMatterScene extends Phaser.Scene`，key='DiceMatterScene'，用 Matter 物理<br>- `create()`：创建地面/墙壁（沿用现有 PhysicsScene 模式）；从 registry 读参数；创建 count 个方块 `this.matter.add.rectangle(x, -50, size, size, {...})` 并附 `this.add.text` 或 Graphics 绘制数字在面上<br>- `rollDice(presetValues?: number[])`：给每个骰子随机/预设初速度 + 角速度，物理掉落；静止后（velocity<阈值持续 500ms）调用 `setVelocity(0)` + `setAngularVelocity(0)` 冻结，并将数字标签设为预设值或随机值；**Matter 模式只能看一面，无翻滚感**（这是预期行为，UI 上标注）<br><br>**9d. 新建 `frontend/src/pages/demo-2d/Dice2DPanel.tsx`**：<br>- React 组件，props 接收 `gameRef: RefObject<Phaser.Game>` 和 `mode: Dice2DMode`<br>- 用 antd 组件构建控制面板（沿用现有面板样式 `position:absolute;top:16;right:16`）：<br>&nbsp;&nbsp;- `Select` 骰子数量（1-6）<br>&nbsp;&nbsp;- `Select` 骰子面数（6/8/10/12/20；sprite+yahtzee 模式下禁用非 6 并提示"yahtzee 资源仅支持 d6"）<br>&nbsp;&nbsp;- `Select` Sprite 资源源（yahtzee/custom；仅 sprite 模式显示；custom 时显示 `Input` 让用户填 atlas path）<br>&nbsp;&nbsp;- `Slider` 动画时长（200-2000ms，仅 sprite 模式）<br>&nbsp;&nbsp;- `Slider` 投掷力度（影响 Matter 初速度，仅 matter 模式）<br>&nbsp;&nbsp;- `ColorPicker`（antd 6 内置）骰子颜色 face/pip（生成 CanvasTexture 或 Sprite tint）<br>&nbsp;&nbsp;- `Switch` 预设结果开关 + `Input.TextArea` 手动输入预设值（逗号分隔，如 "3,5,1"）<br>&nbsp;&nbsp;- `Button` "投掷"——调用 `DiceRoller.roll`，再通过 `gameRef.current.events.emit('roll', result.values)` 触发场景动画<br>&nbsp;&nbsp;- `List` 结果显示与历史记录（最近 10 条，显示 notation + values + total）<br>&nbsp;&nbsp;- `Switch` 音效开关（预留，本期可只控制 console.log 或不加真实音频）<br>- 参数变更时同步到 `gameRef.current.registry.set(key, value)` |
| 预期输出 | 修改后的 index.tsx + 3 个新文件 |
| 验收标准 | ① `npm run dev` 启动后访问 `/demo-2d`，下拉菜单含 4 项；② 选"骰子·Sprite"显示投掷按钮与控制面板；③ 点投掷后骰子帧动画播放并停在结果；④ `npx tsc --noEmit` 无错误；⑤ `npm run lint` 无错误 |
| 依赖的前序步骤 | 6, 8 |

### 步骤 10：改造 demo-3d 页面（下拉菜单 + 3D 骰子场景）

| 步骤序号 | 10 |
|---|---|
| 步骤名称 | 改造 demo-3d 增加骰子演示场景 |
| 需要的输入 | 步骤 6（dice 核心）、现有 `demo-3d/index.tsx` |
| 具体操作说明 | <br>**10a. 修改 `frontend/src/pages/demo-3d/index.tsx`**：<br>- 引入 `useState` 新增 `sceneType: 'rigid' \| 'dice'`<br>- 将现有刚体逻辑抽离为内部函数 `startRigidEngine()`（保留原全部代码，仅包装）<br>- 新增 `startDiceEngine()` 调用 `Dice3DEngine`（新文件）<br>- 顶部增加 `Select` 下拉（沿用 demo-2d 面板样式）：'刚体碰撞演示' / '骰子演示'<br>- sceneType='rigid' 时调用 startRigidEngine；'dice' 时调用 startDiceEngine<br>- 切换时先 `engineRef.current?.stop()` 停止旧引擎，再启动新引擎（沿用现有 handleReset 模式）<br>- 引入 `Dice3DPanel`，sceneType='dice' 时渲染<br><br>**10b. 新建 `frontend/src/pages/demo-3d/Dice3DEngine.ts`**：<br>- 导出 `function createDice3DEngine(container: HTMLElement, params: Dice3DParams): { stop: ()=>void; roll: (presetValues?: number[])=>Promise<number[]> }`<br>- 内部实现（复用现有 demo-3d 的 Three.js+Rapier 模式）：<br>&nbsp;&nbsp;- `await ensureRapierReady()`（沿用现有单例模式，**注意：现有 startEngine 内联了 init，需将 ensureRapierReady 提取共享或在本文件内 import**——若现有 demo-3d/index.tsx 的 ensureRapierReady 未导出，在本文件内重新声明一份 `let initPromise` 单例，**但同一页面两个 initPromise 会冲突**，需改为从 demo-3d/index.tsx 导出 ensureRapierReady 共用。若需改 index.tsx 导出该函数，属 Always 范围）<br>&nbsp;&nbsp;- 创建 scene/camera/renderer/floor（沿用现有模式，地板尺寸适配骰子场景 20×20）<br>&nbsp;&nbsp;- `world = new RAPIER.World({x:0,y:params.physics.gravity,z:0})`<br>&nbsp;&nbsp;- `roll(presetValues?)`：① 调 `DiceRoller.roll({count:params.count, sides:params.sides, presetValues})` 得 values；② 对每颗骰子：createDiceGeometry + Rapier RigidBodyDesc.dynamic() + ColliderDesc.convexHull(vertices)（用几何体顶点构造凸包碰撞体）；③ 给随机/预设初速度+角速度（throwForce/spinForce）；④ 物理仿真在 animate 循环 world.step() + 同步 mesh；⑤ 检测全部骰子静止（linvel.norm()<0.1 且 angvel.norm()<0.1 持续 500ms）；⑥ 静止后对每颗调 `getUpFace(mesh.quaternion, sides)` 得实际值；⑦ 若 presetValues 且实际值不符，用 `correctDiceOrientation(mesh, getTargetQuaternion(sides, targetValue), 300, onComplete)` 平滑校准；⑧ 全部校准完成 emit 'rollComplete'；⑨ 返回最终 values<br>&nbsp;&nbsp;- `stop()`：沿用现有 stopInternal 模式（cancelAnimationFrame + dispose + world.free + 移除 domElement）<br>&nbsp;&nbsp;- Rapier collider 用 `ColliderDesc.convexHull(Float32Array)`：从 Three.js geometry 的 position attribute 取顶点数组传入<br>&nbsp;&nbsp;- 面贴图：调 `createDiceFaceTextures` + `applyFaceTextures`，mesh 用 `THREE.Mesh(geometry, materials[])`<br><br>**10c. 新建 `frontend/src/pages/demo-3d/Dice3DPanel.tsx`**：<br>- props 接收 engine 句柄（含 roll 方法）和参数 state<br>- antd 控制面板：<br>&nbsp;&nbsp;- `Select` 骰子数量（1-6）<br>&nbsp;&nbsp;- `Select` 骰子面数（6/8/10/12/20）<br>&nbsp;&nbsp;- `Slider` 投掷力度/初速（1-10）<br>&nbsp;&nbsp;- `Slider` 旋转力度（1-10）<br>&nbsp;&nbsp;- `Slider` 重力（-20 to -1，负值）<br>&nbsp;&nbsp;- `Slider` 摩擦（0-1）<br>&nbsp;&nbsp;- `Slider` 弹性（0-1）<br>&nbsp;&nbsp;- `ColorPicker` 骰子颜色（face/pip/edge 三色）<br>&nbsp;&nbsp;- `Switch` 预设结果开关 + `Input.TextArea` 手动输入（逗号分隔）<br>&nbsp;&nbsp;- `Button` "投掷"——调用 `engine.roll(presetValues)`，await 结果后显示<br>&nbsp;&nbsp;- `List` 结果与历史记录<br>&nbsp;&nbsp;- `Switch` 音效开关（预留）<br>- 参数变更时调用 engine 的 setter 或销毁重启引擎（物理参数变更需重启 world，UI 参数如颜色可热更新） |
| 预期输出 | 修改后的 index.tsx + 2 个新文件 |
| 验收标准 | ① `npm run dev` 启动后访问 `/demo-3d`，下拉菜单含 2 项；② 选"骰子演示"显示 3D 骰子 + 控制面板；③ 点投掷后骰子物理滚动并停稳，显示朝上面值；④ 预设模式下骰子停在指定值；⑤ `npx tsc --noEmit` 无错误；⑥ `npm run lint` 无错误 |
| 依赖的前序步骤 | 6 |

### 步骤 11：全链路验证与收尾

| 步骤序号 | 11 |
|---|---|
| 步骤名称 | 全链路验证 |
| 需要的输入 | 步骤 1-10 全部完成 |
| 具体操作说明 | 在 `frontend/` 目录依次执行：① `npm run lint`；② `npm run build`（等价 `tsc -b && vite build`，覆盖 typecheck）；③ `npm test`。三个命令均须通过。 |
| 预期输出 | 三命令均成功 |
| 验收标准 | ① `npm run lint` exit code 0；② `npm run build` exit code 0 无 TS 错误；③ `npm test` 全部 pass |
| 依赖的前序步骤 | 10 |

---

## 4. 环境与上下文说明

### 目录结构（关键部分）

```
frontend/
├─ public/                          ← Vite 静态根（新建）
│  └─ dice-assets/yahtzee/          ← yahtzee 资源（步骤 8）
│     ├─ dice.png
│     └─ dice.json
├─ src/
│  ├─ game/
│  │  ├─ monopoly/                  ← 现有，不动
│  │  └─ dice/                      ← 新建公共模块
│  │     ├─ types.ts                ← 类型定义
│  │     ├─ DiceRoller.ts           ← 纯 TS 核心类（随机+历史+预设）
│  │     ├─ geometry.ts             ← 3D 几何+面贴图+面定义表
│  │     ├─ faceDetection.ts        ← 朝向判定
│  │     ├─ presets.ts              ← 预设朝向四元数
│  │     ├─ index.ts                ← 导出门面
│  │     └─ __tests__/              ← 4 个测试文件
│  └─ pages/
│     ├─ demo-2d/
│     │  ├─ index.tsx               ← 改造（下拉+分支）
│     │  ├─ CharacterDemo.tsx       ← 不动
│     │  ├─ DiceSpriteScene.ts      ← 新建（Phaser Sprite 帧动画）
│     │  ├─ DiceMatterScene.ts      ← 新建（Phaser Matter 刚体）
│     │  └─ Dice2DPanel.tsx         ← 新建（UI 面板）
│     └─ demo-3d/
│        ├─ index.tsx               ← 改造（下拉+分支）
│        ├─ Dice3DEngine.ts         ← 新建（Three+Rapier 骰子）
│        └─ Dice3DPanel.tsx         ← 新建（UI 面板）
```

### 代码风格规范
- **缩进**：2 空格（现有文件一致）
- **引号**：单引号（现有一致）
- **分号**：无分号（现有 demo 文件末尾无分号，但 monopoly 有——以 eslint 为准，eslint 不强制；建议核心模块跟 monopoly 用分号，tsx 跟 demo 不用）
- **类型**：`const X = {} as const` + `type X = (typeof X)[keyof typeof X]` 模式（见 monopoly/types.ts）
- **注释**：中文，章节用 `// ═══════` 分隔（核心模块）；关键逻辑加行内注释
- **import 顺序**：第三方 → 相对路径（现有一致）
- **命名**：PascalCase 类、camelCase 函数/变量、UPPER_SNAKE 常量
- **核心模块铁律**：`game/dice/` 下 TS 文件**禁止** import React/antd/Phaser/Three——但 geometry/faceDetection/presets 需 import three（这是数学层依赖，可接受，注释标注"仅依赖 three 的数学类型，不依赖场景/渲染"）；DiceRoller 与 types.ts 零三方依赖

### 可用命令清单

| 命令 | 用途 | 工作目录 |
|---|---|---|
| `npm run dev` | 启动 Vite 开发服务器 | `frontend/` |
| `npm run build` | `tsc -b && vite build`（含类型检查） | `frontend/` |
| `npm run lint` | eslint 检查 | `frontend/` |
| `npm test` | vitest run（单次） | `frontend/` |
| `npm run test:watch` | vitest watch | `frontend/` |
| `npx tsc --noEmit -p frontend/tsconfig.app.json` | 仅类型检查 | 根目录 |

### 已有重要约定
- **Rapier init 单例**：`RAPIER.init()` 全局只能调一次，多处复用同一 promise（见 demo-3d/index.tsx:20-24 的 `ensureRapierReady`）。dice 引擎必须共用此单例，**不可重复 init**。
- **WASM 堆损坏处理**：物理引擎帧异常时立即 stop，不在损坏堆上继续 step（见 demo-3d/index.tsx:171-177）。dice 引擎须沿用此 try/catch 模式。
- **Phaser 游戏销毁**：切换 demoType 时必须 `game.destroy(true)` + 移除 DOM 节点（见 demo-2d/index.tsx:228-237）。
- **参数透传**：React→Phaser 用 `game.registry.set(key, value)`，Phaser→React 用 `game.events.emit`（现有模式）。
- **随机源独立性**：与 monopoly/engine.ts 的 rollDice 设计一致——渲染层调用 DiceRoller 生成结果，再传入动画层展示，保持职责分离。
- **预设落点策略**：物理仿真无法精确控制落点，采用"物理滚动→静止检测→slerp 校准"双阶段（presets.ts 的 correctDiceOrientation）。

---

## 5. 验证与回滚策略

### 全链路最终验收标准

| 维度 | 标准 |
|---|---|
| 类型检查 | `npm run build` exit 0，无 TS 错误 |
| Lint | `npm run lint` exit 0 |
| 单元测试 | `npm test` 全 pass，≥15 个测试 |
| 功能·核心 | DiceRoller.roll 随机模式 values ∈ [1,sides]；预设模式 values===presetValues |
| 功能·2D Sprite | demo-2d 选 Sprite 模式，投掷后帧动画播放并停在结果面 |
| 功能·2D Matter | demo-2d 选 Matter 模式，投掷后方块物理掉落停稳显示数字 |
| 功能·3D | demo-3d 选骰子模式，投掷后骰子物理滚动停稳，朝上面值正确 |
| 功能·预设 | 3D 预设模式输入 "3,5"，骰子校准后朝上面为 3 和 5 |
| 复用性 | `import { DiceRoller } from '@/game/dice'` 可被 monopoly 等模块引用 |
| 不破坏现有 | demo-2d 选 rigid/character、demo-3d 选 rigid 仍正常工作 |

### 回滚方法

| 变更类型 | 回滚方法 |
|---|---|
| 新增文件（dice 模块/demo 子文件） | `Remove-Item -Recurse frontend/src/game/dice`；删除 demo-2d/demo-3d 下 Dice* 文件 |
| 修改文件（index.tsx） | `git checkout -- frontend/src/pages/demo-2d/index.tsx frontend/src/pages/demo-3d/index.tsx` |
| 新增资源 | `Remove-Item -Recurse frontend/public/dice-assets` |
| 整体回滚 | `git checkout -- frontend/src/pages/demo-2d frontend/src/pages/demo-3d` + 删除 `frontend/src/game/dice` + 删除 `frontend/public/dice-assets` |

---

## 6. 异常与偏离处理指引

执行模型遇到以下情况时**必须停止并上报**，不得自行修改计划：

1. **步骤 3 中 d10 几何体（五角双锥）手写 BufferGeometry 复杂度超出预期**：d10 是唯一不能用 Three.js 内置几何体直接构造的骰子。若执行时无法正确构造 10 顶点 + 10 面的 BufferGeometry（UV/法向量/面索引计算困难），**停止步骤 3，上报"d10 几何体手写困难"**，由用户决定是否：①暂跳过 d10 只做 d6/d8/d12/d20；②改用简化方案（d10 用八面体近似+双数字标注）；③用户提供 d10 模型文件。

2. **步骤 8 yahtzee 资源 URL 不可达或文件格式不符**：若 raw.githubusercontent.com 下载失败、或 dice.json 帧名不是 `dieWhite{1-6}` 格式，**停止步骤 8，上报"资源获取失败"**，让用户手动下载放置或确认帧名约定。

3. **步骤 10 Rapier `ColliderDesc.convexHull` 对 d12/d20 顶点失败**：Rapier convexHull 要求顶点构成有效凸包。若 d20 顶点传入报错（非凸或顶点不足），**停止并上报**，不得自行改用 box collider 近似（会破坏物理真实感）。解决方案待用户决定（如改用 `ball` collider + 视觉多面体）。

4. **计划提到的文件/函数不存在**：如 `demo-3d/index.tsx` 中 `ensureRapierReady` 未导出且无法直接引用——**停止并上报**，由用户决定是否导出该函数或改用其他方式。

5. **目录结构与描述不一致**：如 `frontend/public/` 目录不存在或被 Vite 配置改为其他路径——**停止并上报**，确认 Vite 静态目录配置后再继续。

6. **测试失败且错误类型不在预期列表内**：预期内的失败——crypto mock 缺失、Three.js Vector3 精度浮点误差。**非预期**的失败——import 路径错误、类型不匹配、运行时 undefined——停止上报。

7. **npm run lint 报 eslint 规则错误**：若新增代码触发 eslint 规则（如 `@typescript-eslint/no-explicit-any`），**不得擅自添加 `eslint-disable` 注释**，应先尝试修正代码；若无法避免 any（如 crypto mock），按现有代码的 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 模式处理（见 demo-2d/index.tsx:18），并注释说明理由。

8. **Phaser 4 API 与文档（Phaser 3）不一致**：文档骰子代码按 Phaser 3 编写，项目用 Phaser 4.1.0。若 `Phaser.GameObjects.Sprite`、`this.scene.time.addEvent`、`this.load.atlas` 等 API 在 Phaser 4 有变更或废弃，**停止并上报**"Phaser 4 API 差异"，附上具体 API 名与报错信息。

---

## 7. 计划自检结果

- [x] 所有步骤都可以单独执行，不依赖"隐含知识"——每步输入明确列出依赖的前序步骤编号
- [x] 不存在「略过细节」「视情况处理」这类模糊表述——唯一例外是步骤 3 的 d10 已显式列为异常处理项，非模糊而是明确的升级条件
- [x] 每个高风险动作都在边界规则中明确分类——npm install(Never)、git(Never)、改 server/electron(Never)、下载资源(Ask first)、新增文件(Always)
- [x] 任意一个步骤的执行者，只看这一行就知道要改哪些文件、跑哪些命令、如何判断成功——每步的"具体操作说明"精确到文件路径与函数名，"验收标准"精确到命令 exit code 与断言条件

**唯一需执行时注意的潜在风险**：步骤 3 的 d10 几何体与步骤 10 的 Rapier convexHull 是两个技术难点，已在异常处理中明确升级路径，不属于模糊表述。
