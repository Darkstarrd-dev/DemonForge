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
