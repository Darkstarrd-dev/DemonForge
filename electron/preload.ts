import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  setMenuBarVisibility: (visible: boolean) => ipcRenderer.send('set-menu-bar', visible),
})
