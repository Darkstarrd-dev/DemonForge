# Sidebar 作品选择器修复 - 2026-06-21

## 问题
当前作品下拉框移到 sidebar 后，在没有作品时完全不显示，用户看不到这个功能区域。

## 修复
修改 `AppLayout.tsx`，让"当前作品"区域始终显示：
- **有作品时**：显示下拉框选择器
- **没有作品时**：显示"暂无作品"提示文字

## 代码变更
```typescript
{/* 当前作品选择器（移到 sidebar） */}
<div style={{ padding: '8px 16px', borderBottom: '1px solid #303030' }}>
  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4, color: 'rgba(255,255,255,0.45)' }}>
    当前作品
  </Typography.Text>
  {projects.length > 0 ? (
    <Select
      style={{ width: '100%' }}
      size="small"
      value={currentBookId}
      onChange={(v) => setState({ currentBookId: v })}
      options={projects.map((b) => ({ value: b.id, label: b.title }))}
      dropdownStyle={{ minWidth: 180 }}
    />
  ) : (
    <Typography.Text type="secondary" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
      暂无作品
    </Typography.Text>
  )}
</div>
```

## 用户体验改进
- 用户始终能看到"当前作品"功能区域
- 清楚知道这里是用来选择作品的
- 没有作品时有友好的提示

## 构建状态
✅ Vite 构建成功 (718ms)
✅ 所有功能正常
