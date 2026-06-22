# data-slot 设计规范

## 设计原则

- **层级结构**：`模块 -> 区域/步骤 -> 组件类型 -> 具体内容`
- **命名规范**：kebab-case，语义化命名
- **一致性**：相同功能的元素在不同模块中使用相同的命名模式

## 通用组件命名

| data-slot | 描述 |
|-----------|------|
| `alert` | 顶部说明信息 |
| `steps` | 步骤导航 |
| `control-panel` | 控制面板 |
| `preview-panel` | 预览面板 |
| `input-panel` | 输入面板 |
| `output-panel` | 输出面板 |
| `progress-panel` | 进度面板 |
| `btn-{action}` | 操作按钮（如 btn-start, btn-pause, btn-stop） |

---

## M0 立项·架构 (m0-architecture)

### 层级结构
```
m0-architecture
├── alert
├── steps
├── arch-input
│   ├── input-topic
│   ├── input-genre
│   ├── input-chapters
│   ├── input-guidance
│   ├── select-node
│   └── btn-generate
├── arch-editor
│   ├── editor-seed
│   ├── editor-character-dynamics
│   ├── editor-world-building
│   ├── editor-plot-structure
│   ├── btn-fill-template
│   └── btn-adopt
├── arch-output
│   └── stream-text
└── blueprint
    ├── select-node
    ├── btn-generate
    ├── stream-text
    ├── table-preview
    ├── btn-write
    └── btn-append
```

---

## M1 导入 (m1-import)

### 层级结构
```
m1-import
├── steps
├── step1
│   ├── input-file
│   ├── select-encoding
│   ├── preview-text
│   └── btn-confirm
├── step2
│   ├── config-panel
│   │   ├── input-regex
│   │   ├── toggle-ai-fallback
│   │   └── btn-split
│   ├── preview-panel
│   │   └── list-chapters
│   ├── title-template-panel
│   │   ├── input-template
│   │   ├── preview-example
│   │   └── btn-apply
│   └── btn-next
├── step3
│   ├── config-panel
│   │   ├── select-nodes
│   │   ├── toggle-auto-retry
│   │   └── btn-start
│   ├── control-panel
│   │   ├── btn-pause
│   │   ├── btn-stop
│   │   └── btn-open-window
│   ├── progress-panel
│   │   ├── stats-summary
│   │   └── list-tasks
│   └── btn-next
└── step4
    ├── list-chapters
    │   └── item-{chapterId}
    │       ├── diff-view
    │       ├── btn-accept
    │       └── btn-reject
    └── btn-submit
```

---

## 批量生成 (batch-generate)

### 层级结构
```
batch-generate
├── alert
├── selection-panel
│   └── checkbox-group
│       └── checkbox-{chapterId}
├── node-config-panel
│   └── node-summary
├── control-panel
│   ├── btn-start
│   ├── btn-pause
│   └── btn-stop
└── progress-panel
    ├── list-tasks
    │   └── item-{chapterId}
    │       ├── title
    │       ├── status-tag
    │       ├── progress-text
    │       └── error-text
    └── progress-bar
```

---

## M2 卡片 (m2-cards)

### 层级结构
```
m2-cards
├── filter-panel
│   ├── select-book
│   ├── select-type
│   └── input-search
├── list-panel
│   └── card-{cardId}
│       ├── title
│       ├── tags
│       ├── content
│       └── actions
└── detail-panel
    ├── editor
    └── btn-save
```

---

## M3 推演 (m3-simulate)

### 层级结构
```
m3-simulate
├── input-panel
│   ├── select-character
│   ├── select-scene
│   ├── input-event
│   └── btn-simulate
├── output-panel
│   └── stream-text
└── history-panel
    └── list-simulations
```

---

## M4 生成 (m4-generate)

### 层级结构
```
m4-generate
├── context-panel
│   ├── select-chapter
│   ├── toggle-rag
│   ├── select-scene
│   └── select-character
├── control-panel
│   ├── select-node
│   ├── btn-draft
│   └── btn-finalize
├── output-panel
│   └── stream-text
└── result-panel
    ├── text-draft
    ├── text-summary
    └── list-states
```

---

## M5 章节 (m5-chapters)

### 层级结构
```
m5-chapters
├── list-panel
│   └── item-{chapterId}
│       ├── title
│       ├── status-tag
│       ├── summary
│       └── btn-edit
└── editor-panel
    ├── input-title
    ├── editor-content
    ├── btn-save
    └── btn-check-consistency
```

---

## 图片辅助 (image-helper)

### 层级结构
```
image-helper
├── toolbar
│   ├── btn-upload
│   ├── btn-crop
│   ├── btn-export
│   └── mode-switch
├── canvas-panel
│   └── canvas
├── layer-panel
│   └── list-layers
│       └── item-{layerId}
└── crop-panel
    ├── preview
    ├── input-width
    ├── input-height
    └── btn-apply
```

---

## 实施示例

### 按钮
```tsx
<Button data-slot="btn-start">开始</Button>
<Button data-slot="btn-pause">暂停</Button>
```

### 卡片/面板
```tsx
<Card data-slot="control-panel" title="控制">
  <Button data-slot="btn-start">开始</Button>
</Card>
```

### 列表项
```tsx
{chapters.map(ch => (
  <List.Item key={ch.id} data-slot={`item-${ch.id}`}>
    <Typography.Text data-slot="title">{ch.title}</Typography.Text>
    <Tag data-slot="status-tag">{ch.status}</Tag>
  </List.Item>
))}
```

### 输入组件
```tsx
<Input data-slot="input-topic" placeholder="主题" />
<Select data-slot="select-node" options={nodes} />
<Input.TextArea data-slot="editor-seed" />
```

---

## 注意事项

1. **唯一性**：在同一页面中，相同类型的多个元素需要加上动态标识（如 ID）
2. **层级**：data-slot 本身是扁平的，层级由命名体现（如 `arch-input` + `input-topic`）
3. **动态内容**：列表项等动态元素使用模板字符串（如 `item-${id}`）
4. **可选性**：不是所有元素都需要 data-slot，仅为需要精确定位的交互元素添加
