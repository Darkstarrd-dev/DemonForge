# 节点测试架构重构进度报告

**日期**：2026-06-21  
**状态**：基础架构完成，编译通过 ✅

---

## 完成内容

### 1. 后端改造 ✅
- **数据库**：`image_gallery` 表重命名为 `test_history`（向后兼容旧数据）
- **LLM Client**：扩展支持多模态消息格式（OpenAI 兼容）
- **新增 API**：`/api/llm/chat`（支持文本推理和多模态理解，SSE 流式返回）
- **Provider**：`normalizeProvider` 添加 `isMultimodal` 和 `supportsImageEdit` 字段

### 2. 前端基础架构 ✅
#### 类型系统
- `GeneratedImage` → `TestHistoryItem`（支持三种测试类型：text/image/multimodal）
- `ImageDemoForm` → `NodeTestForm`（添加文本推理参数：temperature/topP/maxTokens）
- 提供向后兼容别名

#### Store 层
- 状态字段重命名：`imageGallery` → `testHistory`
- 表单状态：`imageDemoGlobalForm` → `nodeTestGlobalForm`
- 方法重命名：`addImage/deleteImage` → `addTestHistory/deleteTestHistory`
- Getter 别名实现向后兼容
- 更新持久化逻辑（业务数据 + 设置数据）
- Bootstrap 自动迁移旧数据

#### 路由和菜单
- 页面重命名：`文生图 Demo` → `节点测试`
- 路由：`/demo-image` → `/node-test`（保留旧路由重定向）
- 文件夹：`pages/image-demo` → `pages/node-test`

#### 服务层
- 新增：`services/real/chat.ts`（通用对话服务）
- API 导出：`streamChat` + 类型定义

### 3. 前端页面改造 🚧
#### 已完成
- **组件状态**：支持双模式（文本/图片）切换
- **核心逻辑**：`handleGenerate` 重写支持三种测试类型
- **图片输入**：支持图生图和多模态两种场景
- **结果展示**：根据类型显示文本气泡或图片
- **参数面板**：根据模式显示不同参数（图片：resolution/steps/guidance；文本：temperature/topP/maxTokens）
- **历史记录**：支持三种类型，图片显示缩略图，文本显示预览

#### 待完善
- 顶部缺少明确的测试模式切换器（Segmented 组件）
- 多模态测试流程未完整测试
- UI 细节优化（图标、标签、提示文本）

### 4. 设置页改造 ✅
- 添加 `isMultimodal` 开关（文本节点专属）
- 备份恢复兼容新旧字段

---

## 技术亮点

### 向后兼容设计
1. **数据库层**：`test_history` 表同时映射 `testHistory` 和 `imageGallery` 键
2. **Store 层**：Getter 别名 + 方法别名，旧代码无缝迁移
3. **Bootstrap**：自动检测并迁移旧数据格式
4. **设置恢复**：支持 `imageDemoForm` → `nodeTestForm` 自动转换

### 类型安全
- 严格的 TypeScript 类型定义
- `ImageInputMode` 类型约束
- 编译零警告（除 chunk size）

---

## 当前状态

### ✅ 可用功能
- 图片生成测试（保持原有功能）
- 文本推理测试（新增，基础可用）
- 历史记录保存和加载
- 参数配置和持久化

### ⚠️ 待完善
- 测试模式切换器（需用户手动切换节点）
- 多模态测试 UI（可粘贴图片，但无明确提示）
- 历史记录视觉区分（三种类型标识不明显）

---

## 下一步建议

### 最小可用版本（1-2 小时）
1. 添加顶部 Segmented 切换器（文本/图片）
2. 根据模式过滤节点列表
3. 添加多模态标识（👁️ 图标）
4. 测试三种模式基本流程

### 完整版（3-5 小时）
1. 最小可用版所有内容
2. 历史记录卡片视觉优化（类型徽章）
3. 多模态输入流程优化（拖拽上传、预览优化）
4. 错误处理和边界情况
5. 端到端测试

---

## 文件清单

### 新增文件
- `frontend/src/services/real/chat.ts`（通用对话服务）

### 修改文件（主要）
- `frontend/src/services/types.ts`（TestHistoryItem 类型）
- `frontend/src/store/appStore.ts`（状态重命名 + 兼容）
- `frontend/src/pages/node-test/index.tsx`（大幅改造）
- `frontend/src/utils/provider.ts`（添加 isMultimodal 字段）
- `server/src/store/db.ts`（表重命名）
- `server/src/routes/llm.ts`（新增 /chat 端点）
- `server/src/llmClient.ts`（支持多模态消息）
- `frontend/src/layouts/AppLayout.tsx`（菜单项）
- `frontend/src/main.tsx`（路由）
- `frontend/src/services/api.ts`（导出 streamChat）
- `frontend/src/pages/settings/index.tsx`（多模态开关 + 备份兼容）

---

## 编译状态

```
✓ built in 745ms
```

**零错误，零警告（除 chunk size 提示）**

---

## 总结

本次重构完成了从"文生图 Demo"到"节点测试"的架构升级，统一了三种测试类型（文本推理、图片生成、多模态理解）。

**核心价值**：
1. 统一测试入口，降低维护成本
2. 向后兼容，旧数据无缝迁移
3. 扩展性强，易于添加新测试类型
4. 类型安全，编译时检查

**当前限制**：
UI 部分未完全完成，建议下次会话继续完善。当前基础功能可用，可进行基本测试。
