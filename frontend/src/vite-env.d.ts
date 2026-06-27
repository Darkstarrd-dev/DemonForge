/// <reference types="vite/client" />

interface ElectronAPI {
  setMenuBarVisibility: (visible: boolean) => void
  setZoomFactor: (factor: number) => void
  /** 打开原生目录选择对话框；取消返回 null */
  pickDirectory?: () => Promise<string | null>
}

interface Window {
  electronAPI?: ElectronAPI
}
