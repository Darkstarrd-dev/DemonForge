# NovelHelper - Electron 版本迁移说明

## 概述

项目已成功迁移到 Electron 框架，支持打包为独立可执行文件。Electron 主进程负责管理后端服务器（Fastify）和前端窗口，并在窗口关闭时正确清理所有进程。

## 项目结构

```
novelhelper/
├── electron/              # Electron 主进程
│   ├── main.ts           # 主入口：进程管理、窗口创建
│   └── tsconfig.json     # TypeScript 配置
├── frontend/             # React 前端（不变）
├── server/               # Fastify 后端（不变）
├── build/                # 打包资源（图标等）
├── package.json          # 根项目（Electron）
├── start-electron.bat    # 开发模式启动脚本
└── build-electron.bat    # 打包脚本
```

## 核心改动

### 1. 数据目录策略

- **开发模式**：数据存储在项目目录
  - 设置文件：`server/data/settings.json`
  - 资产数据库：`assets/novelhelper.db`（可配置）

- **生产模式**：数据存储在用户目录
  - 设置文件：`~/.novelhelper/settings.json`
  - 资产数据库：`~/.novelhelper/assets/novelhelper.db`（默认，可在设置中修改）

这样确保：
- 应用可安装到 `Program Files` 等受保护目录
- 用户数据不会随应用卸载而丢失
- 多用户环境下数据隔离

### 2. 进程管理

Electron 主进程 (`electron/main.ts`) 负责：

1. **启动流程**
   - 启动后端服务器（Fastify :8787）
   - 开发模式：启动前端开发服务器（Vite :5173）
   - 生产模式：加载前端构建产物
   - 创建应用窗口

2. **关闭流程**
   - 监听窗口关闭事件
   - 依次终止后端和前端进程（发送 SIGTERM）
   - Windows 下使用 `taskkill /T /F` 强制杀死整个进程树
   - 清理所有资源后退出应用

3. **错误处理**
   - 后端/前端启动失败时自动退出
   - 超时保护（30秒）
   - 健康检查（轮询 `/api/health`）

### 3. 后端适配

- **编译输出**：`server/tsconfig.json` 启用 `outDir: "dist"`，输出编译后的 JS 文件
- **启动脚本**：`npm start` 改为 `node dist/index.js`（生产模式）
- **路径处理**：新增 `server/src/utils/paths.ts`，根据环境动态选择数据目录

### 4. 移除旧启动方式

原有的 `start.vbs` / `launch.ps1` / `start.bat`（Chrome 应用模式启动）仍保留，但推荐使用 Electron 版本：

- **旧方式**：隐藏启动 cmd → Chrome 应用模式 → 看门狗监控
- **新方式**：Electron 原生窗口 → 原生进程管理 → 更好的用户体验

## 使用方法

### 开发模式

```bash
# 方式 1：直接运行（需要先安装依赖）
npm install
npm run dev

# 方式 2：使用批处理脚本（自动安装依赖）
start-electron.bat
```

开发模式特性：
- 自动重载（后端 tsx watch、前端 Vite HMR）
- 打开 DevTools
- 数据存储在项目目录

### 打包生产版本

```bash
# 方式 1：手动打包
npm install
npm run build        # 构建所有模块
npm run dist         # 打包为安装包/便携版

# 方式 2：使用批处理脚本（一键打包）
build-electron.bat
```

打包产物（`release/` 目录）：
- **NSIS 安装包**：`NovelHelper-Setup-0.1.0.exe`（支持自定义安装路径）
- **便携版**：`NovelHelper-0.1.0-portable.exe`（单文件，解压即用）

### 生产模式特性

- 数据存储在 `~/.novelhelper/`
- 无 DevTools（可通过菜单启用）
- 优化后的代码（更快启动、更小体积）

## 配置选项

### 打包配置（package.json）

```json
{
  "build": {
    "appId": "com.novelhelper.app",
    "productName": "NovelHelper",
    "win": {
      "target": ["nsis", "portable"],
      "icon": "build/icon.ico"
    }
  }
}
```

可调整：
- `appId`：应用唯一标识
- `productName`：显示名称
- `icon`：应用图标（需放置 `build/icon.ico`）
- `target`：打包目标（nsis、portable、zip 等）

### 自定义图标

将图标文件放置到 `build/` 目录：
- **icon.ico**（Windows）：256x256 或多尺寸
- **icon.png**（通用）：512x512

推荐工具：
- https://www.icoconverter.com/
- https://www.canva.com/

## 技术细节

### 前后端通信

- 前端通过 `http://127.0.0.1:8787/api/*` 访问后端
- 开发模式：Vite proxy 转发
- 生产模式：直接访问（后端和前端在同一应用内）

### 依赖管理

- **根项目**：Electron、electron-builder、TypeScript
- **前端**：React、Vite、Ant Design（独立 node_modules）
- **后端**：Fastify、better-sqlite3、sqlite-vec（独立 node_modules）

打包时会将后端 `node_modules` 一起打包（包括原生模块 better-sqlite3）。

### 原生模块处理

`better-sqlite3` 是原生模块，electron-builder 会自动：
1. 检测原生模块
2. 为 Electron 版本重新编译
3. 打包到最终应用中

如遇到问题，可手动重建：
```bash
cd server
npm rebuild better-sqlite3 --runtime=electron --target=33.2.1 --disturl=https://electronjs.org/headers
```

## 常见问题

### Q1: 打包后启动失败？

**检查项**：
1. 后端编译是否成功：`server/dist/index.js` 是否存在
2. 前端构建是否成功：`frontend/dist/index.html` 是否存在
3. 查看日志：`~/.novelhelper/logs/` 或控制台输出

### Q2: 原生模块加载失败？

**解决方案**：
```bash
# 清理并重新安装
cd server
rm -rf node_modules
npm install
npm rebuild
```

### Q3: 端口被占用？

修改端口：
- `electron/main.ts` 中修改 `BACKEND_PORT` / `FRONTEND_PORT`
- `server/src/index.ts` 中修改 `PORT`
- `frontend/vite.config.ts` 中修改 proxy 目标

### Q4: 想同时保留旧启动方式？

完全可以！旧启动方式仍然有效：
- `start.vbs`：单窗口启动（Chrome 应用模式）
- `start-electron.bat`：Electron 原生窗口

两者数据共享（开发模式下），可根据喜好选择。

## 后续优化建议

### 短期（可选）

1. **添加应用图标**：设计并放置 `build/icon.ico`
2. **添加启动画面**：显示加载进度
3. **托盘图标**：最小化到系统托盘
4. **自动更新**：集成 electron-updater

### 中期（增强体验）

1. **菜单栏**：文件、编辑、视图、帮助等标准菜单
2. **快捷键**：全局快捷键（显示/隐藏窗口）
3. **多窗口**：支持多作品并行编辑
4. **主题切换**：深色/浅色模式

### 长期（跨平台）

1. **macOS 打包**：添加 `.dmg` 配置
2. **Linux 打包**：添加 `.AppImage` / `.deb` 配置
3. **自动化 CI/CD**：GitHub Actions 自动构建发布

## 测试清单

- [ ] 开发模式启动（`npm run dev`）
- [ ] 后端健康检查（`http://127.0.0.1:8787/api/health`）
- [ ] 前端页面加载
- [ ] M1 文本清理流程
- [ ] M0 立项架构流程
- [ ] 设置页功能
- [ ] 窗口关闭清理（检查是否有残留进程）
- [ ] 生产模式打包（`npm run dist`）
- [ ] 安装包安装/卸载
- [ ] 便携版运行
- [ ] 数据持久化（关闭重开后数据是否保留）

## 回滚方案

如需回到旧版本（非 Electron）：
1. 使用 `start.vbs` 启动
2. 所有功能不受影响
3. 数据完全兼容

## 总结

✅ **已完成**：
- Electron 主进程创建
- 进程管理（启动/关闭/清理）
- 数据目录策略（开发/生产分离）
- 打包配置（NSIS 安装包 + 便携版）
- 开发和打包脚本

✅ **保持兼容**：
- 前后端代码几乎无改动
- 旧启动方式仍可用
- 数据格式完全兼容

✅ **用户体验提升**：
- 原生窗口（无浏览器地址栏）
- 一键启动/退出
- 可分发的独立应用

开始使用：`start-electron.bat` 🚀
