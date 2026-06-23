# 节点调试模式改进 · 实施计划

**日期**：2026-06-23
**目标文件**：`frontend/src/pages/node-test/index.tsx`（单文件修改）

---

## 需求 1：移除右边栏"参数设置"标题

### 现状
右边栏 `sidebarView === 'params'` 时，内容区从 `line 1840` 开始直接渲染 Temperature / Top P / Max Tokens 等参数表单，**无任何"参数设置"字样**。"参数设置"仅出现在 `line 66` 的注释和 `sidebarView` 枚举值命名中。

### 实施
无需代码变更。状态变量 `sidebarView` 的值 `'params'` 保持不动（Enum 名不是界面文案）。

---

## 需求 2：对比模式切换图标化

### 现状（`lines 1810-1834`）
```tsx
<Tooltip title={compareMode ? '关闭对比模式' : '对比模式'}>
  <Button
    size="small"
    icon={<ColumnWidthOutlined />}        // 始终同一图标
    type={compareMode ? 'primary' : 'default'}
    onClick={onToggle}
  />
</Tooltip>
```
图标不随对比模式状态变化。

### 实施

#### 2.1 新增依赖导入
在 `line 2` 的 import 中增加 `SwapOutlined`：
```
import { ..., ColumnWidthOutlined, SwapOutlined, ... }
```

#### 2.2 替换渲染逻辑（`lines 1811-1833`）
条件渲染图标：
- `compareMode === false` → `<ColumnWidthOutlined />`（双栏图标，暗示"可展开对比"）
- `compareMode === true` → `<SwapOutlined />` 或 `<FullscreenExitOutlined />`（暗示"退出对比"）

Tooltip 文案同步变化。

#### 2.3 确认对话框文案统一
当前 Modal 文案：
```
标题：'切换到对比模式'
内容：'对比模式下将清空当前对话并禁用历史记录。是否继续？'
```
保持不变。

### 变更范围
- 文件：`index.tsx`
- 行范围：line 2 (import) + lines 1811-1834 (render)
- 无逻辑/状态变更

---

## 需求 3：同对话内模型切换标记 + 图片模型确认弹窗

### 现状

#### 3.1 模型切换标记（`lines 221-241`）
已有 `modelChanges` 逻辑：遍历 `chatMessages`，检测相邻 assistant 消息的 `modelName`/`nodeId` 差异，在**切换发生前的最后一个 assistant 气泡**底部显示「节点名 · 模型名」标签。

已有 `lastAssistantMeta`（`lines 201-218`）：在**最新的 assistant 气泡**底部显示当前模型标签。

已有 `ChatMessage` 的 `nodeId` 和 `modelName` 字段在 `handleGenerate` / `retryMessage` / `syncSessionMessages` 中记录。

#### 3.2 气泡标签渲染（`lines 1469-1481`）
```tsx
{isLastAssistant && lastAssistantMeta && (
  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
    {lastAssistantMeta.label}
  </Typography.Text>
)}
{isModelChange && (
  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
    {isModelChange.label}
  </Typography.Text>
)}
```

#### 3.3 text↔image 切换拦截（`lines 121-159`）
已有 `prevNodeTypeRef` 机制：当 `selectedNode.nodeType` 从 `text` ↔ `image` 变化且 `chatMessages.length > 0` 时，弹 Modal 确认清空对话。

### 问题/缺口

#### 3A：切换后的首条 assistant 无显式标签
场景：用户先用节点 A 发了 3 轮消息，然后切到节点 B。当前渲染：
- 节点 A 的最后一条 assistant → `modelChanges` 标记为旧模型 ✓
- 节点 B 的第一条 assistant → `isModelChange` 不匹配（它不是"切换前"的消息），`lastAssistantMeta` 只标记**最末尾**的助理 —— 如果用户又发了一轮，这个标记就丢失了

需要：**每个模型切换后的首条 assistant 也显式标记新模型名**。

#### 3B：模型名变更节点池场景
当节点池配置更新（model 字段变化）后，相邻 assistant 消息虽然 nodeId 相同但 modelName 不同 —— 当前 `modelChanges` 已正确处理，不需额外改动。

#### 3C：切换到图片模型确认弹窗
当前 `prevNodeTypeRef` 检测已在 `useEffect` 中触发。但触发条件是 `selectedNode` 对象引用变化 —— 当用户在底部菜单点击节点时，setForm 触发 store 更新 → selectedNode 重算 → useEffect 执行，流程正确。

缺口：**若当前已有对话 (`chatMessages.length > 0`)，用户点击图片节点时弹窗确认**。当前存在但需要确认无明显 bug。

### 实施

#### 3.1 扩充 `modelChanges`：标记切换后首条

修改 `modelChanges` 逻辑，增加 `after` 类型标记：

```typescript
type ModelChangeInfo = {
  type: 'before' | 'after'
  msgId: string
  label: string
}
```

- `type: 'before'`：切换前的最后一条 assistant（当前行为，保留）
- `type: 'after'`：切换后的第一条 assistant（新增）

修改后的 `modelChanges` 伪逻辑：
```
for i in chatMessages:
  if msg.role !== 'assistant' continue
  nextAssistant = find_next_assistant(i)
  if nextAssistant:
    if model_changed(msg, nextAssistant):
      // before: 当前 msg (旧模型)
      changes.push({ type: 'before', msgId: msg.id, label: oldModelLabel })
      // after: nextAssistant (新模型) 
      changes.push({ type: 'after', msgId: nextAssistant.id, label: newModelLabel })
```

#### 3.2 气泡渲染适配新类型

```tsx
{isModelChange && (
  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
    {isModelChange.type === 'after' && '🔄 '}
    {isModelChange.label}
  </Typography.Text>
)}
```
- `type === 'after'` 前加 `🔄` 前缀，视觉区分切换方向
- 保留 `lastAssistantMeta` 逻辑（最新 assistant 底部显示）

#### 3.3 text↔image 切换确认

**现状确认**：已有 `prevNodeTypeRef` 效果，流程正确。只需确保以下边界：

- [ ] 测试：文本模式发 2 轮消息 → 点击同类型文本节点 B → 无弹窗（`nodeType === prevNodeType`）
- [ ] 测试：文本模式发 2 轮消息 → 点击图片节点 → 弹窗「切换到图片生成模式」→ 确认后清空对话
- [ ] 测试：文本模式发 2 轮消息 → 点击图片节点 → 弹窗取消 → 恢复上一个文本节点的选中状态

**代码补丁**：在 `useEffect` 中，`onCancel` 分支（`line 153-159`）当前只恢复 prevNodeType 的节点。加入 `chatMessages.length > 0` 判定冗余保护：

```typescript
onCancel: () => {
  const prevNodes = availableNodes.filter((n) => n.nodeType === prevNodeType)
  if (prevNodes.length > 0) {
    setState({ nodeTestGlobalForm: { ...nodeTestGlobalForm, nodeId: prevNodes[0].id } })
  }
  // 不改变 chatMessages，维持原对话
},
```

**当前代码已覆盖**，无需新增逻辑。

---

## 改进行为汇总

| 序号 | 改动内容 | 性质 | 风险 |
|------|---------|------|------|
| 2.2 | 图标随 compareMode 切换 | 纯 UX | 低 |
| 3.1 | modelChanges 扩展为 before/after 双标记 | 逻辑新增 | 中（需验证渲染不重复） |
| 3.2 | 气泡区分 before/after 前缀 | 渲染 | 低 |
| 3.3 | text↔image 切换确认守卫 | 已有确认 | 低（仅验证） |

## 不涉及的改动

- 后端、数据库、appStore、类型定义、API 层 —— 全部已有，无需变更
- 对比模式左右侧独立发送逻辑 —— 已有 `handleGenerateSide`，保持不变
- 历史记录的模型兼容性 —— 已有 `nodeId`/`modelName` 字段保存
