# 修复完成说明

## 2026-06-19 修复

### 1. 菜单栏开关需重启才生效 ✅
**问题**: 系统设置 →「显示菜单栏」开关切换后不即时生效，必须重启 App。
**根因**: `dist-electron/preload.js` 经 tsc 编译为 ESM（`import ... from 'electron'`），但 `BrowserWindow` 默认 `sandbox: true`（Electron 20+），沙箱内预加载脚本不支持 ESM import → preload 静默加载失败 → `window.electronAPI` 为 `undefined` → 前端 `window.electronAPI?.setMenuBarVisibility()` 全部 no-op。只有下次启动 `createWindow(showMenuBar)` 读持久化设置时才生效。
**修复**:
- 新增 `electron/preload.cjs`（CommonJS `require`，沙箱内可用 `require('electron')`），保留 sandbox 开启（更安全）。
- `electron/main.ts`：`preload` 指向 `preload.cjs`；`ready-to-show` 时显式 `setMenuBarVisibility` + `setAutoHideMenuBar` 双保险。
- `package.json` 的 `build:electron`：tsc 后追加一步把 `preload.cjs` 拷到 `dist-electron/`。
**影响文件**: `electron/preload.cjs`(新)、`electron/main.ts`、`package.json`

### 2. 空书库重启后自动冒出两个 Mock 作品 ✅
**问题**: 删光所有作品后，重启 App 会自动恢复《剑啸九州》《北境长歌》两个演示作品；有作品时不会复现。
**根因**: `bootstrapStore` 在「后端为空且 `storeInitialized: true`」分支只写了注释「保持空」，**却没实际清空内存**——内存里仍是 `seedState()` 的两本种子书。随后 `storeReady=true`，任何后续 `setState`（如切换当前作品）触发 1s 防抖订阅，把这两本内存假书 `pushStore` 回后端，重启即「自动冒出」。
**修复**（`frontend/src/store/appStore.ts`）:
- 该空库分支改为显式 `setState` 把全部业务数组清空，使内存与后端一致。
- `reloadStoreFromBackend`（切换资产目录）原先对空目录会无脑播种，现改为保持空库。
- 设置页文案同步更新；`home/index.tsx` 空表加了带跳转链接的引导提示。
**影响文件**: `frontend/src/store/appStore.ts`、`frontend/src/pages/settings/index.tsx`、`frontend/src/pages/home/index.tsx`

### 3. M0 立项支持人工填写（非 AI 生成）✅
**问题**: M0 立项·架构页只有点击「生成架构」由 AI 产出后，才会显示可编辑的架构文本框；不生成 AI 时无法手动立项。
**修复**（`frontend/src/pages/m0-architecture/index.tsx`）:
- 「架构」卡片改为始终显示（移除「仅在有内容时显示」条件），标题改为「架构（手填 / 编辑 AI 产出）」。
- `ARCH_FIELDS` 扩充每个字段的引导模板（核心种子公式、角色驱动力三角、世界观三维度、三幕式情节，对齐后端 `ARCH_SYSTEM_PROMPT`），作为 placeholder。
- 新增「填入引导模板」按钮：把空字段批量填入模板供在其上改写。
- 「采纳架构（建新书）」原有「至少填一项即可」逻辑无需改动。
**影响文件**: `frontend/src/pages/m0-architecture/index.tsx`

**验证**: 前端 `tsc --noEmit`、electron `tsc --noEmit`、`build:electron` 均通过；preload.cjs 已用 sandbox 模拟加载验证 API 正确暴露。

---

## 已修复的问题

### 1. 批处理文件编码问题 ✅
**问题**: `chcp 65001` 导致中文显示乱码
**修复**: 移除 `chcp 65001`，使用纯英文提示信息

**影响文件**:
- `start-electron.bat`
- `build-electron.bat`
- `verify-electron.bat`

### 2. Electron 启动问题 ✅
**问题**: `tsx electron/main.ts` 无法正确导入 Electron 模块
```
SyntaxError: The requested module 'electron' does not provide an export named 'BrowserWindow'
```

**原因**: tsx 是 Node.js 的 TypeScript 运行器，不支持 Electron 的特殊模块系统

**修复**: 
1. 修改 `package.json` 的 `dev` 脚本
   ```json
   // 旧: "dev": "tsx electron/main.ts"
   // 新: "dev": "npm run build:electron && electron ."
   ```
2. 开发模式先编译 TypeScript，再用 electron 运行编译后的 JS

### 3. 编译验证 ✅
- ✅ Electron 主进程编译成功：`dist-electron/main.js` (7.9 KB)
- ✅ 后端编译成功：`server/dist/` (8 个文件)
- ✅ 所有依赖已安装

---

## 现在可以运行！

### 方式 1：命令行
```bash
npm run dev
```

### 方式 2：批处理脚本（推荐）
双击 `start-electron.bat`

---

## 预期行为

1. **编译阶段** (~5 秒)
   ```
   > novelhelper@0.1.0 build:electron
   > tsc -p electron/tsconfig.json
   ```

2. **启动阶段** (~15-30 秒)
   - Electron 主进程启动
   - 后端服务器启动（:8787）
   - 前端开发服务器启动（:5173）
   - 应用窗口打开

3. **运行中**
   - 原生窗口（无浏览器地址栏）
   - Electron 原生菜单栏默认显示（可在设置页关闭）
   - DevTools 默认关闭（可通过 F12 或菜单 View → Toggle Developer Tools 手动打开）
   - 控制台显示后端/前端日志

4. **关闭时**
   - 关闭窗口
   - 自动清理所有子进程

---

## 故障排除

### 问题：端口被占用
**症状**: 后端启动失败，提示端口 8787 被占用

**解决方案**:
```bash
# 查找占用端口的进程
netstat -ano | findstr :8787

# 杀死进程（替换 <PID> 为实际进程 ID）
taskkill /PID <PID> /F
```

### 问题：前端启动失败
**症状**: 前端开发服务器无法启动

**解决方案**:
```bash
cd frontend
npm install
npm run dev
```

### 问题：Electron 窗口不显示
**症状**: 进程启动但窗口不出现

**解决方案**:
1. 检查控制台日志
2. 等待更长时间（首次启动可能较慢）
3. 检查 `http://localhost:5173` 是否可访问

### 问题：关闭后进程残留
**症状**: 关闭窗口后 node.exe 进程仍在运行

**解决方案**:
```bash
# 手动清理所有 node 进程
taskkill /F /IM node.exe
```

---

## 开发模式 vs 生产模式

### 开发模式（当前）
- 启动方式：`npm run dev`
- 后端：tsx watch（自动重载）
- 前端：Vite dev server（HMR）
- DevTools：默认关闭（可通过 F12 手动打开）
- 菜单栏：默认显示（可在设置页关闭）
- 数据目录：`server/data/` + `assets/`

### 生产模式（打包后）
- 启动方式：运行打包的 exe 文件
- 后端：node dist/index.js
- 前端：加载 frontend/dist/
- DevTools：默认关闭
- 菜单栏：默认显示（可在设置页关闭）
- 数据目录：`~/.novelhelper/`

---

## 下一步

1. ✅ **立即测试开发模式**
   ```bash
   npm run dev
   # 或双击 start-electron.bat
   ```

2. **验证核心功能**
   - M1 文本清理
   - M0 立项架构
   - 设置页

3. **测试进程清理**
   - 关闭窗口
   - 检查任务管理器（无残留 node.exe）

4. **打包测试**（可选）
   ```bash
   npm run dist
   # 或双击 build-electron.bat
   ```

---

## 文件修改摘要

### 修改文件（4 个）
1. `package.json` - 修改 dev 脚本
2. `start-electron.bat` - 移除 chcp，英文化
3. `build-electron.bat` - 移除 chcp，英文化
4. `verify-electron.bat` - 移除 chcp，英文化

### 新增文件（1 个）
5. `FIXES.md` - 本说明文档

---

**状态**: ✅ 所有问题已修复，可以运行  
**测试**: 运行 `npm run dev` 🚀

---

## 2026-06-19 晚 — 节点池功能增强 + 入库数据恢复

### A. 系统设置 → 节点池 新增 6 项功能 ✅

**改动文件**：`frontend/src/services/types.ts`、`frontend/src/store/appStore.ts`、`frontend/src/services/real/batch.ts`、`frontend/src/services/real/llm.ts`、`frontend/src/pages/m1-import/Step3Clean.tsx`、`frontend/src/pages/batch-generate/index.tsx`、`frontend/src/pages/settings/index.tsx`（后端无需改，设置走现有 settings.json 防抖回写）。

1. **Tab 切换（文本生成 / 文生图）**：节点池标题右侧 `Segmented` 切换 `nodeTypeFilter`，表格只显示对应类型；原「类型」列删除；新增节点按当前 Tab 预设 `nodeType`。
2. **批量测试按钮**：遍历当前 Tab 且 `enabled` 的节点，并发上限 4 调 `testProvider`，实时进度 + 结束汇总，更新每个节点 `lastTestResult`。
3. **节点上移 / 下移**：操作列 ↑↓ 按钮（首行禁用↑、末行禁用↓），在 providers 全量数组里交换两项位置，数组顺序即持久化（防抖回写 settings.json），重启保留。
4. **复制节点**：新 id，名称按同名编号递增（`X` → `X (2)` → `X (3)`），`usageLeft` 不复制（视为新额度起始）。
5. **并发测试按钮**（仅文本节点显示）：纯前端二分探测——单发连通探测 + 逐级提高并发 2→4→8→16，遇首个未全部成功的级别回退，取「全部成功的最大 N」为 `maxConcurrency`，单请求耗时/N 估算 `intervalSec`；弹 Modal 展示探测日志，确认后写回节点参数。
6. **次数限制开关 + 每日刷新**：
   - `ProviderNode` 加 4 字段：`usageLimitEnabled / usageLimit / usageLeft / usageResetDate`。
   - 新增 store action `consumeProviderUsage(nodeId)`：未开启返回 true；跨本地自然日（`YYYY-MM-DD`）重置 `usageLeft = usageLimit`；到 0 返回 false（调度器跳过）；否则递减写回。
   - 接入递减点：`batch.ts`/`llm.ts` 的 `pickCandidate` 加 `isNodeAvailable` 钩子参数，由 Step3Clean / batch-generate 启动队列时传入 `consumeProviderUsage`，选节点时扣减额度。
   - 编辑 Modal 加「次数限制」Switch + 条件展示「每日额度」；表格加「次数(今日)」列展示 `剩余/额度`，用尽标红。

**类型变更向后兼容**：新字段在 `normalizeProvider` 补默认值，旧 settings.json 无字段也能跑。`tsc --noEmit` 与 `vite build` 均通过。

**构建期坑**：rolldown-vite 无法解析 `startBatchGenerate(...)` 内联第 4 个 opts 对象参数（报 "Unexpected token"），已将 batch-generate 的回调提取为具名 const `callbacks` 再传入规避。

### B. 入库小说数据恢复 ✅

**现象**：本次功能开发后发现书库为空，入库的《综漫，人在实教，幕后开启杀戮都市》及 100+ 章正文消失。

**排查结论**：
- 数据**并未真正丢失**——SQLite 行被 delete 但数据页未 VACUUM 回收，全部实体仍残留在 `server/src/data/assets/novelhelper.db` 文件字节流中。
- 清空发生在本次代码改动**之前**（db 22:10 被改写，早于 settings.json 22:58 写入），与本次节点池功能无关。
- 根因是 `syncAll` 的「删除 payload 里没有的 id」策略：当前端内存为空（books=[]）时触发全量同步，会把库里所有书删掉。最可能触发点是之前「入库 bodyLimit 超限 + 前端吞错误报成功」修复过程中、或某次前端内存为空时的全量同步。

**恢复过程**：
1. 备份原 db → `novelhelper.db.bak-20260619_231156`。
2. 停后端释放 db 句柄。
3. `sqlite3 .recover` 从 free pages 重建 lost_and_found（正确处理跨页）+ db 字节流大括号配对（补 recover 漏掉的短 book 行），合并去重提取出全部实体。
4. 直接 upsert 写回各表（纯插入/更新，绝不删除），避开 syncAll 的删除逻辑。
5. 补回被覆盖的 seed 书行（`book-ref-1` 剑啸九州、`book-proj-1` 北境长歌）及其 seed 大纲。
6. 修复 `moduleMapping`：全部指向已删除的旧 seed 节点（prov-1/prov-2），改为指向实际配置的 SenseNova 节点。
7. 重启后端，API 验证：3 本书 / 113 章 / 13 卡片 / 6 大纲，主书 106 章正文完整。

**恢复后注意**：前端 store 内存里 `moduleMapping` 是旧值，需刷新页面（Ctrl+R）从后端重新拉取，否则 UI 操作的防抖回写可能覆盖回去。

### C. 待办（结构性风险，未修）

`syncAll` 的全量删除策略在「前端内存为空 + 触发同步」时会清库，是数据安全的结构性隐患。建议后续加防护：当 payload 的 books 为空但库非空且 `storeInitialized` 时，拒绝执行删除（只 upsert）。本次未改，留待确认。

## 2026-06-20 — 数据持久化全面加固 + 设置/备份导入导出 ✅

### 背景

用户反馈"反复挣扎在数据丢失的窘境中"。经三层调研（后端 SQLite/settings、前端 store 同步、类型与 UI）定位到 **6 个相互放大的缺陷** 共同导致数据丢失，其中 #1（syncAll 全量删除）正是上一轮丢失 106 章主书的真因。本次从根上修复全部 6 项，并新增导入导出作为"万一再丢"的人工兜底。

### 根因清单（按危害排序）

| # | 缺陷 | 位置 | 后果 |
|---|---|---|---|
| 1 | **syncAll 全量删除**：payload 没出现的 id 全删 | db.ts:101-105 | 前端内存空时触发同步 → 整库被清（106 章主书就此丢失） |
| 2 | **settings.json 非原子写**：直接 writeFileSync | settings.ts:18-21 | 断电/崩溃 → 文件截断 → readSettings 返回 {} → providers/keys/mapping/storeInitialized 全没 |
| 3 | **readSettings 静默吞错**：损坏与首启无法区分 | settings.ts:13-15 | 损坏被当首启，无任何告警 |
| 4 | **getAssetDir 每次 DB 访问重读 settings.json** | db.ts:37-43,52 | settings 损坏 → DB 路径漂移到默认空目录 |
| 5 | **readAll 无逐行容错**：一行坏 → 整库 500 | db.ts:79 | 前端误判空 → 触发 #1 |
| 6 | **全代码库零版本字段** | 全局 | schema 演化纯靠读时补默认，无法迁移 |

### Part A — 持久化层加固（治本）

- **A1 syncAll 改纯 upsert（永不删除）** `server/src/store/db.ts`：删除"SELECT existing → DELETE missing"逻辑，syncAll 只做 `INSERT … ON CONFLICT DO UPDATE`。**发什么存什么，从不删**。从根上消灭"前端内存空触发同步清库"事故。
- **A2 显式删除端点** `DELETE /api/store`：新增 `deleteEntities`（按表名+id 列表白名单精确删除，事务包裹）+ `clearAllBusinessData`（备份恢复的"纯净恢复"用）。前端 `deleteBook`/`deleteImage`/`resetDemo` 改走此端点（不再依赖 syncAll 反推删除）。新增 `pushDeleteNow` 辅助。
- **A3 settings.json 原子写入 + .bak 备份** `server/src/routes/settings.ts`：writeSettings 改三步——① copyFileSync 备份当前为 .bak；② 写 settings.json.tmp；③ renameSync 原子覆盖。readSettings 失败时先回退 .bak（记 warn + `wasLastReadRecovered` 标记），都失败才返回 {}。崩溃只会留下完整旧文件或完整新文件，无截断半成品。
- **A4 getAssetDir 启动期缓存** `server/src/store/db.ts`：模块级 `cachedAssetDir` 首次计算并缓存，避免每次 DB 访问重读 settings.json；新增 `invalidateAssetDir`，POST /api/settings 检测 assetDir 变更时触发重算。消除 settings 损坏级联成 DB 路径漂移。
- **A5 readAll 逐行容错** `server/src/store/db.ts`：`rows.map(JSON.parse)` 改循环 try/catch，单行坏跳过 + warn，不拖垮整库。
- **A6 启动日志增强** `server/src/index.ts`：[data-dir] 行追加 settings 是否从 .bak 恢复、assetDir 缓存值、各业务表行数概览。排查"又丢数据"第一手信息。
- **附**：db.ts 加 `PRAGMA busy_timeout = 5000`。

### Part B — 设置/备份导入导出（人工兜底）

- **B1 backup.ts 纯函数模块** `frontend/src/utils/backup.ts`：`BackupBundle` 类型（version/exportedAt/app/kind/settings/business?）+ `buildBundle`/`parseBundle`/`migrateBundle`/`summarizeBusiness`/`downloadBundle`/`readFileAsText`/`backupFilename`。normalizeProvider 抽到独立的 `frontend/src/utils/provider.ts`（纯函数无框架依赖，backup.ts 单测不再依赖 zustand/浏览器环境）。
- **B2 设置导入导出**：设置页新增「设置导入 / 导出」Card。导出含脱敏选项（providers[].apiKey 抹空）；导入走 Upload → parseBundle → 预览 Modal（providers/mapping/模式计数 + API Key 状态 + 兼容性警告）→ 确认后 setState 合并 + pushSettingsNow。
- **B3 完整备份恢复**：新增「完整备份 / 恢复」Card。备份=GET /api/store + settingsPayload → kind='full' bundle；恢复=解析 → 预览（各类业务数据计数 + 强警告）→ 二次确认（合并导入 / 先清空再恢复）。
- **B4 向后兼容（核心需求）**：parseBundle 容错策略——非 JSON 才 fatal 阻断；缺 version 当 v0；app 非 novelhelper 仅 warning；裸 settings.json（无 bundle 包装）自动适配；providers 逐条 try/catch 坏条目跳过；moduleMapping 与 seedModuleMapping 合并补全新 ModuleKey；splitPatterns 确保 custom 永在；业务数据多余键忽略、单类非数组忽略。所有非致命问题记 warnings 在预览 Modal 展示，不阻断导入。

### 前端改动

- `appStore.ts`：`deleteBook` 收集级联删除 id 走 pushDeleteNow；`deleteImage`/`resetDemo` 同理；导出 `businessPayload`/`settingsPayload`/`pushStoreNowChecked`/`pushSettingsNow` 供 backup UI 复用；normalizeProvider 移至 provider.ts。
- `settings/index.tsx`：两个新 Card + 导出脱敏 Checkbox + 导入预览 Modal（兼容性警告列表 + 业务数据计数 + 合并/清空恢复双按钮）。

### 验证全过

- 后端 typecheck ✅
- 前端 tsc --noEmit ✅（0 错误）
- 前端 tsc -b + vite build ✅（723ms，顺带修复 batch-generate 既有隐式 any：callbacks 加 BatchGenCallbacks 类型标注）
- 前端 eslint ✅（改动文件无错）
- backup-smoke.mts ✅（39 项断言全过：buildBundle/parseBundle/migrateBundle/summarizeBusiness + 圆环 + 裸 settings 适配 + 非 JSON fatal + 坏条目跳过 + 未知 app + 高版本 + 多余业务键忽略）
- smoke(23) ✅ / parse-smoke(22) ✅ / ruleclean-smoke(43) ✅ 全不回归

### 待用户实机验证

- ① 设置导出 → 故意 corrupt settings.json（改成乱码）→ 重启确认后端日志显示"settings from .bak: YES"且配置仍在
- ② 完整备份 → 清库 → 导入备份 → 确认数据完整回归
- ③ 导入旧版裸 settings.json / 缺字段文件 → 确认正常导入不报错、缺失字段补默认
- ④ deleteBook/deleteImage/resetDemo 确认正常删除（不再依赖 syncAll 反推）

