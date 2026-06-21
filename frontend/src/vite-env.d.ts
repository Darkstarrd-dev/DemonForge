/// <reference types="vite/client" />

interface ElectronAPI {
  setMenuBarVisibility: (visible: boolean) => void
  setZoomFactor: (factor: number) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
