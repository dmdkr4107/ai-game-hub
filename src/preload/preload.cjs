const {contextBridge, ipcRenderer} = require('electron');
// A single read-only, explicitly permitted IPC operation. No file or command APIs.
contextBridge.exposeInMainWorld('hub', Object.freeze({
  getAppInfo: () => ipcRenderer.invoke('hub:getAppInfo'),
}));
