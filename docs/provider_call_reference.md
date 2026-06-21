# Provider 节点调用方式参考

**文档用途**：记录项目中**已实现**和**计划支持**的 LLM/图片生成节点调用方式、关键参数、兼容性说明。

**文档说明**：
- ✅ **已实现** - 代码已完成并在使用
- 🔧 **部分实现** - 基础框架完成，待完善
- ⏸️ **计划支持** - 已调研，待后续实现

---

## 文档结构

- [文本推理节点](#文本推理节点)
- [多模态节点](#多模态节点)
- [图片生成节点](#图片生成节点)
- [嵌入节点](#嵌入节点)

---

## 文本推理节点

### ✅ OpenAI 兼容（标准）

**实现状态**：已实现并在使用

**适用供应商**：OpenAI、Azure OpenAI、本地 llama.cpp、Ollama、vLLM 等

**Base URL 格式**：
- OpenAI：`https://api.openai.com/v1`
- Azure：`https://{resource}.openai.azure.com/openai/deployments/{deployment}`
- 本地：`http://127.0.0.1:8080/v1`（llama.cpp）、`http://127.0.0.1:11434/v1`（Ollama）

**API 端点**：`POST /chat/completions`

**请求格式**：
```json
{
  "model": "gpt-4",
  "messages": [
    { "role": "system", "content": "你是一个有用的助手" },
    { "role": "user", "content": "用户问题" }
  ],
  "temperature": 0.7,
  "top_p": 0.9,
  "max_tokens": 2000,
  "stream": true
}
```

**响应格式**（SSE 流式）：
```
data: {"choices":[{"delta":{"content":"回答"}}]}
data: [DONE]
```

**认证方式**：
- OpenAI：`Authorization: Bearer {apiKey}`
- Azure：通过 URL 或 Header 传递 api-key
- 本地：通常无需认证

**实现位置**：
- 前端调用：`services/real/chat.ts` → `streamChat()`
- 后端路由：`/api/llm/chat` → `server/src/routes/llm.ts`
- 后端 Client：`server/src/llmClient.ts` → `chatStream()`

**节点配置**：
- `nodeType: 'text'`
- `isMultimodal: false`
- `baseURL`、`apiKey`、`model` 必填

**使用场景**：
- M1 文本清理
- M4 章节生成（draft）
- M5 章节管理（finalize/consistency）
- 节点测试页 - 文本推理模式

---

### ⏸️ Claude（Anthropic）原生格式

**实现状态**：计划支持（当前通过 OpenAI 兼容代理使用）

**适用供应商**：Anthropic Claude

**Base URL**：`https://api.anthropic.com/v1`

**API 端点**：`POST /messages`

**请求格式**：
```json
{
  "model": "claude-opus-4-8",
  "messages": [
    { "role": "user", "content": "用户问题" }
  ],
  "system": "系统提示词",
  "temperature": 0.7,
  "max_tokens": 2000,
  "stream": true
}
```

**特殊说明**：
- system 提示词独立于 messages
- 需要 `anthropic-version` header（如 `2023-06-01`）
- 认证：`x-api-key: {apiKey}`
- 响应格式与 OpenAI 不同

**当前使用方式**：
通过第三方代理（如 one-api）转换为 OpenAI 格式使用

**后续计划**：
添加 Anthropic 原生格式适配器到 `server/src/llmClient.ts`

---

### ⏸️ 讯飞星火

**实现状态**：计划支持

**适用供应商**：讯飞科技

**Base URL**：WebSocket 连接（非 HTTP REST）

**API 端点**：`wss://spark-api.xf-yun.com/v3.5/chat`

**认证方式**：
- HMAC-SHA256 签名
- appid、api_key、api_secret 三要素

**特殊说明**：
- 使用 WebSocket 协议
- 需要特殊签名逻辑
- 消息格式与 OpenAI 不同

**后续计划**：
在后端实现 WebSocket 客户端，转换为 SSE 格式

---

## 多模态节点

### ✅ OpenAI Vision（标准）

**实现状态**：已实现并在使用

**适用供应商**：OpenAI GPT-4V、Claude 3+（通过代理）、本地多模态模型

**Base URL 格式**：同文本推理节点

**API 端点**：`POST /chat/completions`（同文本，但 content 支持数组）

**请求格式**：
```json
{
  "model": "gpt-4-vision-preview",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "这张图片是什么？" },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQ..."
          }
        }
      ]
    }
  ],
  "max_tokens": 2000,
  "stream": true
}
```

**图片输入格式**：
- **Base64 Data URL**（推荐，直传）
- **公开 HTTP URL**（需图床中转）

**支持的图床**：
- Catbox（永久，≤200MB）
- Litterbox（临时，1-72小时，≤1GB）
- 0x0.st（约30天，数十MB）
- Telegraph（长期，≤5MB）

**实现位置**：
- 前端调用：`services/real/chat.ts` → `streamChat()`（支持多模态消息格式）
- 图床上传：`services/imageHost.ts`
- 后端路由：`/api/llm/chat` → `server/src/routes/llm.ts`
- 后端 Client：`server/src/llmClient.ts` → `chatStream()`（content 支持数组）

**节点配置**：
- `nodeType: 'text'`
- `isMultimodal: true` ⚠️ 必须勾选
- `baseURL`、`apiKey`、`model` 必填

**使用场景**：
- 节点测试页 - 多模态理解模式
- 未来的图片理解功能（如角色设定图片提取）

---

### ⏸️ Gemini Vision

**实现状态**：计划支持

**适用供应商**：Google Gemini

**Base URL**：`https://generativelanguage.googleapis.com/v1beta`

**API 端点**：`POST /models/{model}:generateContent`

**特殊说明**：
- 消息格式与 OpenAI 不同（parts 结构）
- 图片需要 inline_data 或 file_data
- 认证：URL 参数 `?key={apiKey}`

**后续计划**：
添加 Gemini 格式适配器

---

## 图片生成节点

### ✅ ModelScope（魔搭社区）

**实现状态**：已实现并在使用

**适用供应商**：阿里云 ModelScope

**Base URL**：`https://api-inference.modelscope.cn/api/v1`

**API 模式**：异步任务（提交 → 轮询 → 获取结果）

**流程**：

#### 1. 提交任务
`POST /services/{model}/text-to-image/generation`

**请求格式**：
```json
{
  "input": {
    "prompt": "一只猫",
    "negative_prompt": "模糊",
    "size": "1024x1024",
    "steps": 9,
    "guidance": 4.0,
    "seed": 42,
    "image_url": ["base64..."]  // 图生图
  }
}
```

**响应**：
```json
{
  "task_id": "xxx-xxx-xxx",
  "status": "PENDING"
}
```

#### 2. 轮询状态
`GET /tasks/{task_id}`

**响应**：
```json
{
  "status": "SUCCEEDED",
  "result": {
    "output_imgs": ["base64..."]
  }
}
```

**状态枚举**：
- `PENDING`：排队中
- `RUNNING`：生成中
- `SUCCEEDED`：成功
- `FAILED`：失败

#### 3. 轮询策略
- 间隔：3秒
- 超时：120秒
- 由后端处理，前端通过 SSE 接收进度

**实现位置**：
- 前端调用：`services/real/image.ts` → `generateImage()`
- 后端路由：`/api/image/generate` → `server/src/routes/image.ts`
- 后端 Client：`server/src/imageClient.ts` → `generateImageModelScope()`

**节点配置**：
- `nodeType: 'image'`
- `supportsImageEdit: true`（如果支持图生图）
- `baseURL`：`https://api-inference.modelscope.cn/api/v1`
- `apiKey`：ModelScope Token
- `model`：模型 ID（如 `wanx-v1`）

**使用场景**：
- 节点测试页 - 图片生成模式
- 未来的插图生成功能

---

### ⏸️ OpenAI DALL-E

**实现状态**：计划支持

**适用供应商**：OpenAI

**Base URL**：`https://api.openai.com/v1`

**API 端点**：`POST /images/generations`

**请求格式**：
```json
{
  "model": "dall-e-3",
  "prompt": "一只猫",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard"
}
```

**响应格式**（同步）：
```json
{
  "data": [
    { "url": "https://..." }
  ]
}
```

**特殊说明**：
- 同步返回（非异步任务）
- 返回 URL，需下载转 Base64
- 不支持负面提示词
- DALL-E 2 支持图片变体（edit/variations）

---

### ⏸️ Stable Diffusion（本地）

**实现状态**：计划支持

**适用供应商**：本地部署 SD WebUI、ComfyUI

**Base URL**：`http://127.0.0.1:7860`（SD WebUI）

**API 端点**：
- 文生图：`POST /sdapi/v1/txt2img`
- 图生图：`POST /sdapi/v1/img2img`

**请求格式**：
```json
{
  "prompt": "一只猫",
  "negative_prompt": "模糊",
  "steps": 20,
  "cfg_scale": 7,
  "width": 512,
  "height": 512,
  "seed": -1,
  "sampler_name": "Euler a"
}
```

**响应格式**（同步）：
```json
{
  "images": ["base64..."]
}
```

---

## 嵌入节点

### ✅ OpenAI Embeddings（标准）

**实现状态**：已实现并在使用

**适用供应商**：OpenAI、本地 embedding 模型

**Base URL**：同文本推理节点

**API 端点**：`POST /embeddings`

**请求格式**：
```json
{
  "model": "text-embedding-ada-002",
  "input": ["文本1", "文本2"]
}
```

**响应格式**：
```json
{
  "data": [
    { "embedding": [0.1, 0.2, ...], "index": 0 },
    { "embedding": [0.3, 0.4, ...], "index": 1 }
  ]
}
```

**实现位置**：
- 后端调用：`server/src/store/vector.ts` → RAG 检索
- 后端 Client：`server/src/llmClient.ts` → `embed()`
- 后端路由：`/api/llm/embed`（供前端测试）

**使用场景**：
- RAG 文本向量化
- 语义检索
- 相似度计算

**节点配置**：
- 不在 Provider 节点列表中
- 配置在 `settings.json` → `embedding` 字段
- 包含：`baseURL`、`apiKey`、`model`、`dim`（维度）

---

## 调用流程总览

### 文本推理/多模态调用链

```
前端页面（节点测试/M1/M4/M5）
  ↓
services/api.ts → streamChat()
  ↓
services/real/chat.ts
  ↓
后端路由 /api/llm/chat
  ↓
server/src/routes/llm.ts
  ↓
server/src/llmClient.ts → chatStream()
  ↓
OpenAI 兼容 API（SSE 流式）
```

### 图片生成调用链

```
前端页面（节点测试）
  ↓
services/api.ts → generateImage()
  ↓
services/real/image.ts
  ↓
后端路由 /api/image/generate
  ↓
server/src/routes/image.ts
  ↓
server/src/imageClient.ts → generateImageModelScope()
  ↓
ModelScope API（异步任务 + 轮询）
  ↓
SSE 回传进度和结果
```

### 嵌入调用链

```
后端 RAG 模块
  ↓
server/src/store/vector.ts
  ↓
server/src/llmClient.ts → embed()
  ↓
OpenAI 兼容 API（同步）
```

---

## 添加新供应商指南

### 1. 确定节点类型和兼容性

**OpenAI 兼容**：
- 如果 API 格式与 OpenAI 一致，无需修改代码
- 只需在"系统设置"页添加节点配置

**需要适配**：
- 如果格式不同，需要添加适配器
- 参考现有实现：`llmClient.ts`（文本）、`imageClient.ts`（图片）

### 2. 文本/多模态节点实现步骤

#### 后端实现

1. **评估兼容性**：
   - 检查是否 OpenAI 格式（`/chat/completions` + SSE）
   - 如果是，直接复用现有代码
   - 如果不是，在 `server/src/llmClient.ts` 添加适配函数

2. **添加适配器**（如需要）：
   ```typescript
   export async function chatStream{Provider}(
     opts: ChatStreamOptions,
     onDelta: (delta: string) => void,
   ): Promise<string> {
     // 转换请求格式
     // 调用供应商 API
     // 解析响应并回调 onDelta
   }
   ```

3. **更新路由**（如需要）：
   - 在 `server/src/routes/llm.ts` 添加新端点
   - 或扩展现有 `/api/llm/chat` 支持多供应商

#### 前端实现

1. **评估是否需要前端改动**：
   - 如果后端已适配为统一格式，前端无需修改
   - 如果需要特殊参数，在 `services/real/chat.ts` 添加

2. **节点配置**：
   - 在"系统设置"页添加新节点
   - 设置 `nodeType: 'text'`
   - 填写 `baseURL`、`apiKey`、`model`
   - 勾选 `isMultimodal`（如支持多模态）

### 3. 图片生成节点实现步骤

#### 后端实现

1. **确定 API 模式**：
   - 同步返回（如 DALL-E、SD WebUI）
   - 异步任务（如 ModelScope）

2. **添加 Client**：
   - 参考 `server/src/imageClient.ts`
   - 实现提交/轮询/获取逻辑（异步）或直接调用（同步）

3. **添加路由**：
   - 在 `server/src/routes/` 添加路由文件
   - 实现 SSE 流式返回（统一前端接口）

#### 前端实现

1. **评估是否需要前端改动**：
   - 如果后端已通过 SSE 统一接口，前端无需修改
   - 如果需要特殊参数，在 `services/real/image.ts` 添加

2. **节点配置**：
   - 设置 `nodeType: 'image'`
   - 勾选 `supportsImageEdit`（如支持图生图）

### 4. 测试清单

- [ ] 连通性测试（节点测试页或 `/api/llm/test`）
- [ ] 基础调用（单次请求/响应）
- [ ] 流式输出（文本推理）
- [ ] 多模态输入（如适用）
- [ ] 图片生成（如适用）
- [ ] 错误处理（网络异常、API 错误）
- [ ] 参数传递（temperature、max_tokens 等）
- [ ] 长时间运行（超时处理）

---

## 常见问题

### Q1: 如何判断是否 OpenAI 兼容？

**检查清单**：
- ✅ API 端点是 `/v1/chat/completions`
- ✅ 请求格式包含 `model`、`messages`
- ✅ 响应格式是 SSE 流式，包含 `choices[].delta.content`
- ✅ 认证方式是 `Authorization: Bearer {apiKey}`

如果以上都符合，则为 OpenAI 兼容，**无需修改代码**。

### Q2: WebSocket 协议如何处理？

**方案**：
1. 在后端实现 WebSocket 客户端
2. 将 WS 消息转换为 SSE 格式
3. 前端仍使用 `streamChat()`，无需修改

**参考**：讯飞星火、百度文心（旧版）

### Q3: 异步任务如何实现？

**方案**：
1. 提交任务获取 `task_id`
2. 轮询状态直到完成
3. 通过 SSE 回传进度和结果

**参考**：`server/src/imageClient.ts` → ModelScope 实现

### Q4: 图床上传失败怎么办？

**降级策略**：
1. 优先使用 Base64 直传（推荐）
2. Catbox 失败 → Litterbox
3. 全部失败 → 提示用户选择其他方式

**实现位置**：`services/imageHost.ts`

### Q5: 如何添加一个完全兼容 OpenAI 的节点？

**步骤**（无需修改代码）：
1. 打开"系统设置"页
2. 点击"添加节点"
3. 填写配置：
   - 名称：如"本地 Ollama"
   - 类型：文本生成
   - Base URL：`http://127.0.0.1:11434/v1`
   - API Key：留空（本地无需认证）
   - 模型：`qwen2.5:7b`
4. 勾选"多模态"（如果模型支持）
5. 点击"测试连接"验证
6. 保存

---

## 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0 | 2026-06-21 | 初始版本，记录文本/多模态/图片/嵌入节点调用方式 |
| 1.1 | 2026-06-21 | 修正为仅记录**已实现**功能，标注实现状态，移除未验证内容 |

---

## 相关文档

- `DESIGN.md` §5 - Provider 抽象层设计
- `server/src/llmClient.ts` - LLM Client 实现（文本/多模态/嵌入）
- `server/src/imageClient.ts` - 图片生成 Client 实现（ModelScope）
- `services/real/chat.ts` - 通用对话服务（前端）
- `services/real/image.ts` - 图片生成服务（前端）
- `services/imageHost.ts` - 图床上传实现
- `services/types.ts` - ProviderNode 类型定义
