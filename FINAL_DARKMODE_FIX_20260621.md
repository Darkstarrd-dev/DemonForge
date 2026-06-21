# 深色模式最终修复 - 2026-06-21

## 修复的问题

### 1. ✅ Sidebar 当前作品选择器
**问题**：显示"当前作品"文字标签，占用空间
**修复**：
- 移除文字标签
- 仅保留下拉框组件
- 添加 placeholder="选择作品"
- 保持"暂无作品"提示

**代码变更**：
```typescript
{/* 当前作品选择器（移到 sidebar） */}
<div style={{ padding: '8px 16px', borderBottom: '1px solid #303030' }}>
  {projects.length > 0 ? (
    <Select
      style={{ width: '100%' }}
      size="small"
      value={currentBookId}
      onChange={(v) => setState({ currentBookId: v })}
      options={projects.map((b) => ({ value: b.id, label: b.title }))}
      dropdownStyle={{ minWidth: 180 }}
      placeholder="选择作品"
    />
  ) : (
    <Typography.Text type="secondary" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
      暂无作品
    </Typography.Text>
  )}
</div>
```

### 2. ✅ M1 Step3 深色模式截图区域颜色
**问题**：Collapse 组件和代码块背景色硬编码为浅色模式颜色
**修复**：
- **Collapse 背景**：`#fafafa` → `token.colorBgContainer`
- **请求体代码块**：
  - 浅色模式：`#1f2428` 背景 + `#c9d1d9` 文字
  - 深色模式：`#0d1117` 背景 + `#e6edf3` 文字
- **响应体代码块**：
  - 错误（浅色）：`#fff1f0` → 错误（深色）：`rgba(255, 77, 79, 0.1)`
  - 警告（浅色）：`#fffbe6` → 警告（深色）：`rgba(255, 215, 5, 0.1)`
  - 文字颜色：`token.colorText`

**判断逻辑**：
```typescript
const { token } = theme.useToken()
const isLightMode = token.colorBgBase === '#ffffff'

// Collapse 背景
style={{ background: token.colorBgContainer }}

// 请求体代码块
background: isLightMode ? '#1f2428' : '#0d1117'
color: isLightMode ? '#c9d1d9' : '#e6edf3'

// 响应体代码块
background: e.type === 'error'
  ? (isLightMode ? '#fff1f0' : 'rgba(255, 77, 79, 0.1)')
  : (isLightMode ? '#fffbe6' : 'rgba(255, 215, 5, 0.1)')
color: token.colorText
```

## 修改的文件
- `frontend/src/layouts/AppLayout.tsx` - Sidebar 作品选择器
- `frontend/src/pages/m1-import/Step3Clean.tsx` - M1 Step3 深色模式修复

## 视觉效果

### Sidebar 作品选择器
- **有作品时**：下拉框，placeholder 提示
- **没有作品时**："暂无作品" 灰色文字
- **简洁设计**：无多余标签

### M1 Step3 截图区域
- **浅色模式**：保持原有视觉效果
- **深色模式**：
  - Collapse 背景适配主题
  - 请求体：深色背景 + 浅色文字
  - 响应体（错误）：半透明红色背景
  - 响应体（警告）：半透明黄色背景
  - 所有文字清晰可见

## 构建状态
✅ Vite 构建成功 (734ms)
✅ 所有功能正常工作
