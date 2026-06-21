# 4K 基准缩放功能说明

## 功能概述

4K 基准缩放功能允许应用以 4K 分辨率（3840px 宽度）为设计基准，在不同分辨率的屏幕上自动等比例缩放，保持布局完全一致。

## 使用场景

- 在 4K 显示器上设计和调试界面
- 在 1080P 或其他分辨率显示器上查看时保持相同的视觉布局
- 多显示器环境下切换使用

## 工作原理

### 缩放计算

```
zoomFactor = 当前窗口宽度 / 3840px （当窗口 < 3840px 时）
zoomFactor = 1.0 （当窗口 >= 3840px 时）
```

例如：
- 4K 屏幕 (3840px)：zoomFactor = 1.0（原始大小，与关闭开关一致）
- 1080P 屏幕 (1920px)：zoomFactor = 0.5（缩小一半）
- 2K 屏幕 (2560px)：zoomFactor = 0.667（缩小约1/3）

### 技术实现

**使用 Electron 原生 API 实现**（非 CSS 方案）

1. **Electron 主进程** (`electron/main.ts`)
   - 注册 IPC 事件监听 `set-zoom-factor`
   - 调用 `webContents.setZoomFactor()` 设置缩放比例
   - 浏览器引擎层面缩放，自动处理所有视口单位

2. **Electron 预加载脚本** (`electron/preload.cjs`)
   - 通过 `contextBridge` 暴露 `setZoomFactor` 方法
   - 前端可通过 `window.electronAPI.setZoomFactor()` 调用

3. **前端缩放组件** (`frontend/src/components/ScaleWrapper.tsx`)
   - 监听窗口 resize 事件
   - 根据开关状态和窗口宽度计算 zoomFactor
   - 调用 Electron API 应用缩放
   - 直接渲染子组件，无需额外包装

4. **状态管理**
   - `appStore.enable4KScale` 字段（默认关闭）
   - 持久化到 `settings.json`
   - 设置页面提供开关界面

### 为什么选择 Electron 原生方案

**CSS 方案的问题**（已废弃）：

- `transform: scale()` - 只缩放渲染，不影响布局，导致视口单位（vh/vw）计算错误
- `CSS zoom` - 同时影响布局和渲染，但在响应式布局中表现异常

**Electron 原生方案的优势**：

- ✅ 在浏览器引擎层面缩放，完美处理所有 CSS 单位
- ✅ 自动处理响应式布局（vh/vw/%/calc 等）
- ✅ 无需修改现有前端代码
- ✅ 性能优秀，硬件加速
- ✅ 在 4K 全屏时，开启/关闭开关显示完全一致

## 使用方法

### 启用功能

1. 打开应用，进入「系统设置」页面
2. 找到「界面设置」区域
3. 开启「4K 基准缩放」开关
4. 调整窗口大小观察效果

### 禁用功能

1. 关闭「4K 基准缩放」开关
2. 应用恢复为正常显示（zoomFactor = 1）

## 注意事项

### 优点

- ✅ 完全保持布局结构不变
- ✅ 所有元素按比例缩放，视觉效果一致
- ✅ 适合在不同分辨率屏幕间切换
- ✅ 4K 全屏时，开关状态不影响显示效果

### 限制

- ⚠️ 在小屏幕上可能导致内容过小
- ⚠️ 某些交互元素（如按钮）可能过小难以点击
- ⚠️ 文本在缩小后可能不够清晰
- ⚠️ 不适合移动设备或小尺寸窗口
- ⚠️ 仅在 Electron 环境下生效（浏览器直接访问无效）

### 建议

- 主要在 4K 显示器上开发和使用
- 在 1080P 及以下分辨率建议关闭此功能
- 根据实际使用场景决定是否启用

## 相关文件

### Electron
- `electron/main.ts` - IPC 事件监听和 setZoomFactor 调用
- `electron/preload.cjs` - contextBridge API 暴露

### 前端
- `frontend/src/components/ScaleWrapper.tsx` - 缩放逻辑组件
- `frontend/src/main.tsx` - 应用主入口，集成 ScaleWrapper
- `frontend/src/pages/settings/index.tsx` - 设置页面开关
- `frontend/src/vite-env.d.ts` - TypeScript 类型定义

### 状态管理
- `frontend/src/store/appStore.ts` - enable4KScale 字段定义和持久化

## 技术细节

### Electron API 调用流程

```typescript
// 1. 前端计算缩放比例
const zoomFactor = window.innerWidth / 3840

// 2. 通过 IPC 发送到主进程
window.electronAPI.setZoomFactor(zoomFactor)

// 3. 主进程应用缩放
mainWindow.webContents.setZoomFactor(zoomFactor)
```

### 为什么废弃 CSS 方案

经过多次尝试，CSS 方案（`transform: scale()` 和 `CSS zoom`）都无法正确处理响应式布局：

1. **`transform: scale()` 问题**：
   - 只缩放渲染像素，不改变布局计算
   - `100vh` 仍按原始视口计算
   - 导致高度只显示半截

2. **`CSS zoom` 问题**：
   - 虽然同时影响布局和渲染
   - 但从外层缩放整个视口
   - 导致内容缩到左上角

3. **根本矛盾**：
   - 响应式布局依赖视口单位（vh/vw/%）动态计算
   - CSS 缩放无法正确传递视口信息给布局引擎
   - 需要重构整个 CSS 体系才能解决

**Electron 原生方案完美解决**：在浏览器引擎层面缩放，视口单位计算完全正确。

## 性能考虑

- 使用浏览器引擎内置缩放，硬件加速
- resize 事件使用 useEffect 订阅，自动清理
- 开关关闭时 zoomFactor = 1，无性能损耗
- 非 Electron 环境自动降级，不报错

## 未来改进方向

1. 支持自定义基准宽度（不限于 4K）
2. 提供预设方案（4K/2K/1080P）
3. 智能检测屏幕分辨率自动启用/禁用
4. 优化小屏幕体验（最小缩放比例限制）
5. 记忆每个显示器的缩放偏好

