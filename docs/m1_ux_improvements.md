# M1 交互体验优化

**实施日期**: 2026-06-22

## 优化内容

### 1. Step2 批量重命名卡片去重 ✅

**问题**: 批量重命名面板在预览区和已应用区各显示一次，造成重复。

**解决方案**: 
- 引入 `appliedViewMode` 状态标记，区分"预览模式"和"已应用模式"
- 预览模式：显示检测结果、模式选择、预览列表、应用按钮
- 已应用模式：仅显示取消/AI清理按钮 + 批量重命名面板 + 已切分表格

### 2. 应用切分后的视图切换 ✅

**需求**: 点击"应用切分"后，隐藏前置选项，简化界面。

**实现**:
```typescript
const [appliedViewMode, setAppliedViewMode] = useState(false)
```

**交互流程**:
1. 用户点击"应用切分" → `appliedViewMode = true`
2. 隐藏以下元素：
   - `alert-detect-result` (检测结果提示)
   - `select-pattern` (模式选择单选框)
   - `input-custom-regex` (自定义正则输入)
   - `toggle-keep-prologue` (序章选项)
   - `alert-preview-summary` (预览摘要)
   - `list-chapters` (预览章节列表)
3. 显示以下元素：
   - "取消" 按钮（左）
   - "AI 清理" 按钮（右，主按钮）
   - 批量重命名折叠面板
   - 已切分章节表格

### 3. 取消按钮功能 ✅

**功能**: 点击"取消"按钮回到应用切分前的预览状态。

**实现**:
```typescript
const cancelApplied = () => {
  setAppliedViewMode(false)
}
```

**行为**:
- 回到预览模式，重新显示检测结果、模式选择、预览列表
- 章节数据保持不变（已切分的章节保留在 `session.chapters` 中）
- 用户可以重新调整切分参数，再次"应用切分"

### 4. Step3 节点池自动折叠 ✅

**需求**: 用户点击"开始清理"后，节点池自动折叠，减少滚动距离。

**实现**:
```typescript
// 从 defaultActiveKey 改为受控 activeKey
<Collapse
  activeKey={running ? [] : ['nodes']}  // running=true 时折叠
  items={[...]}
/>
```

**行为**:
- 清理未开始时：节点池默认展开
- 点击"开始清理"后：节点池自动折叠
- 用户仍可手动点击展开/折叠

## 用户体验改进

### 优化前
1. 批量重命名面板出现两次，造成混淆
2. 应用切分后，所有选项仍显示，页面冗长
3. 需要长距离滚动才能看到已切分表格和下一步按钮
4. Step3 开始清理后，节点池仍展开占用大量空间

### 优化后
1. ✅ 批量重命名面板仅在合适时机显示一次
2. ✅ 应用切分后界面简洁，焦点明确
3. ✅ 操作按钮在顶部，表格紧随其后
4. ✅ 清理开始后自动折叠节点池，焦点转移到任务列表和实时窗口

## 代码变更

### `Step2Split.tsx`
- 新增 `appliedViewMode` 状态（布尔值）
- 新增 `cancelApplied()` 方法
- 修改 `applySplit()` 方法，设置 `appliedViewMode = true`
- 重构渲染逻辑，根据 `appliedViewMode` 条件渲染不同区块

### `Step3Clean.tsx`
- 将节点池 `Collapse` 的 `defaultActiveKey` 改为受控 `activeKey`
- 根据 `running` 状态动态控制折叠状态

## 测试验证

- [x] TypeScript 编译通过（无类型错误）
- [ ] 浏览器功能测试（待用户验证）
  - Step2: 应用切分 → 取消 → 再次应用
  - Step2: 批量重命名在已应用模式下的可用性
  - Step3: 开始清理后节点池自动折叠
