# Electron+Node.js 骰子动画：Three.js 3D 与 Phaser 2D 可复用代码实现

## 直接可用方案速览

### Three.js 3D 骰子方案对比

| 库名 | npm 包名 | 版本 / 活跃度 | 多面骰子支持 | 预设结果 | Electron 注意事项 |
|---|---|---|---|---|---|
| @drdreo/dice-box-threejs（fork） | `@drdreo/dice-box-threejs` | 1.1.0，1 年前 [1] | 继承原版（d4–d100）[2] | 支持（@ 语法）[3] | 需手动复制 assets；**首选推荐** |
| @3d-dice/dice-box-threejs（原版） | `@3d-dice/dice-box-threejs` | 0.0.12，4 年前 [3] | d2/d4/d6/d8/d10/d12/d20/d100 及特殊骰 [2] | 支持（`@` 语法）[3] | 需手动复制 assets [4] |
| threejs-dice（byWulf） | `threejs-dice` | 1.1.0，7 年前 [5] | d4/d6/d8/d10/d12/d20（无 d100）[6] | 支持（`prepareValues`）[7] | 需配套安装 cannon.js |
| sarahRosannaBusch/dice | 仅 GitHub，无 npm [8] | 无版本号 | d4/d6/d8/d10/d12/d20/d100 [8] | 支持（`before_roll` 回调）[8] | Three.js + Cannon.js，需手动引入 |

**排除说明**：`@3d-dice/dice-box`（npm 包名不带 `-threejs` 后缀）基于 BabylonJS + AmmoJS 构建，与 Three.js 技术栈不兼容 [9]，不在本文讨论范围内。`foundryvtt-dice-so-nice` 是 Foundry VTT 平台专用模块，不适合独立 Electron 应用 [10]。

### Phaser 2D 骰子方案对比

| 方案 | 类型 | 骰子面数 | 动画方式 | 复用难度 |
|---|---|---|---|---|
| Phaser CE Yahtzee 官方示例 | 示例代码（Phaser 2.x/CE）| d6 | Sprite 帧切换 | 低（改造复用）[11] |
| TechDyno 3D Dice for Phaser 3 | 商业 Class（CodeCanyon）| d6 | CSS 3D 模拟 | 低（直接引入）[12] |
| 自定义 Sprite 帧动画（Phaser 3） | 手写代码 | 任意 | Sprite Sheet | 中（需自行实现）|

**重要版本说明**：官方 Yahtzee 示例使用 Phaser CE（即 Phaser 2.x），API 与 Phaser 3 不兼容 [13]。Phaser 3 项目需按本文 Section 3 的方式改造。目前没有专门针对 Phaser 2D 骰子动画的独立 npm 包。

---

## Three.js 3D 骰子 — 完整集成代码

### 方案 A：使用 `@drdreo/dice-box-threejs`（推荐首选）

`@drdreo/dice-box-threejs` 是原版 `@3d-dice/dice-box-threejs` 的活跃维护 fork，版本 1.1.0，发布于约 1 年前 [1]，API 与原版完全兼容。

**安装**

```bash
npm install @drdreo/dice-box-threejs
```

**Electron 资源路径配置**

库的纹理和音效文件在 `node_modules/@drdreo/dice-box-threejs/public/` 下 [4]。打包前需将这些 assets 复制到应用的静态资源目录：

```js
// electron-builder extraResources 配置示例（package.json 中）
{
 "build": {
 "extraResources": [
 {
 "from": "node_modules/@drdreo/dice-box-threejs/public/",
 "to": "dice-assets/",
 "filter": ["**/*"]
 }
 ]
 }
}
```

在渲染进程中初始化时，通过 `app.getAppPath` 构造 assets 路径（打包后 `__dirname` 指向 asar 内部，路径会失效）：

```js
// renderer.js
const { ipcRenderer } = require('electron');
// 或使用 contextBridge 暴露的 API（推荐，见 Section 4）

const assetsPath = window.electron
 ? window.electron.getAssetsPath // 主进程通过 IPC 返回 app.getAppPath
: './public';
```

**完整初始化与投掷示例**

```js
import DiceBox from '@drdreo/dice-box-threejs';
// 若使用 CommonJS：const DiceBox = require('@drdreo/dice-box-threejs').default;

// 1. 初始化
const Box = new DiceBox('#dice-container', {
 assetPath: '/dice-assets/', // 对应上方复制的目录
 gravity: 1,
 mass: 1,
 friction: 0.8,
 restitution: 0,
 angularDamping: 0.4,
 linearDamping: 0.4,
 spinForce: 4,
 throwForce: 5,
 startingHeight: 8,
 settleTimeout: 5000,
 offscreen: true, // 使用 OffscreenCanvas，性能更好
 delay: 10,
 theme: 'default',
 themeColor: '#2196F3',
});

await Box.init;

// 2a. 方式一：async/await 获取结果
const results = await Box.roll('2d6');
console.log(results); // [{sides: 6, value: 3}, {sides: 6, value: 5}]

// 2b. 方式二：onRollComplete 回调
const Box2 = new DiceBox('#dice-container', {
 assetPath: '/dice-assets/',
 onRollComplete: (results) => {
 console.log('Roll complete:', results);
 }
});

// 2c. 方式三：监听自定义事件
document.addEventListener('dice-box-roll-complete', (e) => {
 console.log('Event results:', e.detail);
});
```

**预设结果（业务层随机数 → 动画展示）**

`@` 语法在骰子符号后附加每颗骰子的目标值，动画会真实滚动并最终停在该面 [3]：

```js
// 业务层已生成随机数 [4][14]，传入动画层展示
const presetValues = [4][14];
const notation = `2d6@${presetValues.join(',')}`;
// 结果："2d6@3,5"

const results = await Box.roll(notation);
// 骰子会物理滚动，最终停在 3 和 5

// 更多示例：
await Box.roll('1d20@17'); // d20 停在 17
await Box.roll('3d8@2,7,5'); // 三颗 d8 分别停在 2、7、5
await Box.roll('6d6@4,4,4,4,4,4'); // 六颗 d6 全部停在 4 [3]
```

---

### 方案 B：使用 `threejs-dice`（多面骰子备选，需手动搭建场景）

`threejs-dice` 明确支持 d4/d6/d8/d10/d12/d20 共 6 种面数 [6]，不支持 d100。它不封装 Three.js 场景，需要开发者自行创建 renderer、scene、camera，灵活度更高但集成工作量也更大。

**安装**

```bash
npm install threejs-dice
npm install cannon # 或 cannon-es（现代 fork，推荐）
```

**完整代码示例**

```js
import * as THREE from 'three';
import CANNON from 'cannon';
import { DiceManager, DiceD6, DiceD20 } from 'threejs-dice';

// 1. 创建 Three.js 场景
const scene = new THREE.Scene;
const camera = new THREE.PerspectiveCamera(20, window.innerWidth / window.innerHeight, 1, 100);
camera.position.set(0, 30, 0);
camera.lookAt(new THREE.Vector3(0, 0, 0));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// 2. 创建 Cannon.js 物理世界
const world = new CANNON.World;
world.gravity.set(0, -9.82 * 20, 0);
world.broadphase = new CANNON.NaiveBroadphase;
world.solver.iterations = 16;
DiceManager.setWorld(world);

// 3. 添加地面（物理碰撞体）
const floorBody = new CANNON.Body({
 mass: 0,
 shape: new CANNON.Plane,
 material: DiceManager.floorBodyMaterial,
});
floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(floorBody);

// 4. 创建骰子
const dice = [];

// 创建 d6
const d6 = new DiceD6({ size: 1.5, backColor: '#ff0000' });
scene.add(d6.getObject);
dice.push(d6);

// 创建 d20
const d20 = new DiceD20({ size: 1.5, backColor: '#0000ff' });
scene.add(d20.getObject);
dice.push(d20);

// 5. 预设结果（业务层传入随机数）
function rollWithPreset(diceList, values) {
 const prepareData = diceList.map((die, i) => ({
 dice: die,
 value: values[i],
 }));

 DiceManager.prepareValues(prepareData);

 diceList.forEach((die) => {
 die.resetBody;
 // 给骰子一个随机初始位置和冲量，使其看起来真实
 die.getObject.body.position.set(
 (Math.random * 2 - 1) * 3,
 5 + Math.random * 3,
 (Math.random * 2 - 1) * 3
 );
 die.getObject.body.velocity.set(
 Math.random * 10 - 5,
 -10,
 Math.random * 10 - 5
 );
 die.getObject.body.angularVelocity.set(
 Math.random * 20 - 10,
 Math.random * 20 - 10,
 Math.random * 20 - 10
 );
 });
}

// 使用：业务层已确定结果 [1][5]
rollWithPreset(dice, [1][5]);

// 6. 动画循环
let lastTime;
const fixedTimeStep = 1.0 / 60.0;
const maxSubSteps = 3;

function animate(time) {
 requestAnimationFrame(animate);
 if (lastTime !== undefined) {
 const dt = (time - lastTime) / 1000;
 world.step(fixedTimeStep, dt, maxSubSteps);
 }
 lastTime = time;

 // 同步物理体与 Three.js mesh
 dice.forEach((die) => die.updateMeshFromBody);

 renderer.render(scene, camera);
}
animate;
```

**Electron 注意事项**：`cannon`（原版）是纯 JavaScript 模块，在 Electron 渲染进程中可直接使用。若改用 `cannon-es`（`npm install cannon-es`），需将 import 改为 `import * as CANNON from 'cannon-es'`，API 基本兼容。两者均不需要 Node.js 原生模块，不存在重新编译问题。

---

### 多面骰子扩展说明

`threejs-dice` 通过不同的类名区分骰子类型 [7]：

```js
import { DiceD4, DiceD6, DiceD8, DiceD10, DiceD12, DiceD20 } from 'threejs-dice';
// 构造参数相同：{ size, backColor, fontColor, material }
```

`sarahRosannaBusch/dice`（GitHub 仓库，无 npm 包）额外支持 d100，通过 `setDice` 方法传入骰子符号 [8]：

```js
// sarahRosannaBusch/dice 用法（需克隆仓库后引入）
dice_box.setDice('2d20 + 1d8');
dice_box.start_throw(
 => ['20', '15', '7'], // before_roll：返回预设值数组
 (notation_result) => { // after_roll：接收最终结果
 console.log(notation_result);
 }
);
```

**非标准面数（d3、d7 等）**：`@3d-dice/dice-box-threejs` 的源码已包含 d1、d2、d3 等非标准骰子的几何体定义 [2]。如需在 `threejs-dice` 中实现非标准面数，思路是继承 `DiceObject` 基类，传入自定义的 `THREE.Geometry`（如 d3 可用三棱柱），并手动定义各面的 UV 映射与法向量——工作量较大，通常不如直接使用 `@3d-dice/dice-box-threejs` 的内置支持。

---

## Phaser 2D 骰子 — 完整集成代码

### 方案一：Sprite 帧动画（最轻量，Phaser 3）

**资源准备**：官方 Phaser CE Yahtzee 示例使用 64×64px 的 Sprite Atlas，帧名为 `dieWhite1`–`dieWhite6` 和 `dieRed1`–`dieRed6`（带边框选中态）[15][11]。资源文件位于：

- 图片：`examples/assets/games/yahtzee/dice.png`
- 配置：`examples/assets/games/yahtzee/dice.json` [15]

可直接从官方仓库下载这两个文件放入项目 `assets/` 目录，或自行制作相同命名规范的 Sprite Sheet。

**Phaser 3 完整实现**（官方 Yahtzee 示例为 Phaser 2.x，以下已适配 Phaser 3）：

```js
// DiceSprite.js — 可复用的 Phaser 3 骰子类
export default class DiceSprite extends Phaser.GameObjects.Sprite {
 constructor(scene, x, y, value = 1) {
 super(scene, x, y, 'dice', `dieWhite${value}`);
 scene.add.existing(this);
 this.setInteractive;

 this.value = value;
 this.rolling = false;
 this._rollTimer = null;

 // 点击触发投掷（无预设值时随机）
 this.on('pointerdown', => {
 if (!this.rolling) this.roll;
 });
 }

 /**
 * @param {number|null} presetValue - 业务层传入的预设结果（1-6）；
 * 传 null 则在动画结束后随机取值（不推荐，
 * 应在 Node.js 主进程生成随机数后传入）
 */
 roll(presetValue = null) {
 if (this.rolling) return;
 this.rolling = true;

 const targetValue = presetValue !== null
 ? presetValue
: Phaser.Math.Between(1, 6); // 仅在无 IPC 的独立测试场景使用

 let elapsed = 0;
 const duration = 800; // 动画总时长 ms
 const interval = 60; // 帧切换间隔 ms

 // 快速切换帧，模拟滚动效果
 this._rollTimer = this.scene.time.addEvent({
 delay: interval,
 repeat: Math.floor(duration / interval) - 1,
 callback: => {
 elapsed += interval;
 // 动画结束前随机闪烁；最后一帧停在目标值
 if (elapsed >= duration) {
 this.setFrame(`dieWhite${targetValue}`);
 this.value = targetValue;
 this.rolling = false;
 this.emit('rollComplete', targetValue);
 } else {
 // 切换随机帧制造滚动视觉
 const flash = Phaser.Math.Between(1, 6);
 this.setFrame(`dieWhite${flash}`);
 }
 },
 });
 }

 // 锁定/解锁（Yahtzee 场景）
 lock {
 this.setFrame(`dieRed${this.value}`);
 this.locked = true;
 }

 unlock {
 this.setFrame(`dieWhite${this.value}`);
 this.locked = false;
 }
}

// GameScene.js — 使用示例
class GameScene extends Phaser.Scene {
 preload {
 // 加载 Sprite Atlas（JSON + PNG）
 this.load.atlas('dice', 'assets/dice.png', 'assets/dice.json');
 }

 create {
 this.dice = [
 new DiceSprite(this, 100, 300),
 new DiceSprite(this, 200, 300),
 new DiceSprite(this, 300, 300),
 ];

 // 监听每颗骰子的完成事件
 this.dice.forEach((d) => {
 d.on('rollComplete', (value) => {
 console.log('Die landed on:', value);
 });
 });

 // 接收来自主进程的预设结果（见 Section 4）
 window.electron?.onDiceResult((values) => {
 values.forEach((v, i) => this.dice[i]?.roll(v));
 });
 }
}
```

**与随机数集成**：`roll(presetValue)` 接受外部传入的数值，渲染进程只负责播放动画。随机数在 Node.js 主进程生成后通过 IPC 传入（见 Section 4），渲染进程不自行调用 `Math.random`。

---

### 方案二：TechDyno 3D Dice Class for Phaser 3

TechDyno 于 2020 年 2 月在 Phaser.io 官方新闻发布了一个针对 Phaser 3 的可定制 3D 骰子 Class [12]。该 Class 通过 CSS 3D 变换在 Phaser Canvas 上模拟 3D 翻转效果，接受 6 个骰子面的 sprite 图片作为参数，是商业产品（托管于 CodeCanyon）[12]。

**适用场景**：需要在 Phaser 3 游戏中展示视觉上有立体感的 d6，但不想引入 Three.js 物理引擎时。面数固定为 6，不支持多面骰子。

**集成方式**：从 CodeCanyon 购买后，将 `Dice.js` 放入项目，在 Phaser 3 Scene 的 `create` 中实例化：

```js
// 示意，具体 API 以购买后文档为准
const die = new Dice(this, x, y, {
 faceImages: ['face1.png', 'face2.png', 'face3.png', 'face4.png', 'face5.png', 'face6.png'],
});
die.roll(targetFace); // 传入预设面值
```

---

### 方案三：可扩展骰子基类（支持多面骰子，Phaser 3）

当需要 d6 以外的骰子时，为每种面数准备单独的 Sprite Sheet，并通过 `sides` 参数区分：

```js
// PolyDice.js — 支持任意面数的 Phaser 3 骰子基类
export default class PolyDice extends Phaser.GameObjects.Sprite {
 /**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} sides - 骰子面数（4/6/8/10/12/20）
 * @param {number} value - 初始显示值
 */
 constructor(scene, x, y, sides = 6, value = 1) {
 // 约定：每种面数对应一张 Sprite Sheet，key 为 'dice-d{sides}'
 // 帧名约定：'face-1', 'face-2',..., 'face-{sides}'
 super(scene, x, y, `dice-d${sides}`, `face-${value}`);
 scene.add.existing(this);
 this.sides = sides;
 this.value = value;
 this.rolling = false;
 }

 /**
 * @param {number|null} presetValue - 预设结果；null 时动画随机停帧（仅测试用）
 * @returns {Promise<number>} 解析为最终落点值
 */
 roll(presetValue = null) {
 return new Promise((resolve) => {
 if (this.rolling) return;
 this.rolling = true;

 const target = presetValue ?? Phaser.Math.Between(1, this.sides);
 const duration = 800;
 const interval = 60;
 let elapsed = 0;

 this.scene.time.addEvent({
 delay: interval,
 repeat: Math.floor(duration / interval) - 1,
 callback: => {
 elapsed += interval;
 if (elapsed >= duration) {
 this.setFrame(`face-${target}`);
 this.value = target;
 this.rolling = false;
 resolve(target);
 } else {
 this.setFrame(`face-${Phaser.Math.Between(1, this.sides)}`);
 }
 },
 });
 });
 }
}

// 使用：d20
const d20 = new PolyDice(scene, 200, 300, 20);
const result = await d20.roll(17); // 预设值 17，动画后停在第 17 面
```

**Sprite Sheet 准备**：d6 以外的骰子目前没有现成的公开资源包，通常需要自行绘制或从 RPG 素材网站获取。每张 Sprite Sheet 的帧按 `face-1` 到 `face-{sides}` 命名，用 TexturePacker 或 Phaser 内置的 `spritesheet` 加载器打包。

---

## Electron+Node.js 集成架构

### 进程职责划分

```
┌─────────────────────────────────────────────────────────────┐
│ 主进程（Node.js） │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ crypto.randomInt(1, sides+1) ← 安全随机数生成 │ │
│ │ ipcMain.handle('roll-dice', handler) │ │
│ └──────────────────────────────────────────────────────┘ │
│ │ IPC │
│ ▼ │
│ 渲染进程（Chromium） │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ preload.js: contextBridge.exposeInMainWorld(...) │ │
│ │ renderer.js: window.electron.rollDice(notation) │ │
│ │ → Three.js / Phaser 动画（预设结果模式） │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 关键代码：IPC + 预设结果骰子动画

**主进程（main.js）**

```js
const { app, BrowserWindow, ipcMain } = require('electron');
const crypto = require('crypto');
const path = require('path');

function createWindow {
 const win = new BrowserWindow({
 width: 1200,
 height: 800,
 webPreferences: {
 preload: path.join(__dirname, 'preload.js'),
 contextIsolation: true, // Electron 20+ 默认开启，必须保持
 nodeIntegration: false, // 禁用，通过 contextBridge 代替
 },
 });
 win.loadFile('index.html');
}

// 处理投掷请求：接收骰子符号，生成随机数，返回预设值
ipcMain.handle('roll-dice', (event, { notation }) => {
 // notation 示例："2d6", "1d20", "3d8"
 const match = notation.match(/^(\d+)d(\d+)$/);
 if (!match) throw new Error(`Invalid notation: ${notation}`);

 const count = parseInt(match[3], 10);
 const sides = parseInt(match[7], 10);

 // crypto.randomInt 生成密码学安全随机数
 const values = Array.from({ length: count }, =>
 crypto.randomInt(1, sides + 1)
 );

 // 返回预设值供渲染进程动画使用
 return { notation, values, presetNotation: `${notation}@${values.join(',')}` };
});

app.whenReady.then(createWindow);
```

**预加载脚本（preload.js）**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
 // 向主进程请求投掷，返回包含预设值的结果
 rollDice: (notation) => ipcRenderer.invoke('roll-dice', { notation }),

 // 主进程主动推送结果时使用（可选）
 onDiceResult: (callback) => {
 ipcRenderer.on('dice-result', (event, data) => callback(data));
 },

 // 获取 assets 路径（解决打包后路径问题）
 getAssetsPath: => ipcRenderer.invoke('get-assets-path'),
});
```

**注意**：不要在 `exposeInMainWorld` 中直接暴露整个 `ipcRenderer` 对象，只暴露具名的 wrapper 函数 [16]。

**渲染进程（renderer.js，Three.js 路线）**

```js
import DiceBox from '@drdreo/dice-box-threejs';

const Box = new DiceBox('#dice-container', {
 assetPath: await window.electron.getAssetsPath + '/dice-assets/',
});
await Box.init;

// 触发投掷：由主进程生成随机数，渲染进程只负责动画
async function rollDice(notation) {
 const { presetNotation, values } = await window.electron.rollDice(notation);

 // 使用预设结果符号触发动画，骰子物理滚动后停在指定值
 const results = await Box.roll(presetNotation);
 console.log('Animation complete, values:', values);
 return values;
}

// 示例调用
document.getElementById('roll-btn').addEventListener('click', => {
 rollDice('2d6');
});
```

**渲染进程（renderer.js，Phaser 路线）**

```js
// 在 Phaser Scene 的 create 中绑定 IPC 回调
create {
 this.dice = [new DiceSprite(this, 150, 300), new DiceSprite(this, 300, 300)];

 document.getElementById('roll-btn').addEventListener('click', async => {
 const { values } = await window.electron.rollDice('2d6');
 // 同时触发所有骰子动画，各自停在预设值
 this.dice.forEach((d, i) => d.roll(values[i]));
 });
}
```

### Electron 特有注意事项

**CSP 配置**：Three.js WebGL 和 Phaser Canvas 都需要 `script-src 'self'` 以及 `img-src` 允许 blob/data URI（用于动态纹理）。在 `BrowserWindow` 的 `webPreferences` 中设置：

```js
// index.html 的 <meta> 标签
// Three.js WebGL 需要允许 worker-src blob:（OffscreenCanvas 模式）
<meta http-equiv="Content-Security-Policy"
 content="default-src 'self';
 script-src 'self';
 style-src 'self' 'unsafe-inline';
 img-src 'self' data: blob:;
 worker-src blob:;">
```

**assets 路径**：开发环境下 `__dirname` 指向源码目录；`electron-builder` 打包后，应用内容被打入 `.asar` 文件，`__dirname` 仍有效但指向 asar 内部路径，而 `extraResources` 复制的文件在 `process.resourcesPath` 下。推荐统一用 `app.getAppPath` 或 `process.resourcesPath` 拼接路径，通过 IPC 传给渲染进程，避免硬编码。

**`nodeIntegration: false` + `contextBridge`**：从 Electron 20 起 preload 默认沙箱化 [17]，`contextBridge` 是唯一安全的跨进程暴露方式。不要为了方便开启 `nodeIntegration: true`——Three.js 和 Phaser 均不需要直接访问 Node.js API，所有 Node.js 操作（随机数、文件路径）走 IPC 即可 [18]。

---

## 方案选型决策指引

| 需求场景 | 推荐方案 | 关键理由 |
|---|---|---|
| 只需 d6，快速集成，3D 效果 | `@drdreo/dice-box-threejs` | 维护最新（1 年前），npm 直装，@ 语法预设结果 [1] |
| 需要 d4–d20 多面骰子，3D，npm 包 | `threejs-dice` | 明确支持 6 种面数，`prepareValues` API [6] |
| 需要 d100 或特殊骰（Fudge/Poker），3D | `@3d-dice/dice-box-threejs` 或 `sarahRosannaBusch/dice` | 前者 npm 可装且内置 d100 [2]；后者 GitHub only [8] |
| Phaser 2D 游戏内骰子，最轻量 | Sprite 帧动画方案（本文 Section 3A） | 无额外依赖，完全可控，Promise 接口与 IPC 兼容 |
| Phaser 2D 但想要伪 3D 感 | TechDyno Dice Class | Phaser.io 官方推荐，现成可用 [12] |
| 需要与 Node.js 安全随机数集成 | 任意方案 + IPC 预设结果模式 | 见 Section 4，架构与具体动画库无关 |

**`@3d-dice/dice-box`（无 `-threejs` 后缀）再次说明**：该包基于 BabylonJS + AmmoJS [9]，与 Three.js 栈不兼容，功能虽强大但不在本文范围。若项目已有 BabylonJS 依赖，可单独评估。

---

## 延伸探索方向

**1. 物理引擎升级：cannon-es 与 rapier.js**

`threejs-dice` 文档中的 `cannon` 原版已多年未维护。`cannon-es`（`npm install cannon-es`）是社区维护的现代 fork，TypeScript 类型完整，API 与原版基本兼容，可直接替换。`rapier.js` 是 Rust 编写的物理引擎，有 WASM 版本（`@dimforge/rapier3d`），在骰子碰撞计算密集场景下性能优于纯 JS 实现。在 Electron 中使用 WASM 时需注意：`BrowserWindow` 的 CSP 需添加 `script-src 'wasm-unsafe-eval'`，且 WASM 文件需通过 `extraResources` 打包，不能内联在 asar 中直接 `fetch`——需改用 `fs.readFileSync` 在主进程读取后传给渲染进程，或配置 `asarUnpack` 排除 `.wasm` 文件。

**2. 动态 Canvas 纹理（自定义骰子面）**

Three.js 骰子的面贴图可用 `THREE.CanvasTexture` 在运行时动态生成。思路：为每个面创建一个离屏 `<canvas>`，用 Canvas 2D API 绘制图标、符文或任意图形，然后 `new THREE.CanvasTexture(canvas)` 传给骰子材质的 `map` 属性。每次更换面内容时调用 `texture.needsUpdate = true` 强制刷新。这适合 RPG 应用中需要显示命运符文、属性图标等非数字骰子面的场景，且不需要预先准备图片资源。

**3. 骰子结果的可验证随机性**

多人联网对战或需要防作弊时，`crypto.randomInt` 本身不可被对手验证。标准方案是 commit-reveal：投掷前，主机将 `hash(seed + nonce)` 广播给所有客户端（commit 阶段）；投掷后，公开 `seed`，其他客户端验证 `hash(seed + nonce)` 与之前广播值一致，再用 `seed` 重现骰子结果（reveal 阶段）。Node.js 实现中，`seed` 可用 `crypto.randomBytes(32)`，hash 用 `crypto.createHash('sha256')`。动画层只需在 reveal 阶段收到确认后，用公开的 `seed` 派生出每颗骰子的预设值，走本文的 IPC 预设结果模式触发动画，逻辑与单机版完全相同。

## 参考文献

[1] @drdreo/dice-box-threejs - npm. https://npmjs.com/package/@drdreo/dice-box-threejs
[2] dice.js - 3d-dice/dice-box-threejs. https://raw.githubusercontent.com/3d-dice/dice-box-threejs/main/src/const/dice.js
[3] @3d-dice/dice-box-threejs - npm. https://www.npmjs.com/package/@3d-dice/dice-box-threejs
[4] 3d-dice/dice-box-threejs. https://github.com/3d-dice/dice-box-threejs
[5] threejs-dice_research report. https://www.npmjs.com/package/threejs-dice
[6] threejs-dice README. https://github.com/byWulf/threejs-dice/blob/master/README.md
[7] GitHub - byWulf/threejs-dice. https://github.com/byWulf/threejs-dice
[8] sarahRosannaBusch/dice: The best 3D dice roller for web stuff.. https://github.com/sarahRosannaBusch/dice
[9] @3d-dice/dice-box - npm. https://www.npmjs.com/package/@3d-dice/dice-box
[10] FoundryVTT Dice So Nice. https://gitlab.com/riccisi/foundryvtt-dice-so-nice
[11] dice-implementation_verify Agent Report. https://github.com/photonstorm/phaser-examples/blob/master/examples/games/yahtzee.js
[12] New Customizable 3D Dice For Phaser 3. https://phaser.io/news/2020/02/new-customizable-3d-dice-for-phaser-3
[13] games/yahtzee – Phaser CE Examples. https://samme.github.io/phaser-examples-mirror/games/yahtzee.html
[14] phaser-examples-mirror games directory. https://github.com/samme/phaser-examples-mirror/tree/master/games
[15] phaser-ce-examples/examples/assets/games/yahtzee/dice.json. https://github.com/photonstorm/phaser-examples/blob/master/examples/assets/games/yahtzee/dice.json
[16] dice-implementation_verify Agent Report. https://electronjs.org/docs/latest/api/context-bridge
[17] Using Preload Scripts - Electron. https://electronjs.org/docs/latest/tutorial/tutorial-preload
[18] Inter-Process Communication - Electron. https://electronjs.org/docs/latest/tutorial/ipc
