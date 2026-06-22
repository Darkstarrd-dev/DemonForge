# data-slot 快速参考卡片

## 🚀 快速定位

### 浏览器控制台
```javascript
// 定位单个元素
document.querySelector('[data-slot="btn-start"]')

// 定位多个元素
document.querySelectorAll('[data-slot^="item-"]')

// 高亮元素
$0.style.outline = '3px solid red'
```

### Elements 面板
1. 按 `Ctrl+F`
2. 输入 `data-slot="xxx"`
3. 按回车定位

### CSS 临时样式
```css
[data-slot="control-panel"] { outline: 2px solid blue !important; }
[data-slot^="btn-"] { box-shadow: 0 0 10px red !important; }
```

---

## 📋 常用 data-slot 速查

### 批量生成 (`/batch-generate`)
- `btn-start` - 开始按钮
- `btn-pause` - 暂停按钮
- `btn-stop` - 停止按钮
- `progress-panel` - 进度面板
- `list-tasks` - 任务列表
- `item-{id}` - 任务项

### M0 立项 (`/m0-architecture`)
- `arch-input` - 架构输入区
- `arch-editor` - 架构编辑区
- `btn-generate` - 生成按钮
- `btn-adopt` - 采纳按钮
- `blueprint` - 蓝图区
- `table-preview` - 预览表格

### M1 导入 (`/m1-import`)
- `steps` - 步骤导航
- `input-file` - 文件上传
- `select-encoding` - 编码选择
- `list-chapters` - 章节列表
- `btn-next` - 下一步

### M2 卡片 (`/m2-cards`)
- `filter-panel` - 筛选面板
- `select-scope` - 范围选择
- `select-type` - 类型筛选
- `input-search` - 搜索框
- `btn-extract` - 提取按钮
- `card-{id}` - 卡片项

### M3 推演 (`/m3-simulate`)
- `input-panel` - 输入面板
- `select-scene` - 场景选择
- `select-character` - 角色选择
- `btn-simulate` - 推演按钮
- `btn-save-scene` - 保存场景

### M4 生成 (`/m4-generate`)
- `context-panel` - 上下文面板
- `select-chapter` - 章节选择
- `editor-summary` - 摘要编辑
- `fragment-panel` - 片段面板
- `btn-draft` - 生成草稿
- `btn-save` - 保存按钮
- `stream-text` - 流式文本

### M5 章节 (`/m5-chapters`)
- `list-panel` - 列表面板
- `select-book` - 书籍选择
- `table-chapters` - 章节表格
- `timeline-panel` - 时间线面板
- `select-character` - 角色筛选
- `viewer-panel` - 查看器
- `btn-edit` - 编辑按钮
- `btn-save` - 保存按钮

---

## 🎯 命名规则

| 类型 | 格式 | 示例 |
|------|------|------|
| 根容器 | `{module}` | `m2-cards`, `batch-generate` |
| 面板 | `{area}-panel` | `control-panel`, `progress-panel` |
| 按钮 | `btn-{action}` | `btn-start`, `btn-save` |
| 输入 | `input-{field}` | `input-topic`, `input-search` |
| 选择器 | `select-{field}` | `select-node`, `select-book` |
| 编辑器 | `editor-{field}` | `editor-summary`, `editor-content` |
| 开关 | `toggle-{feature}` | `toggle-auto-retry` |
| 列表 | `list-{type}` | `list-tasks`, `list-chapters` |
| 列表项 | `item-{id}` | `item-ch001`, `card-abc123` |
| 特殊 | 语义化 | `tabs`, `steps`, `stream-text` |

---

## 🔍 实际应用示例

### 场景 1：用户反馈 UI 问题
**用户**：批量生成的暂停按钮点击无响应

**开发**：
```javascript
const btn = document.querySelector('[data-slot="btn-pause"]')
console.log('按钮:', btn)
console.log('禁用状态:', btn.disabled)
console.log('点击事件:', btn.onclick)
```

### 场景 2：临时样式调试
**需求**：给进度面板加红色边框

**开发者工具 → Styles**：
```css
[data-slot="progress-panel"] {
  border: 2px solid red !important;
}
```

### 场景 3：E2E 测试
```javascript
// 测试批量生成流程
await page.click('[data-slot="btn-start"]')
await page.waitForSelector('[data-slot="progress-panel"]')

const status = await page.textContent('[data-slot="status-tag"]')
expect(status).toContain('进行中')

await page.click('[data-slot="btn-stop"]')
```

---

## 📊 覆盖率

| 模块 | 状态 | data-slot 数量 |
|------|------|----------------|
| 批量生成 | ✅ 完整 | 20+ |
| M0 立项 | ✅ 完整 | 30+ |
| M1 导入 | ✅ 85% | 27+ |
| M2 卡片 | ✅ 完整 | 25+ |
| M3 推演 | ✅ 完整 | 15+ |
| M4 生成 | ✅ 完整 | 20+ |
| M5 章节 | ✅ 完整 | 15+ |
| **总计** | **85%** | **150+** |

---

## 📚 完整文档

- **设计规范**：`docs/data_slot_spec.md`
- **使用指南**：`docs/data_slot_usage.md`
- **实施报告**：`docs/data_slot_implementation_report.md`
- **交接文档**：`HANDOFF.md`

---

**更新时间**：2026-06-22  
**编译状态**：✅ 通过（731ms）  
**可直接使用** 🎉
