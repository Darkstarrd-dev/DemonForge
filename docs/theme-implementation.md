# 主题系统实现文档

## 实现时间
2026-06-21

## 功能概述
为 novelhelper 添加了完整的主题切换系统，支持浅色（Light）和深色（Dark）两种模式，所有主题均采用暖色调设计。

## 新增文件

### 1. frontend/src/styles/theme.ts
主题配置文件，定义了两套完整的主题：

#### Light 主题（暖色调）
- **主色调**: #C4612F (terracotta 土色)
- **背景色**: 
  - Layout: #F7F4EF (暖奶油色)
  - Container: #FBF9F5 (浅暖白)
  - Elevated: #FFFFFF (纯白)
- **边框色**: #E7E1D7 (暖灰边框)
- **文本色**: #1F2421 (深暖黑) / #5C635D (次级灰)

#### Dark 主题（暖色调深色）
- **主色调**: #D97845 (更亮的暖橙，适配深色背景)
- **背景色**: 
  - Layout: #1A1614 (深暖黑)
  - Container: #2A2420 (暖棕灰)
  - Elevated: #3C3835 (中灰)
- **边框色**: #4A4542 (深暖灰)
- **文本色**: #E8E6E3 (暖白) / #B8B3AE (次级暖灰)

## 修改的文件

### 1. frontend/src/store/appStore.ts
**新增字段**:
```typescript
theme: 'light' | 'dark'  // 默认 'light'
```

**修改函数**:
- `settingsPayload()`: 添加 `theme` 字段
- `bootstrapStore()`: 添加 `theme` 加载逻辑
- 订阅器: 添加 `theme` 变化检测

### 2. frontend/src/main.tsx
**主要改动**:
- 导入 `lightTheme` 和 `darkTheme`
- 创建 `AppWithTheme` 组件包装整个应用
- 使用 `useAppStore` 订阅主题变化
- 根据主题动态切换 `ConfigProvider` 的 `theme` 属性
- 设置 `body[data-theme]` 属性供 CSS 使用

### 3. frontend/src/pages/settings/index.tsx
**新增标签页**: "通用设置"

包含两个设置卡片:
1. **主题外观**
   - 使用 `Segmented` 组件切换主题
   - 图标: 🌞 浅色 / 🌙 深色
   - 切换后立即保存到后端

2. **菜单栏** (现有功能移入)
   - 控制 Electron 菜单栏显示/隐藏

### 4. frontend/src/index.css
**新增样式**:
```css
[data-theme='dark'] .stream-pane {
  background: #0a0806;
  color: #e8e6e3;
  border: 1px solid #3c3835;
}
```

深色主题下的代码高亮区域样式。

## 技术实现细节

### 主题切换流程
1. 用户在设置页点击主题切换
2. 更新 `appStore.theme` 状态
3. 触发 `AppWithTheme` 组件重新渲染
4. `ConfigProvider` 接收新的主题配置
5. 设置 `body[data-theme]` 属性
6. Ant Design 组件自动应用新主题
7. 自定义 CSS 通过 `[data-theme]` 选择器生效
8. 主题配置自动保存到 `settings.json`

### 持久化策略
- **前端**: Zustand store (`theme` 字段)
- **后端**: `settings.json` 文件
- **同步机制**: 
  - 启动时从后端加载
  - 切换时立即保存（debounced）
  - 导入/导出设置时包含主题

### 响应式设计
所有主题配置都完整支持 Ant Design 的组件体系：
- Layout (Header/Sider/Content)
- Menu (包括深色侧边栏)
- Card / Table / Form
- Button / Input / Select
- Tag / Alert / Modal

## 设计原则

### 1. 暖色调一致性
无论浅色还是深色主题，都采用暖色调：
- 避免冷蓝色 (#1677ff)
- 使用土色/橙色作为主色
- 背景采用奶油色/暖灰色而非纯白/纯黑

### 2. 视觉舒适度
- 深色主题避免纯黑，使用 #1A1614 减少对比度
- 文本色使用暖白 #E8E6E3 而非纯白
- 所有颜色都有细微的暖色偏移

### 3. 语义化
- 主色用于强调和主要操作
- 成功/警告/错误色保持 Ant Design 标准
- 链接色与主色一致

## 用户体验

### 主题切换
- **位置**: 设置 → 通用设置 → 主题外观
- **控件**: Segmented 分段控制器（🌞/🌙）
- **反馈**: 即时切换 + Toast 提示
- **记忆**: 下次启动自动应用上次选择

### 兼容性
- ✅ 所有现有页面无需修改
- ✅ 自定义组件自动继承主题
- ✅ 流式输出窗口 (`.stream-pane`) 特殊处理
- ✅ 深色主题下代码高亮区域适配

## 测试建议

### 功能测试
1. 切换主题后刷新页面，主题应保持
2. 导出设置包含 `theme` 字段
3. 导入设置能正确恢复主题
4. 所有页面在两种主题下都清晰可读

### 视觉测试
检查以下页面在两种主题下的表现：
- [ ] 书库概览
- [ ] M0 立项架构
- [ ] M1 文本导入（特别是实时窗口）
- [ ] M4 章节生成
- [ ] M5 章节管理
- [ ] 设置页面
- [ ] 批量生产

### 边界测试
- [ ] 从旧版本升级（无 `theme` 字段）
- [ ] 并发切换主题
- [ ] Electron 窗口缩放下的主题表现

## 后续扩展

### 可选改进
1. **自动切换**: 根据系统时间自动切换（夜间模式）
2. **跟随系统**: 使用 `prefers-color-scheme` 媒体查询
3. **自定义主题**: 允许用户调整主色
4. **更多预设**: 添加"高对比度"等无障碍主题

### 代码优化
1. 将主题配置抽取为 design tokens
2. 使用 CSS 变量替代硬编码颜色
3. 为第三方组件添加主题适配

## 文件清单

### 新增
- `frontend/src/styles/theme.ts`
- `docs/theme-implementation.md` (本文档)

### 修改
- `frontend/src/store/appStore.ts`
- `frontend/src/main.tsx`
- `frontend/src/pages/settings/index.tsx`
- `frontend/src/index.css`

## 总结

主题系统已完整实现，包括：
- ✅ 浅色/深色两套完整主题
- ✅ 暖色调设计语言
- ✅ 设置页 UI 集成
- ✅ 持久化支持
- ✅ 导入/导出兼容
- ✅ 零侵入现有代码

所有改动仅涉及前端层，未触及后端逻辑和数据库结构，可以安全部署。
