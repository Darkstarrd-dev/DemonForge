# data-slot 批量添加计划

## 已完成 ✅
- batch-generate/index.tsx
- m0-architecture/index.tsx
- m1-import/index.tsx
- m1-import/Step1Import.tsx
- m1-import/Step2Split.tsx

## 待处理文件及关键修改点

### 1. M3 推演 (m3-simulate/index.tsx)
- 根容器: `<Row data-slot="m3-simulate">`
- 场景卡片: `<Card data-slot="input-panel">`
  - 场景选择: `<Select data-slot="select-scene">`
  - 新建按钮: `<Button data-slot="btn-create-scene">`
  - 保存按钮: `<Button data-slot="btn-save-scene">`
- 目标角色: `<Select data-slot="select-character">`
- 生成按钮: `<Button data-slot="btn-simulate">`
- 输出区域: `<Card data-slot="output-panel">`
  - 候选文本: `<div data-slot="candidate-{idx}">`
  - 采纳按钮: `<Button data-slot="btn-adopt">`
- 历史列表: `<Card data-slot="history-panel">`
  - 列表: `<List data-slot="list-fragments">`
  - 列表项: `<List.Item data-slot="item-{id}">`

### 2. M4 生成 (m4-generate/index.tsx)
- 根容器: `<Row data-slot="m4-generate">`
- 大纲节点: `<Card data-slot="context-panel">`
  - 节点选择: `<Select data-slot="select-chapter">`
  - 摘要编辑: `<Input.TextArea data-slot="editor-summary">`
- 推演片段: `<Card data-slot="fragment-panel">`
  - 勾选组: `<Checkbox.Group data-slot="checkbox-group">`
- 控制区: `<Card data-slot="control-panel">`
  - 生成按钮: `<Button data-slot="btn-draft">`
  - 保存按钮: `<Button data-slot="btn-save">`
- 输出区: `<Card data-slot="output-panel">`
  - 流式文本: `<Input.TextArea data-slot="stream-text">`

### 3. M5 章节 (m5-chapters/index.tsx)
- 根容器: 最外层 Space 或 div 添加 `data-slot="m5-chapters"`
- Tabs: `<Tabs data-slot="tabs">`
- 章节列表: `<Table data-slot="list-chapters">`
  - 书籍选择: `<Select data-slot="select-book">`
- 时间线: `<Timeline data-slot="timeline">`
  - 角色筛选: `<Select data-slot="select-character">`
- 查看抽屉: `<Drawer data-slot="viewer-panel">`
  - 编辑按钮: `<Button data-slot="btn-edit">`
  - 保存按钮: `<Button data-slot="btn-save">`

### 4. M2 卡片 (m2-cards/index.tsx)
- 根容器: 最外层添加 `data-slot="m2-cards"`
- Tabs: `<Tabs data-slot="tabs">`
- 筛选区: `<Space data-slot="filter-panel">`
  - 范围选择: `<Radio.Group data-slot="select-scope">`
  - 类型筛选: `<Select data-slot="select-type">`
  - 关键词搜索: `<Input.Search data-slot="input-search">`
  - 提取按钮: `<Button data-slot="btn-extract">`
- 卡片网格: `<Row data-slot="list-panel">`
  - 卡片项: `<Card data-slot="card-{id}">`
- 详情抽屉: `<Drawer data-slot="detail-panel">`
  - 编辑表单: `<Form data-slot="editor">`
  - 保存按钮: `<Button data-slot="btn-save">`
- 合并裁决: `<List data-slot="merge-list">`
  - 合并项: `<List.Item data-slot="merge-{id}">`
  - 合并按钮: `<Button data-slot="btn-merge">`
  - 保持按钮: `<Button data-slot="btn-keep">`

### 5. M1 Step3Clean
- 根容器: 最外层添加 `data-slot="step3"`
- 配置卡片: `<Card data-slot="config-panel">`
  - 节点配置: 动态列表项 `data-slot="node-{id}"`
  - 自动重试: `<Switch data-slot="toggle-auto-retry">`
- 控制卡片: `<Card data-slot="control-panel">`
  - 开始: `<Button data-slot="btn-start">`
  - 暂停: `<Button data-slot="btn-pause">`
  - 停止: `<Button data-slot="btn-stop">`
  - 打开窗口: `<Button data-slot="btn-open-window">`
- 进度卡片: `<Card data-slot="progress-panel">`
  - 统计: `<Space data-slot="stats-summary">`
  - 任务列表: `<List data-slot="list-tasks">`
  - 任务项: `<List.Item data-slot="item-{id}">`

### 6. M1 Step4Review
- 根容器: 最外层添加 `data-slot="step4"`
- 列表面板: `<Card data-slot="list-panel">`
  - 章节列表: `<List data-slot="list-chapters">`
  - 章节项: `<List.Item data-slot="item-{id}">`
  - 接受按钮: `<Button data-slot="btn-accept">`
  - 拒绝按钮: `<Button data-slot="btn-reject">`
- Diff 查看器: `<DiffView data-slot="diff-view">`
- 编辑模态框: `<Modal data-slot="edit-modal">`
- 入库模态框: `<Modal data-slot="store-modal">`
  - 表单: `<Form data-slot="store-form">`
  - 提交按钮: `<Button data-slot="btn-submit">`

## 批量处理策略
由于每个文件需要多处修改，建议：
1. 先读取文件全文
2. 标识主要容器和交互元素
3. 在合适位置插入 data-slot 属性
4. 保持代码逻辑不变

## 实施优先级
P0（核心功能）：M3/M4/M5
P1（辅助功能）：M1 Step3/Step4、M2
