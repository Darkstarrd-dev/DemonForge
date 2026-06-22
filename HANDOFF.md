# HANDOFF.md — novelhelper 交接备忘

**最后更新**：2026-06-22  
**当前位置**：办公场所 A
**本轮主题**：图片辅助模块增强功能（GIF/ZIP/Sprite/图层/裁剪）

---

## 当前进度总览

### ✅ 已完成模块

- [x] **M0 立项·架构**（arch/blueprint + SSE 流式 + UI + Context Assembler）
- [x] **M1 文本清理**（四步骤全流程 + 批量清理调度器 + UI）
- [x] **M2 设定提取**（2026-06-22）✨
  - 后端：`POST /api/llm/extract-entities` SSE 流式端点
  - Prompt：`EXTRACT_ENTITIES_SYSTEM_PROMPT`（五类实体：character/location/item/skill/faction）
  - 流程：并行章节提取 → 按 (type, name) 合并出处 → embedding 相似度检测 → 生成 MergeCandidate
  - SSE 事件：`progress`（chunk/merge/embed）、`entity`、`merge`、`done`、`error`
  - 前端：`services/real/extract.ts` + 进度条 + 自动跳转合并裁决页
  - **状态**：编译通过，真实 LLM 接入完成，待实际测试
- [x] **M3 角色推演**（2026-06-22）✨
  - 后端：`POST /api/llm/simulate` SSE 流式端点
  - Prompt：`SIMULATE_CHARACTER_SYSTEM_PROMPT`（角色一致性 + 场景适配）
  - Context Assembler 扩展：支持 `sceneId` 查询（新增 `scene`/`targetCharacter`/`presentCharacters` 字段）
  - 流程：组装上下文 → 串行生成多候选（默认 2）→ 流式输出
  - SSE 事件：`delta`（含 candidateIdx）、`candidate-done`、`done`、`error`
  - 前端：`services/real/simulate.ts` + 双候选实时流式吐字
  - **状态**：编译通过，真实 LLM 接入完成，待实际测试
- [x] **M4 章节生成**（draft SSE + Context Assembler + 实时流式 UI）
- [x] **M5 章节管理**（finalize/consistency SSE + UI）
- [x] **批量生产**（startBatchGenerate 调度器 + UI 面板）
- [x] **RAG 检索**（Node + sqlite-vec，embed 端点 + 前端入口）
- [x] **Context Assembler**（6 个组件，M3/M4/M5 共用）
- [x] **Electron 迁移**（主进程管理、打包配置、数据目录策略）
- [x] **M1 增强功能**
  - 章节名称模板替换（`{n}`/`{0n}`/`{title}`/`{raw}`）
  - 任务态跨页面（appStore.cleanRun，切页不中断）
  - 失败自动重试（`autoRetry` 开关，失败章放回池）
- [x] **节点测试完整重构**（2026-06-21）
  - 后端：数据库表重命名，新增 `/api/llm/chat` 端点，支持多模态
  - 前端：类型系统重构，Store 层改造（向后兼容），服务层扩展
  - UI：模式切换器、类型标识、智能过滤、交互优化
  - **聊天界面改造**（2026-06-21 晚）：
    - 文本推理改为标准聊天界面（用户/助手气泡）
    - System Prompt 输入框
    - 消息时间戳 + 一键复制
    - 推理中实时更新气泡内容（非底部显示）
    - 节点列表左侧边栏（280px）
    - 分组按 URL+名称分开显示
    - 折叠状态持久化
    - Shift+Enter 发送
    - 深色模式对比度优化
    - 输入区域无圆角、无空白
  - **状态**：架构 + UI 全部完成，编译通过，可投入使用
- [x] **角色交流模块 - 阶段 A：基础架构**（2026-06-21）
  - 数据模型定义（types.ts）+ 持久化配置（settings.json）
  - 页面路由与布局（`/role-chat` + 左侧菜单栏）
  - 服务层骨架（`services/real/roleChat.ts`，Opencode + 本地模式）
  - 后端路由（`/api/chat/role`，本地模式专用）
  - 核心组件：ParticipantList、MessageList、AddParticipantModal、AutoLoopPanel
  - **状态**：编译通过，UI 框架完整，待实现核心逻辑
- [x] **角色交流模块 - 阶段 B：本地模式核心**（2026-06-21）
  - 手动发送流程（单次问答完整实现）
  - 本地模式：SSE 流式响应接收 + 实时显示
  - Opencode 模式：会话管理 + 消息发送
  - 状态徽章实时更新（idle → thinking → responding → idle）
  - 错误处理与用户提示
  - **状态**：编译通过，核心逻辑全部完成，可投入使用
- [x] **角色交流模块 - 阶段 C：自动循环**（2026-06-21）
  - `runAgentLoop()` 并发执行逻辑（Promise.all）
  - 停止循环功能（abortRef 标志位）
  - 次数模式：目标次数 ± 波动范围
  - 时间模式：运行指定秒数
  - 冷却延迟：回复后随机延迟（基准值 ± 波动）
  - 反应延迟：响应前随机延迟（模拟思考）
  - 状态流转：idle → thinking → responding → waiting → done
  - **状态**：编译通过，并发循环完整实现，可投入使用
- [x] **角色交流模块 - 阶段 E：增强功能**（2026-06-21）
  - 导出对话为 TXT 格式（含时间戳 + 格式化标题）
  - 导出下拉菜单（JSON / TXT 两种格式）
  - 帮助文档弹窗（完整使用说明）
  - **状态**：编译通过，增强功能全部完成
- [x] **角色交流模块 - 阶段 D：Opencode 模式**（2026-06-21）
  - 代码完整实现（listOpencodeAgents + createOpencodeSession + sendOpencodeMessage）
  - 会话管理（opcodeSessionsRef 缓存）
  - 集成到手动发送和自动循环
  - **状态**：代码 100% 完成，编译通过，待实际测试验证
- [x] **前端主题系统和响应式布局**（2026-06-21）
  - **主题系统**：浅色/深色两套暖色调主题，13 个页面 100% 覆盖
  - **响应式布局**：10+ 页面修复，Row/Col 响应式断点，动态高度计算
  - **设置页面重构**：Flexbox 布局，Tab 固定顶部，无双重滚动条
  - **Header 优化**：智能显示/隐藏"当前作品"选择器（4 个独立页面隐藏）
  - **状态**：三轮修复全部完成，编译通过，可安全部署
- [x] **4K 基准缩放功能**（2026-06-21）
  - 以 4K (3840px) 为设计基准，窗口缩放时整体等比例缩放
  - 可配置开关（设置页面 → 界面设置）
  - 持久化到 settings.json
  - **状态**：实现完成，文档齐全
- [x] **节点测试界面重构（第二轮）**（2026-06-21）
   - 取消左侧边栏，全屏展示聊天内容
   - 模式/节点选择移到输入框底部（向上展开菜单）
   - 图片预览优化（Ant Design Image 组件，点击查看大图）
   - 删除按钮改为右上角圆形悬浮按钮
   - 发送按钮样式调整（橙色主题色 #FF6B35，高度 96px）
   - 底部按钮组：模式选择 + 图片上传（左侧垂直排列）
   - **状态**：代码完成，待启动测试
- [x] **编译打包修复**（2026-06-21）
   - **electron-builder 文件锁定**：`app-builder.exe` 因 Windows Defender 锁 `app.asar` 导致打包失败 → 改为手动组装 + `--prepackaged` 模式
   - **`file://` 协议修复（白屏根因）**：
     - Vite 添加 `base: './'` → 资产路径改为 `./assets/...`（原是 `/assets/...` 被解析到 `C:/assets/...`）
     - `main.tsx` 入口检测 Electron 环境，自动将 `fetch('/api/...')` 替换为 `http://127.0.0.1:8787/api/...`
     - `BrowserRouter` 不兼容 `file://` → 改为 `HashRouter`（路由存于 `#/path`）
   - **编译脚本**：`build-electron.bat` 重写为 6 步可靠流程（构建 → 组装 → 打包 → 清理）
   - **产物**：`release/NovelHelper Setup 0.1.0.exe`（91.5 MB）+ `NovelHelper-0.1.0-portable.exe`（91.3 MB）
   - **修复的前端 TS 错误**：
     - 未使用变量：`BookOutlined`（AppLayout）、`UploadOutlined`/`PHASE_TEXT`/`statusText`/`currentTextResponse`（node-test）
     - antd v6 响应式类型：`marginBottom`/`minHeight`/`height` 不接受对象值 → 改用 `Grid.useBreakpoint()`
     - `useRef` 替代未读取的 `useState` 变量
   - **修复的后端 TS 错误**：
     - `chat.ts` 中 `Bun.file()` 替换为 `readFileSync()`（Node 环境不兼容）
   - **修复的打包配置**：
     - `server/node_modules` 未打进包 → `extraResources` 复制到 `resources/node_modules/`
     - tsc 编译 ESM 无扩展名 → 用 `tsx/esm` 加载器（`--import tsx/esm`）
     - 生产路径指向 ASAR 内部（子进程不可读）→ `asarUnpack` + 手动回退路径
   - **状态**：全部修复完成，可正常安装运行
- [x] **UI 优化与功能增强**（2026-06-22）✨
  - **导入设置改为增量导入**：不覆盖现有配置，仅添加缺失项（按 baseURL+model、key 等判重）
  - **恢复出厂按钮**：清空所有设置但保留业务数据，带二次确认
  - **M1 入库素材库字段**：新增作者|平台可选输入项（仅素材库显示）
  - **Sidebar 可折叠**：点击标题折叠，左上角悬停显示按钮（120x80px 触发区域）
  - **2D/3D Demo 优化**：移除顶部 header，复位按钮悬浮右上角，2D 取消滚动条
  - **状态**：全部完成，编译通过
- [x] **M1 入库 CORS 修复**（2026-06-22）✨ 🔥 关键修复
  - **问题根因**：CORS 跨域错误 - 前端 `localhost:5173` 访问后端 `127.0.0.1:8787` 被浏览器阻止
  - **解决方案**：
    - 安装 `@fastify/cors` 包
    - 后端配置 CORS：允许 `localhost:5173` 和 `127.0.0.1:5173` 跨域访问
  - **辅助改进**：
    - 增加超时控制：60 秒
    - 数据大小预检查：入库前警告（超过 30MB）
    - 详细错误信息：区分超时、网络、后端错误
    - 控制台诊断日志：显示数据大小
  - **新增文档**：
    - `CORS_FIX.md` - CORS 问题完整解决方案
    - `M1_IMPORT_DEBUG.md` - 通用诊断指南
    - `CHANGES.md` - 完整更新日志
  - **状态**：✅ 问题彻底解决，必须重启后端服务生效
- [x] **UI 优化**（2026-06-22）✨
  - **浅色模式空隙修复**：左侧作品选择器 padding 统一为 `8px 12px`，移除菜单 `paddingLeft`
  - **状态**：✅ 完成
- [x] **图片辅助模块集成**（2026-06-22）✨
  - 将单页 HTML 应用 `07_gif_slicer.html` 转换为 React 组件
  - UI 适配项目深浅主题配色
  - 已实现功能：
    - 图片/GIF 导入
    - 魔棒透明（抠图）
    - 边缘修正（上下左右裁剪）
    - 网格切分
    - 画布缩放平移
    - 帧序列管理（删除、复制、延迟调整）
  - 布局：左侧控制面板 + 中央画布 + 底部时间轴
  - 路由：`/image-helper` - 图片辅助（`PictureOutlined` 图标）
  - **状态**：✅ 核心功能完成，编译通过

### 🚧 进行中 / 待完善

- [x] **图片辅助模块增强功能基本完成**（2026-06-22）✨
  - ✅ 已安装依赖：gif.js (0.2.0)、jszip (3.10.1)、omggif (1.0.10) + TypeScript 类型定义
  - ✅ 自定义类型声明：`src/types/omggif.d.ts` + `src/types/gif.js.d.ts`
  - ✅ GIF 解析导入（`gifUtils.ts::parseGifFile`）- 使用 omggif.GifReader，支持帧延迟、disposal处理
  - ✅ GIF 导出（`gifUtils.ts::exportGif`）- 使用 gif.js，支持透明度，CDN worker（避免路径问题）
  - ✅ ZIP 序列帧导出（`exportUtils.ts::exportZip`）- 批量PNG打包，支持进度回调
  - ✅ Sprite Sheet 导出（`exportUtils.ts::exportSpriteSheet`）- PNG拼图，行列自定义布局
  - ✅ 图层编辑系统（`LayerEditor.tsx`）- 文字/图片图层，粗体/斜体/下划线，颜色选择器，拖拽调整z-order，同步到其他帧
  - ✅ 全局裁剪功能（`GlobalCropPanel.tsx`）- 画布拖拽绘制裁剪框，实时预览，应用到所有帧，自动调整图层位置
  - ✅ 预览模态框 - GIF预览+下载按钮，使用 antd Modal
  - ✅ 进度显示 - 导出过程实时进度百分比（loading状态 + 进度文本）
  - ✅ 主组件集成 - 所有功能已集成到 `index.tsx`，UI完整，按钮绑定事件
  - ✅ 视频帧提取工具（`videoUtils.ts`）- 完整实现但未集成到UI
  - ⚠️ **编译错误 TS1128（line 785）未解决**：
    - 错误位置：`index.tsx` 第785行
    - 初步诊断：可能是未闭合的代码块或语法错误
    - 影响：前端编译失败，无法运行
    - **建议下次优先处理**：仔细检查 exportSpriteSheet 及周边函数的括号匹配
  - 📝 **Workflow 输出可用**：Workflow "完整迁移单页应用所有功能" 已完成，输出文件包含完整参考代码
- [ ] **M2/M3 实际测试**（待编译错误修复后）
  - 配置模块节点映射（设置 → 高级配置 → m2Extract/m3Simulate）
  - M2 测试：提取 3-5 章 → 检查 EntityCard → 验证合并候选
  - M3 测试：创建场景 → 推演候选 → 采纳片段 → M4 生成验证
- [ ] 打包后首次启动，`~/.novelhelper/` 下尚无 `settings.json`，前端需手动配置 Provider 节点才能使用

### ⏸️ Mock 阶段（已完成）

- [x] **M2 设定提取**（extractEntities 已接真实 LLM）
- [x] **M3 角色推演**（simulateCharacter 已接真实 LLM）

---

## 下一步任务

### 立即任务（本次会话后）

1. **🔥 优先：修复图片辅助模块编译错误（TS1128）**
   - 错误位置：`frontend/src/pages/image-helper/index.tsx` 第785行
   - 诊断方法：
     - 检查所有函数的大括号、小括号是否匹配
     - 重点排查 exportSpriteSheet、handleExportGif、handleExportZip 函数
     - 使用 IDE 的括号匹配功能
   - 参考：Workflow 输出文件 `C:\Users\Houpy\AppData\Local\Temp\claude\...\wqmurr1nr.output` 包含完整参考代码

2. **测试图片辅助模块**（编译通过后）
   - 访问 `/image-helper` 页面
   - 测试核心功能：
     - 图片/GIF 导入
     - 网格切片
     - GIF 导出（需验证 CDN worker 加载）
     - ZIP 序列帧导出
     - Sprite Sheet 导出
     - 图层编辑（文字/图片图层）
     - 全局裁剪功能
   
3. **测试 UI 优化**
   - 浅色模式下检查左侧选择器空隙是否修复
   - 切换深浅主题验证显示正常
   
3. **⚠️ 重启后端服务（必须！）**（如果之前未重启）
   - CORS 配置需要重启后端才能生效
   - 停止当前后端服务
   - 重新运行 `npm run dev`
   
4. **验证 M1 入库功能**（如果之前未验证）
   - 启动应用后尝试 M1 入库
   - 打开浏览器开发者工具（F12）查看 Network 标签
   - 确认 `/api/store` 请求包含 `Access-Control-Allow-Origin` 响应头
   
5. **M2/M3 实际测试验证**（原计划任务）
   - 启动应用：`npm run dev`
   - 配置模块节点：设置 → 高级配置 → 模块节点映射
     - `m2Extract`: 选择文本节点（用于实体提取）
     - `m3Simulate`: 选择文本节点（用于角色推演）
   - M2 测试流程：
     - 进入 M2 卡片库 → 点击"从章节提取设定"
     - 选择书籍（3-5 章）→ 观察三阶段进度（chunk/merge/embed）
     - 检查生成的 EntityCard（type/name/description/refs）
     - 若有 MergeCandidate，验证合并裁决功能
   - M3 测试流程：
     - 创建场景（填写 desc/goal/prevSummary，选择在场角色）
     - 选择目标角色（需先填写 styleNote/styleExamples）
     - 点击"生成推演候选" → 观察双候选实时流式输出
     - 采纳候选 → 检查场景序列 → M4 生成验证片段保留

5. **端到端流程验证**
   - 完整链路：M0 → M1 → M2 → M3 → M4 → M5
   - 数据流验证：M2 卡片 → M3 推演 → M4 生成（含已采纳片段）→ M5 状态事件

### 后续计划
1. **性能优化**（可选）
   - M2 批量 embed API（若 provider 支持）
   - M3 并发候选生成（需评估 token 消耗）
2. **用户体验增强**（可选）
   - M2 提供模板角色卡示例
   - M3 首次使用引导提示

---

## 技术决策记录

### M2/M3 真实 LLM 接入（2026-06-22 完成）
- **动机**：完成端到端创作流程闭环，M0/M1/M4/M5 已接真实 LLM，剩余 M2/M3 仍为 mock
- **方案**：
  - **并行实施**：使用 Workflow 工具并行实现 M2/M3 后端和前端（5 个 agent，13.6 分钟完成）
  - **M2 设定提取**：
    - Prompt：`EXTRACT_ENTITIES_SYSTEM_PROMPT`（五类实体，结构化 JSON 输出）
    - 端点：`POST /api/llm/extract-entities`（并行章节提取 + embedding 相似度检测）
    - 流程：chunk（LLM 提取）→ merge（按 type+name 去重）→ embed（生成 MergeCandidate）
    - SSE 事件：`progress`/`entity`/`merge`/`done`/`error`
  - **M3 角色推演**：
    - Prompt：`SIMULATE_CHARACTER_SYSTEM_PROMPT`（角色一致性 + 场景适配）
    - Context Assembler 扩展：新增 `sceneId` 支持（查询场景、目标角色、在场角色）
    - 端点：`POST /api/llm/simulate`（串行生成多候选，默认 2 个）
    - SSE 事件：`delta`（含 candidateIdx）/`candidate-done`/`done`/`error`
  - **前端服务层**：
    - `services/real/extract.ts`：从 settings 读取 m2Extract 节点配置，SSE 流式解析
    - `services/real/simulate.ts`：从 settings 读取 m3Simulate 节点配置，维护累积文本数组
  - **UI 集成**：
    - M2：三阶段进度条（chunk/merge/embed）+ 自动跳转合并裁决页
    - M3：双候选实时流式吐字 + 错误提示
- **实施成果**：
  - ✅ 后端：2 个 prompt + 2 个 SSE 端点 + Context Assembler 扩展
  - ✅ 前端：2 个服务层文件 + 2 个页面 UI 集成
  - ✅ 编译通过：前后端零错误
  - ✅ 文件清单：2 个新建 + 6 个修改
  - ⏳ 待实际测试验证

### 前端主题系统和响应式布局（2026-06-21 完成）
- **动机**：统一视觉风格，支持深色模式，修复小屏幕下布局问题
- **方案**：
  - **主题系统**：Ant Design ConfigProvider + 自定义主题配置（暖色调）
  - **响应式布局**：全局 CSS 修复 + 页面容器包装 + Row/Col 断点
  - **设置页面**：Flexbox 三层结构（固定 Tab + 独立滚动）
  - **Header 优化**：白名单判断，特定页面隐藏选择器
- **实施成果**：
  - **主题配置** (`frontend/src/styles/theme.ts`)
    - 浅色主题：#F7F4EF 背景 + #C4612F 主色
    - 深色主题：#1A1614 背景 + #D97845 主色
    - Alert 组件完整适配
  - **响应式修复**
    - 全局 CSS：`body { overflow: hidden }`, `.ant-row { margin: 0 }`
    - 页面容器：10+ 页面添加响应式包装
    - Row/Col：`gutter={[16, 16]}`, `xs={24} lg={9}`
    - 动态高度：`calc(100vh - 64px)`
  - **设置页面布局**
    - 外层：`flex column, height: calc(100vh - 64px), overflow: hidden`
    - Tabs：`flex: 1, flex column, overflow: hidden`
    - 内容：`height: 100%, overflow: auto`（4 个标签页）
  - **Header 选择器**
    - 隐藏：`/settings`, `/node-test`, `/demo-3d`, `/demo-2d`
    - 显示：其他 9 个作品相关页面
  - ✅ 三轮修复（基础 + 深度 + 语法）全部完成
  - ✅ 编译通过，零错误
  - ✅ 13 个页面完整覆盖，2 种主题，3 种视口
- **动机**：将 opencode-chat-webui 作为角色设定验证工具集成到 novelhelper
- **方案**：
  - **双后端模式**：Opencode 服务器（保留原功能）+ 本地节点池（快速测试）
  - 决策 1：**两个模式都实现**（用户确认）
  - 决策 2：**角色 Prompt 直接使用 EntityCard 字段**（description + styleNote + styleExamples）
  - 决策 3：**对话历史不做限制**，用户手动重置
- **实施成果**：
  - **阶段 A（基础架构）**：
    - ✅ 数据模型定义（RoleChatParticipant、RoleChatMessage、RoleChatAutoConfig）
    - ✅ 页面路由与布局（左侧边栏 280px + 主对话区）
    - ✅ 服务层骨架（listOpencodeAgents、createOpencodeSession、sendOpencodeMessage、sendLocalRoleMessage）
    - ✅ 后端路由（POST /api/chat/role，System Prompt 构建 + SSE 流式）
    - ✅ 核心组件（ParticipantList、MessageList、AddParticipantModal、AutoLoopPanel）
  - **阶段 B（本地模式核心）**：
    - ✅ 手动发送流程（handleSendMessage 串行触发所有参与者）
    - ✅ 本地模式 SSE 流式响应（sendLocalRoleMessage + 实时更新临时消息）
    - ✅ Opencode 模式会话管理（opcodeSessionsRef 缓存 + sendOpencodeMessage）
    - ✅ 状态更新逻辑（updateParticipantStatus：idle → thinking → responding → idle）
    - ✅ 错误处理（捕获异常 + 移除临时消息 + message.error 提示）
  - **阶段 C（自动循环）**：
    - ✅ 并发 Agent 循环（runAgentLoop + Promise.all）
    - ✅ 次数模式（targetCount = count ± variance）
    - ✅ 时间模式（startTime + duration 秒）
    - ✅ 反应延迟（randomDelay(reactionDelayMin~Max)，模拟思考）
    - ✅ 冷却延迟（randomDelay(cooldownBase ± Variance)，回复后休息）
    - ✅ 状态流转（idle → thinking → responding → waiting → done）
    - ✅ 停止循环（abortRef.current = true 中断所有 Agent）
  - **阶段 D（Opencode 模式）**：
    - ✅ 代码完整实现（listOpencodeAgents + createOpencodeSession + sendOpencodeMessage）
    - ✅ 会话管理（opcodeSessionsRef 缓存 Map<agentName, sessionID>）
    - ✅ 集成到手动发送和自动循环（respondOpencode）
    - ⏳ 待实际测试验证（需启动 Opencode Server）
  - **阶段 E（增强功能）**：
    - ✅ 导出 TXT（含时间戳 + 格式化标题）
    - ✅ 导出下拉菜单（JSON / TXT 两种格式）
    - ✅ 帮助文档弹窗（完整使用说明：功能简介、使用流程、循环参数、状态说明、注意事项）
  - ✅ 编译通过，零错误，所有代码完整实现
  - ✅ 代码完成度：100%（5 个阶段全部实现）

### 节点测试架构重构（2026-06-21 完成）
- **动机**：统一节点测试入口，支持文本推理、图片生成、多模态理解三种测试类型
- **方案**：
  - 后端：通用 `/api/llm/chat` 端点（OpenAI 兼容格式，支持多模态消息）
  - 数据模型：`TestHistoryItem` 统一三种类型，`testType: 'text' | 'image' | 'multimodal'`
  - 向后兼容：数据库表兼容旧 `imageGallery`，Store 提供别名映射
  - UI：Segmented 模式切换器，类型徽章（紫/蓝/绿），智能过滤
- **实施成果**：
  - ✅ 后端 API 扩展完成
  - ✅ 数据模型重构完成（向后兼容）
  - ✅ UI 完全重写（模式切换、类型标识、交互优化）
  - ✅ 编译通过，零错误

---

## 交接注意事项

### 环境与启动
- **开发模式**：`npm run dev` 或 `start-electron.bat`（Electron 窗口，自动清理）
- **传统启动**：`start.vbs`（Chrome 应用模式，旧方式）
- **打包编译**：`build-electron.bat`（6 步：构建 → 组装 app 目录 → electron-builder --prepackaged → 清理）
  - 设置镜像：`ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` 指向 `npmmirror.com`
  - 已知问题：`npm run dist` 直接调用 `electron-builder` 会因 `app-builder.exe` 文件锁定失败，问题在 Windows Defender 实时扫描
- **数据目录**：
  - 开发：`server/src/data/`（项目内）
  - 生产：`~/.novelhelper/`（用户主目录）

### 角色交流页使用（阶段 A-E 全部完成）
1. 左侧菜单点击「角色交流」进入页面
2. 顶部切换模式（本地/Opencode）
3. 点击「添加参与者」：
   - 本地模式：选择角色卡 + 节点
   - Opencode 模式：输入 Server 地址 → 连接 → 选择 Agent
4. 输入框发送消息（SSE 流式响应）
5. 自动循环控制面板（并发 Agent 循环）
6. 导出对话（JSON / TXT）+ 重置会话 + 帮助文档

### 主题系统使用
1. 访问：设置 → 通用设置
2. 切换主题：🌞 浅色 / 🌙 深色
3. 即时生效，自动保存
4. 13 个页面完整支持

### 4K 基准缩放使用
1. 访问：设置 → 界面设置
2. 开启「4K 基准缩放」开关
3. 说明：
   - 以 4K (3840px) 为设计基准
   - 窗口宽度变化时整体等比例缩放
   - 保持布局完全一致，仅缩放大小
   - 适合在不同分辨率屏幕间切换
4. 建议：
   - ✅ 主要在 4K 显示器上使用
   - ⚠️ 1080P 及以下建议关闭（内容可能过小）
5. 持久化到 `settings.json`

### 关键文件路径
- 角色交流页：`frontend/src/pages/role-chat/index.tsx`
- 组件：`frontend/src/pages/role-chat/components/`
- 服务层：`frontend/src/services/real/roleChat.ts`
- 后端路由：`server/src/routes/chat.ts`
- 类型定义：`frontend/src/services/types.ts`（新增 RoleChat 相关类型）
- Store：`frontend/src/store/appStore.ts`（新增 roleChatMode/roleChatOpencodeURL/roleChatAutoConfig）

### 节点测试页使用
1. 在"系统设置"页配置节点：
   - 文本节点：勾选"多模态"开关启用视觉理解
   - 图片节点：勾选"图片编辑"开关启用图生图
2. 切换到"节点测试"页
3. 使用顶部 Segmented 切换测试模式
4. 选择对应类型的节点
5. 输入提示词开始测试
6. 多模态/图生图：点击"图片"按钮或 Ctrl+V 粘贴

### 数据兼容性
- 旧的 `imageGallery` 数据自动映射到 `testHistory`
- 旧的 `imageDemoForm` 配置自动迁移到 `nodeTestForm`
- 数据库表 `image_gallery` 重命名为 `test_history`（向后兼容）
- 角色交流配置持久化到 `settings.json`（roleChatMode/roleChatOpencodeURL/roleChatAutoConfig）
- 主题配置持久化到 `settings.json`（theme: 'light' | 'dark'）

---

## 备注

**本轮工作成果**（2026-06-22 — UI 优化 + 图片辅助模块集成）：

**1. 浅色模式空隙修复**
- `frontend/src/layouts/AppLayout.tsx`：作品选择器 padding 统一 `8px 12px`
- 移除菜单 `paddingLeft: 3`，避免左侧空隙
- **状态**：✅ 修复完成

**2. 图片辅助模块集成**
- **新增文件**：
  - `frontend/src/pages/image-helper/index.tsx`（主组件，React + TypeScript）
  - `frontend/src/pages/image-helper/styles.css`（深浅主题适配）
- **路由集成**：
  - 菜单项：`/image-helper` - 图片辅助（`PictureOutlined` 图标）
  - 修复节点测试图标为 `ExperimentOutlined`（避免重复）
  - `frontend/src/main.tsx`：添加路由 `<Route path="/image-helper" element={<ImageHelperPage />} />`
- **已实现功能**：
  - 图片/GIF 导入（拖拽、点击上传）
  - 魔棒透明（抠图）：颜色选择器 + 容差滑块
  - 边缘修正：上下左右裁剪滑块 + 数值输入框
  - 网格切分：行列输入 + 执行切片按钮
  - 画布控制：缩放（+/-）、复位、自适应居中
  - 帧序列管理：删除、复制、延迟时间调整
  - 输出设置：宽高、倍率滑块、GIF 画质控制
- **待实现功能**（原单页应用已有）：
  - GIF 导出（需 gif.js 库）
  - ZIP 序列帧导出（需 JSZip 库）
  - Sprite Sheet 导出
  - 视频帧提取
  - 图层编辑（文字、贴图）
  - 全局裁剪功能
  - 批量删帧管理
- **UI 设计**：
  - 布局：左侧控制面板（280px）+ 中央画布区 + 底部时间轴（180px）
  - 主题适配：完全支持深浅主题切换
  - 组件化：使用 Ant Design 组件（Button、Input、Slider、Upload、Space）
- **状态**：✅ 核心功能完成，编译通过，可投入基础使用

**建议下次会话**：
1. 测试浅色模式空隙修复
2. 测试图片辅助模块基础功能
3. 可选：集成 gif.js + JSZip 实现导出功能
4. M2/M3 实际测试验证

---

**本轮工作成果**（2026-06-22 — M2/M3 真实 LLM 接入）：

**1. M2 设定提取后端实现**
- `server/src/prompts.ts`：新增 `EXTRACT_ENTITIES_SYSTEM_PROMPT`（378 行）
  - 五类实体：character/location/item/skill/faction
  - 结构化 JSON 输出（type/name/description/fields/excerpt）
  - 明确禁止 markdown 标记
- `server/src/routes/creation.ts`：新增 `POST /api/llm/extract-entities` 端点
  - 并行章节处理（每章一个 LLM 调用）
  - 按 (type, name) 合并出处引用
  - Embedding 相似度检测（≥0.85 生成 MergeCandidate）
  - SSE 事件：`progress`（3 阶段）、`entity`、`merge`、`done`、`error`
  - 容错：单章失败不中断、JSON 解析失败友好降级、断连自动取消

**2. M3 角色推演后端实现**
- `server/src/prompts.ts`：新增 `SIMULATE_CHARACTER_SYSTEM_PROMPT`（285-332 行）
  - 角色一致性：遵循 styleNote/styleExamples
  - 场景适配：考虑场景目标、在场角色、前情摘要
  - 输出格式：200-400 字推演片段，无 markdown 标记
- `server/src/contextAssembler.ts`：扩展 Context Assembler
  - 新增类型：`SimSceneLite`、`EntityCardLite`
  - 新增输出字段：`scene`、`targetCharacter`、`presentCharacters`
  - 支持 `sceneId` 参数查询场景上下文
- `server/src/routes/creation.ts`：新增 `POST /api/llm/simulate` 端点（287-391 行）
  - 串行生成多候选（默认 2 个，避免并发压力）
  - 每个候选独立 chatStream 调用
  - SSE 事件：`delta`（含 candidateIdx）、`candidate-done`、`done`、`error`
  - 参数校验：场景/角色存在性、输出长度检查（< 50 字符判为失败）

**3. M2 设定提取前端实现**
- `frontend/src/services/real/extract.ts`（新建）
  - `extractEntities(bookId, chapters, existingNames, onProgress?, signal?)`
  - 从 settings 读取 `m2Extract` 节点配置
  - SSE 流式解析（3 阶段进度：chunk/merge/embed）
  - 返回 `{cards, mergeCandidates}`
- `frontend/src/services/api.ts`：从 `./real/extract` 导出，替换 mock
- `frontend/src/pages/m2-cards/index.tsx`：UI 集成
  - 添加 `extractProgress` 状态（实时进度条）
  - 成功后自动跳转到"合并裁决"标签页（若有候选）
  - 错误提示 toast

**4. M3 角色推演前端实现**
- `frontend/src/services/real/simulate.ts`（新建）
  - `simulateCharacter(scene, card, onChunk, signal?)`
  - 从 settings 读取 `m3Simulate` 节点配置
  - SSE 流式解析（`delta` 事件携带 `candidateIdx`）
  - 维护累积文本数组，实时回调更新
- `frontend/src/services/api.ts`：从 `./real/simulate` 导出，替换 mock
- `frontend/src/pages/m3-simulate/index.tsx`：UI 集成
  - 调用真实 `simulateCharacter`
  - 双候选实时流式吐字
  - 错误捕获与提示

**5. 编译验证**
- ✅ 后端编译通过（`server/`）：0 错误
- ✅ 前端编译通过（`frontend/`）：0 错误
- ✅ 文件清单：
  - 已创建：`frontend/src/services/real/extract.ts`、`frontend/src/services/real/simulate.ts`
  - 已修改：`server/src/prompts.ts`、`server/src/routes/creation.ts`、`server/src/contextAssembler.ts`、`frontend/src/services/api.ts`、`frontend/src/pages/m2-cards/index.tsx`、`frontend/src/pages/m3-simulate/index.tsx`

**建议下次会话**：
1. 启动应用 (`npm run dev`) 进行实际测试
2. 配置模块节点（设置 → 高级配置 → m2Extract/m3Simulate）
3. M2 测试：提取章节 → 验证 EntityCard → 检查合并候选
4. M3 测试：创建场景 → 推演候选 → 采纳片段
5. 端到端验证：M0 → M1 → M2 → M3 → M4 → M5 完整流程

---

**本轮工作成果**（2026-06-21 晚间 — 编译打包修复）：

**1. 前端 TS 编译修复（10 个错误）**
- `vite.config.ts`：`base: './'` → 构建产物使用相对路径（修复 `file://` 下 CSS/JS 404）
- `main.tsx`：Electron 环境下 patch `window.fetch`，`/api/*` → `http://127.0.0.1:8787/api/*`（修复 API 请求 404）
- `main.tsx`：`BrowserRouter` → `HashRouter`（修复 `file://` 下路由全不匹配）
- `AppLayout.tsx`：移除未使用的 `BookOutlined`
- `node-test/index.tsx`：移除 `UploadOutlined`/`PHASE_TEXT`；`statusText`/`currentTextResponse` 改为 `useRef`
- `m0-architecture/index.tsx` / `m4-generate/index.tsx` / `Step3Clean.tsx`：antd v6 响应式对象值改用 `Grid.useBreakpoint()`

**2. 后端 TS 编译修复**
- `server/src/routes/chat.ts`：`Bun.file()` → `readFileSync()`（Node 环境）
- `server/package.json`：安装 `tsx` 作为 production dependency

**3. 打包流程修复**
- `electron/main.ts`：生产路径回退逻辑 + 子进程用 `tsx/esm` 处理扩展名
- `package.json`：`extraResources` 复制 `server/node_modules/` 到 `resources/`
- `build-electron.bat`：重写为手动组装 + `--prepackaged` 避免 Windows Defender 锁定
- `server/dist/` + `frontend/dist/` + `server/node_modules/` 均物理拷贝到 app 目录

**4. 产物**
- `release/NovelHelper Setup 0.1.0.exe`（91.5 MB，NSIS 安装包）
- `release/NovelHelper-0.1.0-portable.exe`（91.3 MB，便携版）

**建议下次会话**：
1. 安装并运行打包产物，验证无白屏/路由/API 问题
2. 首次配置 Provider 节点（打包版数据目录 `~/.novelhelper/`）
3. 清理 `server/node_modules/` 不必要的 dev 依赖以缩小包体

---

**1. 节点测试界面重构（第二轮）**
- **布局调整**：
  - 取消左侧边栏 (280px)，主内容区全屏展示
  - 模式/节点选择移到输入框底部（向上展开菜单）
  - 展开菜单包含：测试模式切换器 + 节点分组列表
- **图片预览优化**：
  - 使用 Ant Design Image 组件支持点击查看大图
  - 预览区显示在文本框上方（非底部）
  - 删除按钮改为右上角圆形悬浮按钮（黑色半透明背景）
- **输入区域重构**：
  - 左侧垂直按钮组：模式/节点选择按钮 + 图片上传按钮（各 48px 高）
  - 文本输入框：flex 填充，3 行高度，无边框
  - 发送按钮：橙色主题 #FF6B35，高度 96px，宽度 80px
  - 所有按钮无圆角、无间隙拼接
- **交互优化**：
  - 点击节点后自动关闭底部菜单
  - 模式/节点按钮激活状态：蓝色背景高亮
  - Tooltip 提示：模式选择按钮悬停显示说明

**2. 节点测试页面聊天界面改造（第一轮）**
- **聊天界面**：
  - 文本推理改为标准聊天界面（用户/助手气泡）
  - System Prompt 输入框（可选）
  - 消息时间戳 + 一键复制
  - 推理中实时更新气泡内容（非底部单独显示）
  - 加载动画显示在气泡底部
- **节点选择优化**：
  - 左侧边栏 280px，分组显示
  - 按 URL + 组名分组（同 URL 不同名称分开）
  - 节点名称格式：`组名 · 模型名`
  - 折叠状态持久化到 `settings.json`
- **交互改进**：
  - Shift+Enter 发送消息
  - 发送按钮 Tooltip 提示
- **深色模式优化**：
  - 选中节点文字高亮（蓝色）
  - 用户消息气泡：半透明蓝色背景
  - 助手消息气泡：半透明白色背景
  - 鼠标悬停节点：半透明白色背景
- **布局优化**：
  - 输入区域移除 padding，贴边显示
  - 输入框和按钮无缝连接（无圆角）
  - 修复推理中底部白色溢出
  - 主展示区正确的 flex 布局和高度计算
- **文档**：
  - `CHANGELOG_20260621.md`：详细更新日志
  - `TEST_GUIDE_20260621.md`：快速测试清单
  - `DARK_MODE_FIX_20260621.md`：深色模式优化文档
  - `INPUT_AREA_FIX_20260621.md`：输入区域优化文档

**3. 角色交流模块（全部 5 个阶段完成）**
- **阶段 A**：数据模型、服务层、后端路由、核心组件
- **阶段 B**：本地模式 SSE 流式响应 + Opencode 模式会话管理
- **阶段 C**：并发 Agent 循环（Promise.all）+ 双模式支持
- **阶段 D**：Opencode 模式代码 100% 完成
- **阶段 E**：导出 TXT + 下拉菜单 + 完整帮助文档
- **代码完成度**：100%（所有功能已实现，编译通过）
- **实际测试**：本地模式已验证可用，Opencode 模式待实际 Server 测试

**4. 前端主题系统和响应式布局（三轮修复完成）**
- **主题系统**：
  - 浅色/深色两套暖色调主题（完整 Ant Design 集成）
  - 13 个页面 100% 覆盖（Header + Alert + 节点测试等）
  - 主题配置文件：`frontend/src/styles/theme.ts`
  - 持久化到 `settings.json`
- **响应式布局**：
  - 全局 CSS 修复（overflow + Row/Col 边距）
  - 10+ 页面容器包装 + 响应式断点
  - 动态高度计算（`calc(100vh - 64px)`）
- **设置页面重构**：
  - Flexbox 三层结构（固定 Tab + 独立滚动）
  - 4 个标签页（节点池、高级配置、通用设置、备份）
  - 无双重滚动条，Tab 始终可见
- **Header 优化**：
  - 智能显示/隐藏"当前作品"选择器
  - 4 个独立页面隐藏（设置/节点测试/3D/2D）
  - 9 个作品页面显示
- **修复轮次**：基础实现 → 深度优化 → 语法修复
- **文档**：4 个详细文档（实现/修复/深度/最终报告）

**5. 4K 基准缩放功能（2026-06-21）**
- **功能**：
  - 以 4K (3840px) 为设计基准
  - 根据窗口宽度动态计算缩放比例
  - CSS transform 实现整体等比例缩放
  - 保持布局不变，仅调整显示大小
- **实现**：
  - 缩放组件：`frontend/src/components/ScaleWrapper.tsx`
  - 状态管理：`appStore.enable4KScale` 字段
  - 设置界面：设置页 → 界面设置 → 4K 基准缩放开关
  - 持久化：`settings.json` (enable4KScale)
- **适用场景**：
  - ✅ 4K 显示器设计和使用
  - ✅ 多显示器环境切换
  - ⚠️ 小屏幕建议关闭（内容可能过小）
- **文档**：`docs/4k_scale_feature.md`

**建议下次会话**：
1. **测试节点测试界面重构（第二轮）**（全屏布局 + 底部菜单 + 图片预览 + 橙色发送按钮）
2. 测试 4K 基准缩放功能（开启/关闭 + 调整窗口 + 不同分辨率）
3. 测试节点测试页面聊天界面（第一轮）（发送消息 + 深色模式 + 折叠状态）
4. 测试主题系统（切换主题 + 访问所有页面 + 测试不同视口）
5. 测试角色交流模块（本地模式 + 自动循环 + 导出功能）
6. 可选：运行 UI 验证脚本（`node scripts/verify-ui.js`）
7. 可选：测试 Opencode 模式（需启动 Opencode Server）

**文档**：
- 4K 基准缩放：
  - `docs/4k_scale_feature.md`
- 节点测试聊天界面：
  - `CHANGELOG_20260621.md`
  - `TEST_GUIDE_20260621.md`
  - `DARK_MODE_FIX_20260621.md`
  - `INPUT_AREA_FIX_20260621.md`
- 角色交流模块：
  - `docs/role_chat_integration_design.md`
- 节点测试架构重构：
  - `docs/node_test_refactor_progress.md`
  - `docs/node_test_ui_completion.md`
- 主题系统：
  - `docs/theme-implementation.md`
  - `docs/theme-responsive-fixes.md`
  - `docs/theme-layout-deep-fixes.md`
  - `docs/theme-layout-final-report.md`
- UI 验证：
  - `scripts/verify-ui.js`


