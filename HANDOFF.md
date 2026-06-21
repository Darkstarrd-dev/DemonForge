# HANDOFF.md — novelhelper 交接备忘

**最后更新**：2026-06-21  
**当前位置**：办公场所 A

---

## 当前进度总览

### ✅ 已完成模块

- [x] **M0 立项·架构**（arch/blueprint + SSE 流式 + UI + Context Assembler）
- [x] **M1 文本清理**（四步骤全流程 + 批量清理调度器 + UI）
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

### 🚧 进行中 / 待完善

- [ ] **角色交流模块 - 阶段 C：自动循环**（下一步）
  - 实现 `runAgentLoop()` 并发执行逻辑
  - 实现停止循环功能
  - 实现冷却延迟与次数/时间限制
  - 测试多参与者并发对话

### ⏸️ Mock 阶段（暂缓）

- [ ] **M2 设定提取**（extractEntities 仍为 mock）
- [ ] **M3 角色推演**（simulateCharacter 仍为 mock）

---

## 下一步任务

### 立即任务（本次会话后）
1. **完成角色交流模块 - 阶段 B（本地模式核心）**
   - 实现手动发送逻辑（调用 `sendLocalRoleMessage`）
   - 实现 SSE 流式响应接收
   - 实时更新参与者状态（thinking → responding → idle）
   - 测试本地模式完整流程（添加角色 → 发送消息 → 接收回复）

2. **角色交流模块 - 阶段 C（自动循环）**
   - 实现 `runAgentLoop()` 并发执行逻辑
   - 实现停止循环功能
   - 实现冷却延迟与次数/时间限制
   - 测试多参与者并发对话

3. **角色交流模块 - 阶段 D（Opencode 模式）**
   - 实现 Opencode 会话管理
   - 实现 Opencode 消息发送
   - 测试 Opencode 模式完整流程

### 后续计划
1. **M2 实现（设定提取）**：接真实 LLM，SSE 流式提取
2. **M3 实现（角色推演）**：接真实 LLM，多轮对话推演
3. **端到端测试**：M0 → M1 → M2 → M3 → M4 → M5 完整流程验证

---

## 技术决策记录

### 角色交流模块集成（2026-06-21 完成阶段 A）
- **动机**：将 opencode-chat-webui 作为角色设定验证工具集成到 novelhelper
- **方案**：
  - **双后端模式**：Opencode 服务器（保留原功能）+ 本地节点池（快速测试）
  - 决策 1：**两个模式都实现**（用户确认）
  - 决策 2：**角色 Prompt 直接使用 EntityCard 字段**（description + styleNote + styleExamples）
  - 决策 3：**对话历史不做限制**，用户手动重置
- **实施成果（阶段 A）**：
  - ✅ 数据模型定义（RoleChatParticipant、RoleChatMessage、RoleChatAutoConfig）
  - ✅ 页面路由与布局（左侧边栏 280px + 主对话区）
  - ✅ 服务层骨架（listOpencodeAgents、createOpencodeSession、sendOpencodeMessage、sendLocalRoleMessage）
  - ✅ 后端路由（POST /api/chat/role，System Prompt 构建 + SSE 流式）
  - ✅ 核心组件（ParticipantList、MessageList、AddParticipantModal、AutoLoopPanel）
  - ✅ 编译通过，零错误

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
- **打包**：`npm run dist` 或 `build-electron.bat`（生成安装包和便携版）
- **数据目录**：
  - 开发：`<appDataDir>/novelhelper-dev/`
  - 生产：`<appDataDir>/novelhelper/`

### 角色交流页使用（阶段 A 可用功能）
1. 左侧菜单点击「角色交流」进入页面
2. 顶部切换模式（本地/Opencode）
3. 点击「添加参与者」：
   - 本地模式：选择角色卡 + 节点
   - Opencode 模式：输入 Server 地址 → 连接 → 选择 Agent
4. 输入框发送消息（**阶段 B 将实现实际响应**）
5. 自动循环控制面板（**阶段 C 将实现**）
6. 导出对话/重置会话按钮可用

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

---

## 备注

**本轮工作成果**：
- 完成角色交流模块**阶段 A：基础架构**（2026-06-21）
- 数据模型、页面路由、服务层骨架、后端路由全部完成
- 核心组件（ParticipantList、MessageList、AddParticipantModal、AutoLoopPanel）全部实现
- 编译通过，零错误，UI 框架完整
- 设计文档：`docs/role_chat_integration_design.md`

**建议下次会话**：
- 实现阶段 B：本地模式核心功能（手动发送 + SSE 流式响应）
- 测试完整的单次对话流程
- 继续推进阶段 C（自动循环）和阶段 D（Opencode 模式）

**文档**：
- `docs/role_chat_integration_design.md`：角色交流模块集成设计
- `docs/node_test_refactor_progress.md`：节点测试架构重构进度报告
- `docs/node_test_ui_completion.md`：节点测试 UI 完善完成报告
