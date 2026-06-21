# 角色交流模块集成设计

> 状态：草稿 v0.1（2026-06-21），待用户确认。  
> 本文档定义如何将 opencode-chat-webui 集成为 novelhelper 的「角色交流」功能模块。

---

## 1. 项目概述

### 1.1 opencode-chat-webui 项目特征

**核心功能**：多 Agent 并发对话模拟器，支持多个 AI Agent 同时思考并以随机延迟回复，模拟真实群聊场景。

**技术栈**：
- 纯 Vanilla JS（无构建工具）+ Tailwind CDN
- 依赖 **Opencode Server**（`http://127.0.0.1:4096`）作为后端
- RESTful API：`/session`、`/agent`、`/provider`、`/event`（SSE）
- Agent 配置：存储在后端机器的 `~/.opencode/agent/*.md` Markdown 文件中

**关键特性**：
1. **并发 Agent 响应**：多个 Agent 同时"思考"并以随机延迟回复
2. **自动循环模式**：按次数或时间自动触发多轮对话
3. **实时状态监控**：思考中/回复中/等待/完成状态可视化
4. **共享对话流**：所有 Agent 共享同一条对话历史

### 1.2 集成目标

将 opencode-chat-webui 作为 novelhelper 的**角色交流调试工具**，用途：

1. **角色设定验证**：选择已建立的角色卡片（EntityCard），通过对话测试角色性格/语言风格是否符合预期
2. **多角色互动预演**：同时加载多个角色，模拟场景对话，为 M3 推演和 M4 生成提供灵感
3. **双后端模式**：
   - **保留 Opencode 接入**：继续支持连接 Opencode Server，使用其 Agent 系统
   - **新增本地节点接入**：复用 novelhelper 现有的节点池（ProviderNode），直接用本项目配置的 LLM 节点进行角色对话

---

## 2. 架构设计

### 2.1 整体定位

**页面定位**：独立的「角色交流」页面，与 M0–M5 平级，位于左侧菜单栏。

**集成方式**：
- **前端**：React + TypeScript 重写 opencode-chat-webui 的 UI 逻辑，保留其交互范式（并发 Agent、状态监控、自动循环）
- **后端**：
  - **Opencode 模式**：透传请求到 Opencode Server（用户自行启动）
  - **本地模式**：新增后端路由 `/api/chat/role`，使用本项目的 `llmClient.ts` 直接调用节点池

### 2.2 双后端架构

```
┌─────────────────────────────────────────────────────────────┐
│                  前端「角色交流」页面                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 模式切换器   │  │ 角色卡片选择 │  │ 并发控制面板 │      │
│  │ Opencode/本地│  │ EntityCard   │  │ 循环/延迟/CD │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
            │                           │
            ├───── Opencode 模式 ───────┼───► Opencode Server
            │      （透传请求）          │     (127.0.0.1:4096)
            │                           │
            └───── 本地模式 ────────────┘
                   （调用本地节点池）
                          │
                          ▼
            ┌──────────────────────────┐
            │ Novelhelper 后端         │
            │ POST /api/chat/role      │
            │  ↓                       │
            │ llmClient.chatStream()   │
            │  ↓                       │
            │ ProviderNode 节点池      │
            └──────────────────────────┘
```

### 2.3 核心差异点

| 维度 | Opencode 模式 | 本地模式 |
|-----|-------------|---------|
| **Agent 来源** | Opencode Server 的 `/agent` 端点 | novelhelper 的 EntityCard（type='character'） |
| **后端依赖** | 外部 Opencode Server（需用户启动） | 内置后端 `/api/chat/role` |
| **节点配置** | Opencode 的 Provider 配置 | novelhelper 的 ProviderNode 设置 |
| **会话管理** | Opencode 的 `/session` API | 前端内存状态（无需后端会话） |
| **适用场景** | 使用 Opencode Agent 系统 | 快速测试本项目角色设定 |

---

## 3. 数据模型

### 3.1 前端类型定义（`services/types.ts`）

```typescript
/** 角色交流模式：Opencode 服务器或本地节点池 */
export type RoleChatMode = 'opencode' | 'local'

/** 角色对话参与者（统一 Opencode Agent 和本地角色） */
export interface RoleChatParticipant {
  id: string
  name: string
  /** 模式：opencode = Opencode Agent / local = 本地角色卡 */
  mode: RoleChatMode
  /** Opencode 模式：Agent 名称 */
  agentName?: string
  /** 本地模式：EntityCard ID */
  cardId?: string
  /** 本地模式：选中的节点 ID */
  nodeId?: string
  /** 头像（可选，优先级：自定义 > 卡片 fields.avatar > 首字母） */
  avatar?: string
  /** 头像颜色（从名称生成） */
  color: string
  /** 当前状态：idle/thinking/responding/waiting/done */
  status: 'idle' | 'thinking' | 'responding' | 'waiting' | 'done'
}

/** 角色对话消息 */
export interface RoleChatMessage {
  id: string
  participantId: string
  participantName: string
  content: string
  timestamp: number
  /** 是否为用户消息（非 Agent） */
  isUser?: boolean
}

/** 自动循环配置 */
export interface RoleChatAutoConfig {
  /** 模式：按次数或时间 */
  mode: 'count' | 'time'
  /** 次数模式：每个 Agent 回复次数（±variance） */
  count: number
  /** 时间模式：总运行秒数 */
  duration: number
  /** 次数波动范围 */
  variance: number
  /** 冷却基准值（秒） */
  cooldownBase: number
  /** 冷却波动范围（秒） */
  cooldownVariance: number
  /** 反应延迟（秒）：Agent "思考"延迟范围 */
  reactionDelayMin: number
  reactionDelayMax: number
}
```

### 3.2 持久化策略

**不持久化**：对话历史、参与者状态为临时会话数据，关闭页面即清空（对齐原项目"共享对话流"的临时性质）。

**持久化到 `settings.json`**：
- `roleChatMode: RoleChatMode`：上次使用的模式（默认 `'local'`）
- `roleChatOpencodeURL: string`：Opencode Server 地址（默认 `'http://127.0.0.1:4096'`）
- `roleChatAutoConfig: RoleChatAutoConfig`：自动循环配置

---

## 4. 前端实现

### 4.1 页面路由

**新增路由**：`/role-chat`，入口文件 `frontend/src/pages/role-chat/index.tsx`

**菜单项**：左侧边栏 `AppLayout.tsx` 的 `MENU_ITEMS` 新增：
```typescript
{ key: '/role-chat', icon: <MessageOutlined />, label: '角色交流' }
```

### 4.2 页面布局

```
┌────────────────────────────────────────────────────────────────┐
│ 顶部控制栏                                                      │
│  [模式切换: Opencode/本地]  [连接状态]  [帮助按钮]              │
└────────────────────────────────────────────────────────────────┘
┌──────────────┬─────────────────────────────────────────────────┐
│ 左侧边栏     │  主对话区                                        │
│ (280px)      │  ┌──────────────────────────────────────────┐  │
│              │  │ 消息列表（滚动）                          │  │
│ 参与者列表   │  │  - 头像 + 名称 + 内容                    │  │
│  □ 用户A     │  │  - 状态徽章（思考中/回复中）             │  │
│  □ 角色B     │  └──────────────────────────────────────────┘  │
│  □ 角色C     │                                                  │
│              │  ┌──────────────────────────────────────────┐  │
│ ──────────   │  │ 输入框 + 发送按钮                        │  │
│ 自动循环设置 │  └──────────────────────────────────────────┘  │
│  [次数/时间] │                                                  │
│  [循环值]    │                                                  │
│  [波动范围]  │                                                  │
│  [冷却设置]  │                                                  │
│              │                                                  │
│ [添加参与者] │                                                  │
│ [启动循环]   │                                                  │
│ [停止循环]   │                                                  │
│ [重置会话]   │                                                  │
│ [导出对话]   │                                                  │
└──────────────┴─────────────────────────────────────────────────┘
```

### 4.3 核心组件

**页面主组件**：`RoleChatPage`  
**子组件**：
1. `ModeSwitch`：Opencode/本地模式切换器
2. `ParticipantList`：参与者列表（含状态徽章）
3. `ParticipantAddModal`：添加参与者弹窗
   - Opencode 模式：列出 `/agent` 端点的 Agent
   - 本地模式：列出当前作品的 EntityCard (type='character')，选择节点
4. `MessageList`：消息列表（Markdown 渲染 + 代码高亮）
5. `AutoLoopPanel`：自动循环控制面板
6. `ConnectionStatus`：连接状态指示器

### 4.4 服务层（`services/real/roleChat.ts`）

**新增服务模块**：`frontend/src/services/real/roleChat.ts`

```typescript
/** Opencode 模式：列出可用 Agent */
export async function listOpencodeAgents(baseURL: string): Promise<{name: string; description?: string}[]>

/** Opencode 模式：创建会话 */
export async function createOpencodeSession(baseURL: string, agentName: string): Promise<{sessionID: string}>

/** Opencode 模式：发送消息（返回完整响应文本） */
export async function sendOpencodeMessage(
  baseURL: string,
  sessionID: string,
  agentName: string,
  prompt: string
): Promise<string>

/** 本地模式：发送角色对话消息（SSE 流式，返回完整文本） */
export async function sendLocalRoleMessage(
  cardId: string,
  nodeId: string,
  conversationHistory: RoleChatMessage[],
  onDelta: (delta: string) => void
): Promise<string>
```

---

## 5. 后端实现

### 5.1 新增路由：`/api/chat/role`（本地模式专用）

**文件**：`server/src/routes/chat.ts`（新建）或并入 `routes/llm.ts`

**端点定义**：

```typescript
POST /api/chat/role
Request Body: {
  cardId: string              // EntityCard ID
  nodeId: string              // ProviderNode ID
  conversationHistory: Array<{
    participantName: string
    content: string
    isUser?: boolean
  }>
}
Response: SSE 流式
  event: delta  data: {delta: string}
  event: done   data: {text: string}
  event: error  data: {message: string}
```

**实现逻辑**：
1. 从资产库读取 `EntityCard`（含 `description`/`styleNote`/`styleExamples`）
2. 从设置读取 `ProviderNode`（含 `baseURL`/`apiKey`/`model`）
3. 构建 System Prompt：
   ```
   你是 {角色名}。

   角色设定：
   {description}

   语言风格：
   {styleNote}

   台词例句：
   {styleExamples.join('\n')}

   请严格按照角色设定和语言风格回复，不要跳出角色。
   ```
4. 将 `conversationHistory` 转换为 OpenAI 格式的 `messages`（role: user/assistant）
5. 调用 `llmClient.chatStream()` 流式返回

### 5.2 Opencode 透传端点（可选）

**场景**：若用户希望前端直连 Opencode Server 而非后端透传，则无需此端点（前端直接调 `http://127.0.0.1:4096`）。

**若需要透传**（例如避免跨域），可新增：
```typescript
POST /api/chat/opencode-proxy
Request Body: {
  baseURL: string
  path: string        // 如 '/session', '/agent'
  method: string
  body?: any
}
Response: 透传 Opencode Server 的响应
```

---

## 6. UI 交互流程

### 6.1 添加参与者流程

**Opencode 模式**：
1. 点击「添加参与者」→ 弹窗显示 Opencode Agent 列表
2. 输入 Opencode Server 地址（默认 `http://127.0.0.1:4096`）
3. 点击「连接」→ 调用 `listOpencodeAgents()`
4. 显示 Agent 列表（名称 + 描述）
5. 点击「添加」→ 创建 `RoleChatParticipant`（mode='opencode'）

**本地模式**：
1. 点击「添加参与者」→ 弹窗显示当前作品的角色卡片列表
2. 选择角色卡（EntityCard，type='character'）
3. 选择节点（ProviderNode，从 `appStore.providers` 筛选 text 类型）
4. 点击「添加」→ 创建 `RoleChatParticipant`（mode='local'）

### 6.2 自动循环流程

**启动循环**：
1. 点击「启动循环」→ 遍历所有参与者（除用户外）
2. 为每个参与者启动独立的 `runAgentLoop()`：
   ```typescript
   async function runAgentLoop(participant: RoleChatParticipant, limit: LoopLimit) {
     while (未达到次数/时间限制 && !用户点击停止) {
       // 1. 状态 → thinking（随机延迟 reactionDelay）
       await sleep(randomDelay(config.reactionDelayMin, config.reactionDelayMax))
       
       // 2. 状态 → responding（调用 LLM）
       const response = await sendMessage(participant, conversationHistory)
       
       // 3. 追加到对话历史
       appendMessage(participant, response)
       
       // 4. 状态 → waiting（冷却延迟）
       await sleep(randomDelay(config.cooldownBase - config.cooldownVariance, config.cooldownBase + config.cooldownVariance))
     }
     // 5. 状态 → done
   }
   ```
3. 所有 `runAgentLoop()` 并发执行（`Promise.all()`），实时更新状态徽章

**停止循环**：
1. 点击「停止循环」→ 设置 `abortFlag`
2. 所有 `runAgentLoop()` 检测到 `abortFlag` 后退出
3. 所有参与者状态 → idle

### 6.3 手动发送流程

1. 输入框输入消息 → 点击「发送」
2. 追加用户消息到对话历史（`isUser: true`）
3. 若未在循环中，触发**所有参与者**的一轮响应（模拟"群聊接力"）

---

## 7. 实现优先级与阶段划分

### 阶段 A：基础架构（P0）
- [ ] 数据模型定义（`types.ts`）
- [ ] 页面路由与布局（`pages/role-chat/index.tsx`）
- [ ] 服务层骨架（`services/real/roleChat.ts`）
- [ ] 后端路由 `/api/chat/role`（本地模式）
- [ ] 参与者列表组件（静态，无交互）

### 阶段 B：本地模式核心（P0）
- [ ] 添加参与者弹窗（本地模式：选择角色卡 + 节点）
- [ ] 手动发送流程（单次问答）
- [ ] 消息列表组件（Markdown 渲染）
- [ ] 状态徽章（idle/thinking/responding/waiting/done）

### 阶段 C：自动循环（P1）
- [ ] 自动循环控制面板
- [ ] `runAgentLoop()` 并发执行逻辑
- [ ] 停止循环功能
- [ ] 冷却延迟与次数/时间限制

### 阶段 D：Opencode 模式（P2，可选）
- [ ] 模式切换器
- [ ] Opencode Agent 列表获取
- [ ] Opencode 会话管理
- [ ] Opencode 消息发送

### 阶段 E：增强功能（P3）
- [ ] 导出对话（JSON/TXT）
- [ ] 重置会话
- [ ] 头像自定义
- [ ] 连接状态监控
- [ ] 帮助文档弹窗

---

## 8. 关键设计决策待确认

### 决策 1：是否保留 Opencode 模式？

**选项 A（推荐）**：仅实现**本地模式**（阶段 A+B+C），Opencode 模式作为未来扩展（阶段 D）。  
**理由**：
- 本地模式与项目现有架构无缝集成（复用节点池、角色卡）
- Opencode 模式需要用户额外维护 Opencode Server，增加使用门槛
- 核心目标是"角色设定验证"，本地模式已足够

**选项 B**：两个模式都实现，提供完整的 opencode-chat-webui 移植版。  
**代价**：增加 ~30% 开发量，需要实现 Opencode Server 的透传/直连逻辑。

**请用户决策**：选 A（本地模式优先）还是 B（两个模式都做）？

### 决策 2：角色 System Prompt 的来源

**选项 A**：直接使用 `EntityCard` 的 `description` + `styleNote` + `styleExamples`。  
**选项 B**：新增 `EntityCard.roleChatPrompt?: string` 字段，允许用户为角色交流场景定制独立的 System Prompt。

**推荐**：选 A（复用现有字段），简化数据模型，避免冗余。

### 决策 3：对话历史的上下文长度限制

**问题**：自动循环 50 轮后，对话历史可能超出模型上下文窗口。

**选项 A**：不做限制，由用户手动「重置会话」清空历史。  
**选项 B**：自动保留最近 N 轮对话（如 20 轮），超出部分丢弃。  
**选项 C**：使用滚动摘要（类似 M5 finalize），超出窗口后压缩历史为摘要。

**推荐**：选 A（不做限制），简单直接，后续按需扩展。

---

## 9. 与现有模块的关系

### 9.1 与 M3 角色推演的区别

| 维度 | M3 角色推演 | 角色交流模块 |
|-----|-----------|------------|
| **目标** | 生成剧情片段（单角色） | 测试角色性格/对话风格 |
| **场景** | 给定场景设定 + 大纲节点 | 自由对话（无场景约束） |
| **输出** | 推演片段（可采纳） | 临时对话（不持久化） |
| **上下文** | Context Assembler 组装 | 简单对话历史 |
| **用途** | 创作流程的正式环节 | 辅助调试工具 |

**协同点**：角色交流模块可作为 M3 的"试验场"，验证角色设定后再进入正式推演。

### 9.2 与节点测试页的区别

| 维度 | 节点测试页 | 角色交流模块 |
|-----|----------|------------|
| **测试对象** | 节点连通性 + 文本/多模态/图片 | 角色卡的对话表现 |
| **输入** | 任意 Prompt | 角色设定驱动的对话 |
| **历史** | 单次请求（无上下文） | 多轮对话历史 |
| **并发** | 单节点单次 | 多角色并发循环 |

**协同点**：两者都是「调试工具」，互不替代。

---

## 10. 开放问题

1. **是否需要保存对话模板**？例如"经典场景对话"（争吵/和解/告白），可作为预设加载。
2. **是否需要支持用户手动编辑某条消息后重新生成**？（类似 ChatGPT 的编辑功能）
3. **是否需要显示 token 消耗统计**？帮助用户评估循环成本。

---

## 附录 A：原项目核心机制摘要

### A.1 并发循环逻辑（app.js:57–119）

```javascript
// 每个 Agent 独立运行循环，互不阻塞
async function runAgentLoop(agentName, limit) {
  let replyCount = 0;
  while (!state.relayAbort) {
    if (limit.type === 'count' && replyCount >= limit.target) break;
    if (limit.type === 'time' && Date.now() >= limit.endTime) break;
    
    state.setAgentStatus(agentName, 'thinking');
    await sleep(randomDelay(reactionDelay.min, reactionDelay.max));
    
    const success = await snapshotAndReply(agentName);
    if (success) {
      replyCount++;
      state.setAgentStatus(agentName, 'waiting');
      await sleep(randomDelay(cooldown - variance, cooldown + variance));
    }
  }
  state.setAgentStatus(agentName, 'done');
}

// 所有 Agent 并发启动
await Promise.all(agents.map(a => runAgentLoop(a, limit)));
```

### A.2 Opencode Server API 接口（api.js:24–56）

```javascript
// 创建会话
POST /session
  Body: {title: string, directory: string}
  Response: {id: string}

// 发送消息
POST /session/{sessionID}/message
  Body: {
    parts: [{type: 'text', text: string}],
    agent: string,
    model: string
  }
  Response: {parts: [{type: 'text', text: string}]}

// 列出 Agent
GET /agent
  Response: [{name: string, description: string}]

// SSE 事件流
GET /event
  Event: {type: 'message', sessionID: string, message: {...}}
```

---

## 附录 B：UI 参考（原项目截图说明）

原项目 UI 特点：
1. **左侧边栏**：参与者列表 + 控制面板（紧凑布局）
2. **主对话区**：消息列表 + 输入框（占据大部分空间）
3. **状态徽章**：每个参与者旁显示彩色状态点（思考中=黄色，回复中=蓝色，完成=绿色）
4. **调试面板**：底部可折叠的日志面板（显示事件流）

**移植建议**：保留原项目的"紧凑 + 状态可视化"设计，适配 Ant Design 组件库（Badge、Tag、Spin）。

---

**设计文档完成，请用户审阅并反馈决策。**
