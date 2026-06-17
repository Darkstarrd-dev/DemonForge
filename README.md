# NovelHelper - 快速开始

## 🚀 立即运行

### 方式一：Electron 开发模式（推荐）

```bash
# 双击运行
start-electron.bat

# 或命令行
npm run dev
```

特点：
- ✅ 原生窗口（无浏览器地址栏）
- ✅ 自动启动前后端
- ✅ 关窗自动清理进程
- ✅ 开发调试（DevTools + HMR）

### 方式二：Chrome 应用模式（旧版）

```bash
# 双击运行
start.vbs
```

特点：
- ✅ Chrome 独立窗口
- ✅ 隐藏控制台
- ✅ 看门狗自动清理

### 方式三：打包应用（分发版本）

```bash
# 构建安装包
build-electron.bat

# 或命令行
npm run dist
```

产物：
- `NovelHelper-Setup-0.1.0.exe` - 安装包（可自定义路径）
- `NovelHelper-0.1.0-portable.exe` - 便携版（解压即用）

## 📦 首次使用

1. **安装依赖**（start-electron.bat 自动执行）
   ```bash
   npm install
   ```

2. **配置 LLM**
   - 启动应用
   - 进入「设置」页
   - 添加 LLM 提供商节点（API Key、BaseURL、Model）
   - 测试连接

3. **开始创作**
   - M0：立项·架构（雪花法构思）
   - M1：文本清理（导入 raw 文本）
   - M2-M5：设定/推演/生成/管理

## 📖 详细文档

- **ELECTRON.md** - Electron 版本完整说明
- **DESIGN.md** - 项目设计文档
- **HANDOFF.md** - 开发进度和任务
- **CLAUDE.md** - 工程约束和决策

## ❓ 常见问题

### Q: 启动失败？
检查端口占用：8787（后端）、5173（前端开发）

### Q: 关闭后进程残留？
Electron 模式会自动清理。如有残留，手动杀死 node 进程。

### Q: 数据存储位置？
- 开发模式：项目目录 `server/data/` + `assets/`
- 生产模式：用户目录 `~/.novelhelper/`

## 🛠️ 技术栈

- **Electron** 33.2.1 - 桌面应用框架
- **React** 19.2.6 - 前端框架
- **Fastify** 5.2.0 - 后端服务器
- **SQLite** + sqlite-vec - 数据存储 + RAG 检索
- **Ant Design** 6.4.3 - UI 组件库

## 📊 项目状态

✅ **novel-generator 集成完成**（阶段 A~D）
✅ **Electron 迁移完成**（打包 + 进程管理）
🚧 M2/M3 仍为 mock（待后续真实化）

---

开始使用：`start-electron.bat` 🎉
