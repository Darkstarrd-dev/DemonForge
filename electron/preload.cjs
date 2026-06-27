// Electron 预加载脚本（CommonJS）。
//
// 关键：本文件必须用 CommonJS（require），而非 ESM（import）。
// 原因：BrowserWindow 默认 sandbox: true（Electron 20+），沙箱内的预加载脚本
// 运行在受限 JS 环境中，不支持 ESM import —— 用 import 会导致本脚本加载失败，
// window.electronAPI 为 undefined，前端的 window.electronAPI?.xxx 调用全部 no-op，
// 表现为「菜单栏开关、DevTools 等需要即时生效的操作必须重启 App 才生效」。
// 沙箱预加载仍可用受限 require（含 require('electron')），故这里用 CJS 即可在沙箱内正常工作。
//
// 本文件不经 tsc 编译（tsc 只处理 *.ts），由 build:electron 脚本直接拷贝到 dist-electron/。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  setMenuBarVisibility: (visible) => ipcRenderer.send('set-menu-bar', visible),
  // 4K 基准缩放：推送配置（开关 + 基准宽度），实际计算在主进程完成
  setScaleConfig: (cfg) => ipcRenderer.send('set-scale-config', cfg),
  // 捕获当前窗口内容宽度（DIP）作为缩放基准，返回该宽度
  captureScaleBase: () => ipcRenderer.invoke('capture-scale-base'),
  // 目录选择（invoke：需要返回所选路径）
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory'),
})
