const {contextBridge, ipcRenderer} = require('electron');

/** @type {import('../shared/ai').HubApi} */
const hub = {
  getAppInfo: () => ipcRenderer.invoke('hub:getAppInfo'),
  openSetupResource: (kind) => ipcRenderer.invoke('hub:setup:open', kind),
  getAiEnvironment: () => ipcRenderer.invoke('hub:ai:getEnvironment'),
  startAiChat: (request) => ipcRenderer.invoke('hub:ai:chat', request),
  installAiModel: (request) => ipcRenderer.invoke('hub:ai:pull', request),
  cancelAiOperation: (id) => ipcRenderer.invoke('hub:ai:cancel', id),
  listGames: () => ipcRenderer.invoke('hub:games:list'),
  createGame: (request) => ipcRenderer.invoke('hub:games:create', request),
  extractGameIdea: (request) => ipcRenderer.invoke('hub:games:extractIdea', request),
  createConfiguredGame: (request) => ipcRenderer.invoke('hub:games:createConfigured', request),
  updateGame: (request) => ipcRenderer.invoke('hub:games:update', request),
  restoreGame: (id) => ipcRenderer.invoke('hub:games:restore', id),
  playGame: (id) => ipcRenderer.invoke('hub:games:play', id),
  stopGame: () => ipcRenderer.invoke('hub:games:stop'),
  listFreeProjects: () => ipcRenderer.invoke('hub:free:list'),
  loadFreeProject: (id) => ipcRenderer.invoke('hub:free:load', id),
  generateFreeGame: (request) => ipcRenderer.invoke('hub:free:generate', request),
  commitFreeGame: (token) => ipcRenderer.invoke('hub:free:commit', token),
  discardFreeGame: (token) => ipcRenderer.invoke('hub:free:discard', token),
  restoreFreeGame: (id) => ipcRenderer.invoke('hub:free:restore', id),
  exportFreeGame: (id) => ipcRenderer.invoke('hub:free:export-html', id),
  onAiEvent(handler) {
    if (typeof handler !== 'function') throw new TypeError('An AI event callback is required');
    // Do not expose Electron's event object or let the renderer select a channel.
    /** @param {import('electron').IpcRendererEvent} _event @param {import('../shared/ai').AiEvent} data */
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('hub:ai:event', listener);
    return () => { ipcRenderer.removeListener('hub:ai:event', listener); };
  },
};
contextBridge.exposeInMainWorld('hub', Object.freeze(hub));
