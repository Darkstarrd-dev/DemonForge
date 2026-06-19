/// <reference types="vite/client" />

interface ElectronAPI {
  setMenuBarVisibility: (visible: boolean) => void
}

interface Window {
  electronAPI?: ElectronAPI
}
