# 4K 基准缩放功能说明

## 功能概述

以「4K 显示器上最大化时的布局」为基准，在其他分辨率/DPI 的显示器上自动等比缩放整个窗口内容，
**保持同一套布局**（不重排、不换行），实现跨显示器移动窗口时的视觉一致性。

## 工作原理

### 缩放计算（主进程为唯一真相源）

```
zoom = 当前内容宽度(DIP) / 基准宽度(DIP)        （开启且已捕获基准时）
zoom = 1                                         （关闭或未捕获基准时）
```

- **基准宽度**由用户在 4K 显示器上最大化窗口后「捕获」得到（记录当时的内容宽度，DIP 单位）。
  因此基准屏上 `当前宽 == 基准宽 → zoom = 1`，**4K 最大化保持不变**，无需猜测系统 DPI。
- 缩放比仅做安全钳制 `[0.25, 5]`（Chromium 支持区间）；**不钳到 1** —— 移动到比基准更宽的屏时
  需要放大才能维持同一套布局。

### 为什么用 DIP 宽度 + 在主进程计算（关键修复）

历史版本一直闪烁（界面来回缩小/恢复跳动），根因是**反馈环**：

1. 旧实现在渲染进程用 `window.innerWidth / 3840` 算缩放比；
2. 但 `window.innerWidth` 是 **CSS 像素**，会随 `setZoomFactor` 反向变化；
3. 用受缩放影响的量去计算缩放 → 自激振荡：
   `缩小 → innerWidth 变大 → 判定无需缩放 → 恢复 → innerWidth 变小 → 再缩小 → …`

修复方案：把计算移到**主进程**，改用 `mainWindow.getContentBounds().width`——
该值是 **DIP**（设备无关像素，已被系统 DPI 除过），且**完全不受 `setZoomFactor` 影响**，
反馈环被彻底切断。又因 `DIP = 物理像素 / 系统DPI`，公式中系统 DPI 自动抵消，
**缩放结果与各屏 DPI 设置无关**，天然适配 Windows DPI 缩放。

> 旧实现的第二个错误：把基准硬编码为 `3840`。在 4K@200% 上最大化时实际内容宽只有 1920 DIP，
> 拿 3840 去除会把 4K 视图再缩一半。改为「捕获当前窗口」后，基准即用户真实设计环境的宽度，
> 不再依赖 DPI 假设。

## 技术实现

| 层 | 文件 | 职责 |
|---|---|---|
| 主进程 | `electron/main.ts` | `applyAdaptiveZoom()` 计算并应用缩放；监听 `resize`/`move`/`maximize`/`unmaximize`/`display-metrics-changed`（防抖）+ `did-finish-load` 重应用；IPC `set-scale-config` / `capture-scale-base` |
| 预加载 | `electron/preload.cjs` | 暴露 `setScaleConfig(cfg)` 与 `captureScaleBase()` |
| 前端组件 | `frontend/src/components/ScaleWrapper.tsx` | 仅在开关/基准变化时把配置推给主进程；不测量、不监听 resize |
| 状态 | `frontend/src/store/appStore.ts` | `enable4KScale` + `scaleBaseWidth`，持久化并在 bootstrap 回载 |
| 设置页 | `frontend/src/pages/settings/index.tsx` | 开关 + 「以当前窗口为基准」按钮 + 当前基准显示 |

## 使用方法

1. 进入「系统设置 → 通用设置」。
2. 在 **4K 显示器上最大化** 应用窗口。
3. 点「以当前窗口为基准」记录基准布局（会显示「当前基准：xxxxpx」）。
4. 开启「4K 基准缩放」开关。
5. 之后把窗口移动/最大化到其他显示器，内容会按宽度等比缩放，保持同一套布局。

> 仅在 Electron 环境生效；浏览器直接访问时为 no-op。

## 注意事项

- ⚠️ 基准应在目标「设计屏」（4K）最大化时捕获；换了主显示器/改了分辨率可重新捕获。
- ⚠️ 在远小于基准的窗口上内容会显著缩小（按宽度等比，符合预期）。
- ⚠️ 缩放比下限 0.25、上限 5。
