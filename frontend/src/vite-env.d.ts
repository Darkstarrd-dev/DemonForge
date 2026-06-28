/// <reference types="vite/client" />

interface ElectronAPI {
  setMenuBarVisibility: (visible: boolean) => void
  /** 推送 4K 基准缩放配置（开关 + 基准宽度 DIP），计算在主进程完成 */
  setScaleConfig: (cfg: { enabled: boolean; baseWidth: number }) => void
  /** 捕获当前窗口内容宽度（DIP）作为缩放基准，返回该宽度 */
  captureScaleBase: () => Promise<number>
  /** 打开原生目录选择对话框；取消返回 null */
  pickDirectory?: () => Promise<string | null>
  /** 用系统文件管理器打开指定目录；返回 '' 成功，否则为错误串 */
  openPath?: (dir: string) => Promise<string>
}

interface Window {
  electronAPI?: ElectronAPI
}
