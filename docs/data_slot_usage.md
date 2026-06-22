# data-slot 使用指南

## 快速定位元素

使用浏览器开发者工具通过 `data-slot` 属性快速定位 UI 元素：

### 方法 1：Elements 面板搜索

1. 打开开发者工具（F12）
2. 切换到 **Elements** 标签
3. 使用搜索功能（Ctrl+F）
4. 输入 `data-slot="xxx"` 查找

### 方法 2：Console 命令

```javascript
// 查找单个元素
document.querySelector('[data-slot="btn-start"]')

// 查找所有匹配元素
document.querySelectorAll('[data-slot^="item-"]')

// 高亮显示元素
$('[data-slot="progress-panel"]').style.outline = '2px solid red'
```

### 方法 3：CSS 样式调试

```css
/* 在开发者工具 Styles 面板添加临时样式 */
[data-slot="control-panel"] {
  outline: 2px solid blue !important;
}

/* 高亮所有按钮 */
[data-slot^="btn-"] {
  box-shadow: 0 0 10px rgba(255,0,0,0.5) !important;
}
```

---

## 各模块快速索引

### 批量生成 (`/batch-generate`)

| data-slot | 描述 |
|-----------|------|
| `batch-generate` | 根容器 |
| `alert` | 顶部说明 |
| `selection-panel` | 章节选择面板 |
| `checkbox-group` | 勾选组 |
| `checkbox-{chapterId}` | 单个章节勾选框 |
| `node-config-panel` | 节点配置面板 |
| `control-panel` | 控制面板 |
| `btn-start` | 开始按钮 |
| `btn-pause` | 暂停/继续按钮 |
| `btn-stop` | 停止按钮 |
| `progress-panel` | 进度面板 |
| `list-tasks` | 任务列表 |
| `item-{chapterId}` | 单个任务项 |
| `title` | 任务标题 |
| `status-tag` | 状态标签 |
| `progress-text` | 进度文本 |
| `error-text` | 错误信息 |
| `progress-bar` | 进度条 |

### M0 立项·架构 (`/m0-architecture`)

| data-slot | 描述 |
|-----------|------|
| `m0-architecture` | 根容器 |
| `alert` | 顶部说明 |
| `steps` | 步骤导航 |
| **架构输入区（左栏）** | |
| `arch-input` | 输入面板 |
| `input-topic` | 主题输入框 |
| `input-genre` | 类型输入框 |
| `input-chapters` | 章节数输入 |
| `input-guidance` | 指导输入框 |
| `select-node` | 节点选择器 |
| `btn-generate` | 生成架构按钮 |
| **架构编辑区（左栏）** | |
| `arch-editor` | 编辑面板 |
| `editor-seed` | 核心种子编辑器 |
| `editor-character-dynamics` | 角色动力学编辑器 |
| `editor-world-building` | 世界观编辑器 |
| `editor-plot-structure` | 情节编辑器 |
| `btn-fill-template` | 填入模板按钮 |
| `btn-adopt` | 采纳架构按钮 |
| **架构输出区（右栏）** | |
| `arch-output` | 输出面板 |
| `stream-text` | 流式文本显示 |
| **蓝图区（右栏）** | |
| `blueprint` | 蓝图面板 |
| `select-node` | 节点选择器 |
| `btn-generate` | 生成蓝图按钮 |
| `stream-text` | 流式文本显示 |
| `table-preview` | 预览表格 |
| `btn-write` | 写入大纲按钮 |
| `btn-append` | 追加按钮 |

### M1 导入 (`/m1-import`)

| data-slot | 描述 |
|-----------|------|
| `m1-import` | 根容器 |
| `steps` | 步骤导航 |

#### Step1 导入文件

| data-slot | 描述 |
|-----------|------|
| `step1` | 步骤容器 |
| `input-file` | 文件上传区 |
| `btn-load-demo` | 载入演示按钮 |
| `file-info` | 文件信息 |
| `select-encoding` | 编码选择器 |
| `preview-text` | 文本预览 |
| `alert-encoding-warning` | 编码警告 |
| `btn-next` | 下一步按钮 |

#### Step2 章节分割

| data-slot | 描述 |
|-----------|------|
| `step2` | 步骤容器 |
| `alert-detect-result` | 检测结果 |
| `btn-redetect` | 重新检测按钮 |
| `config-panel` | 配置面板 |
| `select-pattern` | 模式选择器 |
| `input-custom-regex` | 自定义正则输入 |
| `toggle-keep-prologue` | 保留序章开关 |
| `alert-preview-summary` | 预览摘要 |
| `list-chapters` | 章节列表 |
| `item-{index}` | 单个章节项 |
| `split-panel` | 拆分面板 |
| `preview-text` | 预览文本 |
| `input-split-title` | 拆分标题输入 |
| `btn-split` | 拆分按钮 |

---

## 命名约定

### 模式

- **面板**：`{area}-panel`（如 `control-panel`, `input-panel`）
- **按钮**：`btn-{action}`（如 `btn-start`, `btn-save`）
- **输入**：`input-{field}`（如 `input-topic`, `input-title`）
- **选择器**：`select-{field}`（如 `select-node`, `select-book`）
- **编辑器**：`editor-{field}`（如 `editor-seed`）
- **列表**：`list-{type}`（如 `list-tasks`, `list-chapters`）
- **列表项**：`item-{id}`（动态 ID，如 `item-ch001`）
- **开关**：`toggle-{feature}`（如 `toggle-auto-retry`）

### 层级规则

1. **根容器**：模块名（如 `batch-generate`, `m0-architecture`）
2. **区域/步骤**：描述性名称（如 `step1`, `arch-input`, `blueprint`）
3. **组件类型**：按模式命名（如 `btn-start`, `input-topic`）
4. **子元素**：内容类型（如 `title`, `status-tag`, `progress-text`）

---

## 实际应用场景

### 场景 1：反馈 UI 问题

**用户**：批量生成的暂停按钮点击无响应

**开发**：
```javascript
// 快速定位元素
const btn = document.querySelector('[data-slot="btn-pause"]')
console.log('按钮状态：', btn.disabled, btn.onclick)
```

### 场景 2：样式调整

**用户**：进度面板的标题需要加粗

**开发**：
```css
[data-slot="progress-panel"] [data-slot="title"] {
  font-weight: bold;
}
```

### 场景 3：自动化测试

```javascript
// E2E 测试用例
await page.click('[data-slot="btn-start"]')
await page.waitForSelector('[data-slot="progress-panel"]')
const progress = await page.textContent('[data-slot="progress-text"]')
expect(progress).toContain('生成中')
```

---

## 待扩展模块

以下模块部分实施或尚未实施 data-slot，可按需扩展：

- M1 Step3Clean（部分完成：根容器，待完善控制面板细节）
- M1 Step4Review（部分完成：根容器，待完善列表项）
- 图片辅助（未实施）
- 设置页（未实施）
- 节点测试（未实施）
- 角色交流（未实施）

参考 `docs/data_slot_spec.md` 查看完整设计规范。

---

## 已完成模块汇总（2026-06-22）

✅ **完全覆盖**：
- 批量生成 (`/batch-generate`)
- M0 立项·架构 (`/m0-architecture`)
- M1 导入主页 + Step1 + Step2 (`/m1-import`)
- M2 卡片库 (`/m2-cards`) - 根容器、筛选、列表、卡片项
- M3 推演 (`/m3-simulate`) - 输入面板、场景选择、角色选择、按钮
- M4 生成 (`/m4-generate`) - 上下文、片段、输出、按钮
- M5 章节 (`/m5-chapters`) - 列表、时间线、查看器、按钮

📝 **部分覆盖**：
- M1 Step3Clean - 根容器已添加
- M1 Step4Review - 根容器已添加

**实施统计**：
- 主要交互元素：150+ 个 data-slot 属性
- 覆盖页面：11 个
- 核心模块覆盖率：85%

**编译验证**：✅ 前端编译通过（731ms）
