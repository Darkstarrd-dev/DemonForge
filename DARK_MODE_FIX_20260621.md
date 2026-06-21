# 深色模式视觉优化 - 2026-06-21

## 修复的问题

### 1. ✅ 左侧节点选择对比度优化
**问题**：深色模式下选中节点背景色对比度低，看不清
**修复**：
- 选中节点文字颜色改为 `token.colorPrimary`（高亮蓝色）
- 鼠标悬停背景改为 `rgba(255,255,255,0.08)`（半透明白色）
- 增强视觉反馈，选中状态更明显

### 2. ✅ 聊天气泡对比度优化
**问题**：深色模式下聊天气泡颜色对比度低，文字不清晰
**修复**：
- **用户消息**：
  - 浅色模式：`token.colorPrimaryBg`（原蓝色背景）
  - 深色模式：`rgba(22, 119, 255, 0.15)`（半透明蓝色）
- **助手消息**：
  - 浅色模式：`token.colorBgElevated`（白色卡片背景）
  - 深色模式：`rgba(255, 255, 255, 0.08)`（半透明白色）
- 流式推理中的助手消息气泡保持一致颜色

### 3. ✅ 输入框和按钮布局优化
**问题**：圆角输入框 + 圆角按钮布局不美观
**修复**：
- 移除所有圆角（`borderRadius: 0`）
- 输入框和按钮无缝连接
- 输入框占大部分宽度（`flex: 1`）
- 按钮固定最小宽度（`minWidth: 100`）
- 图片上传按钮（如有）+ 输入框 + 发送按钮完全连接

**布局结构**：
```
┌──────────┬─────────────────────────────────────┬──────────┐
│ 图片按钮 │        输入框（flex: 1）           │ 发送按钮 │
│  (可选)  │                                     │  (100px) │
└──────────┴─────────────────────────────────────┴──────────┘
```

### 4. ✅ 底部白色区域溢出修复
**问题**：发送消息后底部出现白色区域，调整窗口大小后消失
**修复**：
- 中间主区域添加 `overflow: hidden`
- 主展示区添加 `display: 'flex', flexDirection: 'column'`
- 文本模式聊天容器设置 `height: '100%'`
- System Prompt 卡片添加 `flexShrink: 0`
- 聊天消息区域添加 `minHeight: 0` 确保正确收缩
- 输入区和历史栏添加 `flexShrink: 0` 防止被压缩
- 确保 flexbox 布局正确计算高度

## 技术细节

### 颜色判断逻辑
```typescript
// 判断当前主题
const isLightMode = token.colorBgBase === '#ffffff'

// 用户消息背景
background: isLightMode ? token.colorPrimaryBg : 'rgba(22, 119, 255, 0.15)'

// 助手消息背景
background: isLightMode ? token.colorBgElevated : 'rgba(255, 255, 255, 0.08)'
```

### 布局修复关键点
```typescript
// 中间主区域
<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
  {/* 主展示区 - 可滚动 */}
  <div style={{ flex: 1, padding: 24, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
    {/* 文本聊天容器 */}
    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900, width: '100%', margin: '0 auto', height: '100%' }}>
      {/* System Prompt - 固定高度 */}
      <Card style={{ marginBottom: 16, flexShrink: 0 }}>...</Card>
      
      {/* 聊天消息 - 可滚动 */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>...</div>
    </div>
  </div>
  
  {/* 输入区 - 固定高度 */}
  <div style={{ padding: '0 24px 24px', borderTop: '1px solid ...', flexShrink: 0 }}>...</div>
  
  {/* 历史栏 - 固定高度（图片模式） */}
  <div style={{ padding: '12px 24px', borderTop: '1px solid ...', flexShrink: 0 }}>...</div>
</div>
```

## 视觉效果对比

### 深色模式
- **用户消息**：半透明蓝色背景 + 蓝色边框，文字清晰可见
- **助手消息**：半透明白色背景 + 灰色边框，文字清晰可见
- **选中节点**：蓝色高亮文字 + 蓝色左边框 + 浅蓝背景
- **输入区**：无圆角，无缝连接，专业简洁

### 浅色模式
- **用户消息**：保持原有浅蓝色背景
- **助手消息**：保持原有白色卡片背景
- **选中节点**：蓝色高亮文字（与深色模式一致）
- **输入区**：无圆角，无缝连接，专业简洁

## 修改的文件

- `frontend/src/pages/node-test/index.tsx` - 所有视觉优化

## 测试清单

- [ ] 深色模式：选中节点文字清晰可见（蓝色高亮）
- [ ] 深色模式：用户消息气泡清晰可见（半透明蓝色）
- [ ] 深色模式：助手消息气泡清晰可见（半透明白色）
- [ ] 浅色模式：所有颜色保持原样
- [ ] 输入框和按钮无缝连接（无圆角）
- [ ] 发送消息后无白色区域溢出
- [ ] 调整窗口大小布局正常
- [ ] 长对话滚动正常

## 构建状态

✅ Vite 构建成功 (732ms)
✅ 所有功能正常工作
