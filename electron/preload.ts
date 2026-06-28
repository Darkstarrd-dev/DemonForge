import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  setMenuBarVisibility: (visible: boolean) => ipcRenderer.send('set-menu-bar', visible),
  setScaleConfig: (cfg: { enabled: boolean; baseWidth: number }) =>
    ipcRenderer.send('set-scale-config', cfg),
  captureScaleBase: () => ipcRenderer.invoke('capture-scale-base'),
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory'),
  openPath: (dir: string) => ipcRenderer.invoke('shell:open-path', dir),
  monopolyListSaves: () => ipcRenderer.invoke('monopoly:list-saves'),
  monopolyGetSave: (id: string) => ipcRenderer.invoke('monopoly:get-save', id),
  monopolyPutSave: (save: unknown) => ipcRenderer.invoke('monopoly:put-save', save),
  monopolyDeleteSave: (id: string) => ipcRenderer.invoke('monopoly:delete-save', id),
})
