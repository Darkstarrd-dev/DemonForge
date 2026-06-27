import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  setMenuBarVisibility: (visible: boolean) => ipcRenderer.send('set-menu-bar', visible),
  setZoomFactor: (factor: number) => ipcRenderer.send('set-zoom-factor', factor),
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory'),
})
