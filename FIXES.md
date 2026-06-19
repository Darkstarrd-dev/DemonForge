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
