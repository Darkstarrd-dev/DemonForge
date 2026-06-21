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

### 🚧 进行中 / 待完善

- [ ] **节点测试实际验证**（建议优先）
  - 实际测试文本推理功能
  - 实际测试多模态理解功能
  - 验证历史记录保存和加载
  - 检查边界情况处理

### ⏸️ Mock 阶段（暂缓）

- [ ] **M2 设定提取**（extractEntities 仍为 mock）
- [ ] **M3 角色推演**（simulateCharacter 仍为 mock）

---

## 下一步任务

### 立即任务（本次会话后）
1. **实际测试节点测试页**
   - 配置一个文本推理节点（如 Claude、GPT）
   - 配置一个多模态节点
   - 测试三种模式（文本/多模态/图片）
   - 验证历史记录功能

### 后续计划
1. **M2 实现（设定提取）**：接真实 LLM，SSE 流式提取
2. **M3 实现（角色推演）**：接真实 LLM，多轮对话推演
3. **端到端测试**：M0 → M1 → M2 → M3 → M4 → M5 完整流程验证

---

## 技术决策记录

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

### 节点测试页使用
1. 在"系统设置"页配置节点：
   - 文本节点：勾选"多模态"开关启用视觉理解
   - 图片节点：勾选"图片编辑"开关启用图生图
2. 切换到"节点测试"页
3. 使用顶部 Segmented 切换测试模式
4. 选择对应类型的节点
5. 输入提示词开始测试
6. 多模态/图生图：点击"图片"按钮或 Ctrl+V 粘贴

### 关键文件路径
- 节点测试页：`frontend/src/pages/node-test/index.tsx`
- Store：`frontend/src/store/appStore.ts`
- 通用对话服务：`frontend/src/services/real/chat.ts`
- 后端 LLM 路由：`server/src/routes/llm.ts`
- 后端 LLM Client：`server/src/llmClient.ts`

### 数据兼容性
- 旧的 `imageGallery` 数据自动映射到 `testHistory`
- 旧的 `imageDemoForm` 配置自动迁移到 `nodeTestForm`
- 数据库表 `image_gallery` 重命名为 `test_history`（向后兼容）

---

## 备注

**本轮工作成果**：
- 完成节点测试架构**完整重构**（后端 + 前端 + UI）
- 支持文本推理、图片生成、多模态理解三种测试类型
- UI 完全重写，模式切换清晰，类型标识明确
- 编译通过，向后兼容，可投入使用

**建议下次会话**：
- 实际配置节点并测试三种模式
- 根据测试结果优化细节
- 开始 M2（设定提取）实现

**文档**：
- `docs/node_test_refactor_progress.md`：架构重构进度报告
- `docs/node_test_ui_completion.md`：UI 完善完成报告
