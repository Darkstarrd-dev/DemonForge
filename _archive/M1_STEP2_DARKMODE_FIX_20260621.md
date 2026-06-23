# M1 Step2 深色模式修复 - 2026-06-21

## 修复的问题

### ✅ 选中章节背景色
**问题**：选中章节时背景色硬编码为 `#e6f4ff`（浅蓝色），深色模式下不适配
**修复**：使用 `token.colorPrimaryBg` 动态适配主题

**代码变更**：
```typescript
// 导入 theme
import { theme } from 'antd'

// 组件中获取 token
const { token } = theme.useToken()

// List.Item 样式
<List.Item
  onClick={() => toggleSelect(i)}
  style={{
    cursor: 'pointer',
    background: selectedIdx === i ? token.colorPrimaryBg : undefined,
  }}
>
```

### ℹ️ Alert 组件
Alert 组件（顶部的自动检测提示和底部的预计切分提示）由 Ant Design 主题系统自动适配，无需手动修复。

## 视觉效果

### 浅色模式
- **选中章节**：浅蓝色背景（`#e6f4ff`）
- **Alert**：标准 Ant Design 浅色主题

### 深色模式
- **选中章节**：主题蓝色背景（`token.colorPrimaryBg`）
- **Alert**：标准 Ant Design 深色主题

## 修改的文件
- `frontend/src/pages/m1-import/Step2Split.tsx`

## 构建状态
✅ Vite 构建成功 (744ms)
✅ 所有功能正常工作
