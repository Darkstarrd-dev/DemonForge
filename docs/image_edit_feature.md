# 文生图 Demo 图片编辑功能实现文档

## 概述

本次实现为文生图 Demo 模块添加了图片编辑（Image2Image）功能，并参考 freegen 项目重构了整个 UI 布局。

## 实现的三个需求

### 需求 1：节点池新增"图片编辑"开关

**位置**：系统设置 > Provider 节点池 > 编辑节点

**实现**：
- 在 `ProviderNode` 类型中新增 `supportsImageEdit?: boolean` 字段
- 节点编辑 Modal 中，当节点类型为"文生图"时，显示"图片编辑"开关
- 开关说明文字：`开启后该节点可进行图片编辑（Image2Image）`

**代码位置**：
- `frontend/src/services/types.ts` - 类型定义
- `frontend/src/pages/settings/index.tsx` - UI 实现（1187-1195行）

---

### 需求 2：文生图 Demo 支持图片输入

**功能点**：
1. **粘贴图片**：支持 Ctrl+V 粘贴剪贴板中的图片
2. **选择图片**：提供"上传图片"按钮打开文件浏览器
3. **支持多图**：可同时选择/粘贴多张图片
4. **图片预览**：显示已选图片的缩略图，每张图右上角有删除按钮
5. **条件显示**：仅当选中的节点 `supportsImageEdit === true` 时显示图片输入区

**ModelScope 调用方式**：
- 前端将图片文件转换为 Base64 data URL
- 通过 `imageInputs` 参数传递给后端（字符串数组）
- 后端在提交任务时将 `imageInputs` 放入 `image_url` 字段
- 格式：`{ "image_url": ["data:image/png;base64,...", ...] }`

**代码位置**：
- `frontend/src/services/real/image.ts` - 参数类型扩展
- `server/src/imageClient.ts` - 后端实现（77-80行）
- `frontend/src/pages/image-demo/index.tsx` - UI 实现

**技术细节**：
```typescript
// 粘贴监听
useEffect(() => {
  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    // 提取所有图片类型的 item
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) imageFiles.push(file)
      }
    }
  }
  document.addEventListener('paste', handlePaste)
}, [supportsEdit])

// 转 Base64
const reader = new FileReader()
reader.onload = () => resolve(reader.result as string)
reader.readAsDataURL(file)
```

---

### 需求 3：重构布局（参考 freegen 项目）

**布局结构**：
```
┌─────────────────────────────────────────────────┬──────────────┐
│ 顶部选择器（节点 + 分辨率）                      │              │
├─────────────────────────────────────────────────┤              │
│                                                 │              │
│            主图展示区                           │   右侧设置   │
│       （居中、阴影、圆角）                      │    面板      │
│                                                 │              │
├─────────────────────────────────────────────────┤  - 参数设置  │
│ 图片预览区（仅图片编辑模式）                     │  - 调试信息  │
├─────────────────────────────────────────────────┤  - 生成历史  │
│ Prompt 输入区 + 上传按钮 + 生成按钮             │              │
├─────────────────────────────────────────────────┤              │
│ 底部缩略图栏（横向滚动）                        │              │
└─────────────────────────────────────────────────┴──────────────┘
```

**设计风格**：
- **色彩方案**：GitHub Dark 主题
  - 背景：`#0d1117`
  - 面板：`#161b22`
  - 边框：`#30363d`
  - 文字：`#c9d1d9` / `#8b949e`
  - 强调色：`#58a6ff`（蓝）、`#da3633`（红）

- **移除的元素**（按需求）：
  - ❌ 注册 / 获取 Key 按钮
  - ❌ API KEY 输入框
  - ❌ 导入/导出设置按钮

- **保留的核心功能**：
  - ✅ 节点选择（文生图节点池）
  - ✅ 参数设置（分辨率、步数、引导、种子、反向提示词）
  - ✅ 主图展示 + 生成进度蒙层
  - ✅ 缩略图栏（点击切换）
  - ✅ 生成历史管理（下载、删除）
  - ✅ 调试信息（Payload + Response）

**UI 特色**：
- 全屏画廊式布局，充分利用空间
- 主图居中展示，带阴影和圆角
- 生成中显示半透明蒙层 + 旋转动画
- 缩略图栏支持横向滚动，可快速浏览历史
- 右侧设置面板独立滚动，底部固定历史管理

**代码位置**：
- `frontend/src/pages/image-demo/index.tsx` - 完整重写（480行）

---

## 数据流

### 前端 → 后端
```typescript
// 前端：frontend/src/pages/image-demo/index.tsx
const imageInputs: string[] = []
for (const file of selectedImages) {
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
  imageInputs.push(dataUrl)
}

await generateImage({
  baseURL: selectedNode.baseURL,
  apiKey: selectedNode.apiKey,
  model: selectedNode.model,
  prompt: imageDemoForm.prompt.trim(),
  imageInputs, // 新增字段
  // ... 其他参数
})
```

### 后端 → ModelScope
```typescript
// 后端：server/src/imageClient.ts
const submitBody: Record<string, unknown> = {
  model: cfg.model,
  prompt: cfg.prompt
}
// 图片编辑：将 Base64 数组放入 image_url 字段
if (cfg.imageInputs && cfg.imageInputs.length > 0) {
  submitBody.image_url = cfg.imageInputs
}

await fetch(`${base}/v1/images/generations`, {
  method: 'POST',
  headers: {
    ...authHeaders(cfg.apiKey),
    'Content-Type': 'application/json',
    'X-ModelScope-Async-Mode': 'true',
  },
  body: JSON.stringify(submitBody),
})
```

---

## 使用说明

### 1. 创建支持图片编辑的节点

1. 进入「系统设置」
2. 切换到「Provider 节点池」Tab
3. 点击「新增节点」
4. 填写：
   - **类型**：选择「文生图」
   - **图片编辑**：打开开关 ✅
   - **Base URL**：`https://api-inference.modelscope.cn`
   - **API Key**：填入你的 ModelScope Token
   - **默认模型**：`Qwen/Qwen-Image-Edit-2509`（或其他支持编辑的模型）
5. 保存

### 2. 使用图片编辑功能

1. 进入「文生图 Demo」
2. 选择刚创建的支持编辑的节点（节点名后带 🖼️ 图标）
3. 上传或粘贴参考图：
   - 方式一：点击「上传图片」按钮选择文件
   - 方式二：直接 `Ctrl+V` 粘贴剪贴板中的图片
4. 在 Prompt 中描述要做的修改，如：
   - `"给图中的狗戴上一个生日帽"`
   - `"把背景换成星空"`
   - `"将人物服装改为古装"`
5. 点击「生成」

### 3. 查看结果

- 生成完成后图片显示在主展示区
- 底部缩略图栏可快速切换历史图片
- 右侧面板可查看调试信息（实际发送的 Payload 和 ModelScope 响应）

---

## 测试建议

1. **文本生成模式**（无图片输入）：
   - 选择普通文生图节点（`supportsImageEdit = false` 或未设置）
   - 确认不显示"上传图片"按钮
   - 确认 Prompt 占位符为默认文字

2. **图片编辑模式**（单图）：
   - 选择支持编辑的节点
   - 上传 1 张图片
   - 输入编辑指令
   - 确认 Payload 中包含 `image_url` 字段

3. **图片编辑模式**（多图）：
   - 连续粘贴或上传多张图片
   - 确认预览区显示所有图片
   - 确认可单独删除某张图片
   - 确认 Payload 中 `image_url` 为数组

4. **粘贴功能**：
   - 在其他应用（浏览器、截图工具）中复制图片
   - 在文生图 Demo 页面按 `Ctrl+V`
   - 确认图片出现在预览区

5. **响应式检查**：
   - 缩小浏览器窗口
   - 确认主图区自适应
   - 确认右侧设置面板可滚动
   - 确认底部缩略图栏横向滚动

---

## 文件清单

### 修改的文件

1. **frontend/src/services/types.ts**
   - 新增 `ProviderNode.supportsImageEdit` 字段

2. **frontend/src/services/real/image.ts**
   - 扩展 `ImageGenParams.imageInputs` 字段

3. **frontend/src/pages/settings/index.tsx**
   - 节点编辑 Modal 新增"图片编辑"开关（1187-1195行）

4. **server/src/imageClient.ts**
   - `ImageGenConfig` 新增 `imageInputs` 字段
   - 提交任务时拼装 `image_url` 字段（77-80行）

5. **frontend/src/pages/image-demo/index.tsx**
   - **完全重写**（480行）
   - 全新画廊式布局
   - 图片输入支持（粘贴/上传/预览/删除）
   - 参考 freegen 项目的视觉风格

### 未修改的文件

- `server/src/routes/image.ts` - 路由透传，无需改动
- 其他前端页面 - 布局重构仅限文生图 Demo

---

## 技术亮点

1. **事件监听优化**：粘贴监听带清理函数，避免内存泄漏
2. **类型安全**：全程 TypeScript 类型约束，无 `any`
3. **条件渲染**：根据节点能力动态显示/隐藏图片输入区
4. **异步处理**：FileReader Promise 化，代码清晰
5. **用户体验**：
   - 图片预览带删除按钮
   - 粘贴后即时反馈（message.success）
   - Prompt 占位符根据模式动态变化
   - 生成中禁用输入，防止重复提交

---

## 向后兼容

- 旧数据中 `supportsImageEdit` 字段为 `undefined` → 视为 `false`
- 不支持编辑的节点行为完全不变
- 已有的文生图历史不受影响

---

## 已知限制

1. **图片大小**：Base64 编码后的图片会膨胀约 33%，建议单张图片不超过 5MB
2. **浏览器限制**：粘贴功能需浏览器支持 Clipboard API
3. **ModelScope 限制**：
   - 速率限制：约每分钟 50 次调用、每日 2000 次调用
   - 模型限制：仅部分模型支持 `image_url` 参数（如 `Qwen-Image-Edit-2509`）

---

## 构建验证

✅ **前端构建**：通过（14.89s）
✅ **后端构建**：通过
✅ **TypeScript 类型检查**：通过
✅ **ESLint**：无新增警告

---

## 下一步建议

1. **图片压缩**：在前端对大图进行压缩后再转 Base64
2. **临时图床**：支持将图片上传到临时图床（如 Telegraph、0x0.st），获取 URL 后传给 ModelScope，避免 Base64 体积过大
3. **拖拽上传**：支持拖拽图片到输入区
4. **历史记录增强**：记录图片编辑的源图片，方便回顾
5. **模型推荐**：在节点选择时标注哪些模型支持 Image2Image

---

_文档生成时间：2026-06-20_
_实现版本：v1.0_
