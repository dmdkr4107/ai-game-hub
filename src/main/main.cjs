const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {app, BrowserWindow, dialog, ipcMain} = require('electron');
const {windowPreferences, isTrustedDevUrl, attachSecurityHandlers} = require('./security.cjs');

// Internal development shell: not a production service, authentication is not implemented.
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');
app.whenReady().then(async () => {
  ipcMain.handle('hub:getAppInfo', (event) => {
    if (!BrowserWindow.getAllWindows().some(win => win.webContents === event.sender)) {
      throw new Error('Untrusted IPC sender');
    }
    return {version: app.getVersion(), phase: 1, internalOnly: true};
  });
  const win = new BrowserWindow({
    width: 1260, height: 820, minWidth: 900, minHeight: 620,
    title: 'AI Game Hub — 내부 개발용',
    backgroundColor: '#0d0f19',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      ...windowPreferences,
      preload: path.join(__dirname, '../preload/preload.cjs'),
    },
  });
  attachSecurityHandlers(win.webContents, win.webContents.session);
  win.once('ready-to-show', () => win.show());
  const devUrl = process.env.AI_HUB_DEV_URL;
  if (devUrl && isTrustedDevUrl(devUrl)) {
    await win.loadURL(devUrl);
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    // Encode literal percent signs in ZIP extraction folder names.
    await win.loadURL(pathToFileURL(indexPath).href);
  }
}).catch((error) => {
  console.error('AI Game Hub failed to load its interface:', error);
  dialog.showErrorBox('AI Game Hub', '화면을 불러오지 못했습니다. 실행 창의 오류 메시지를 확인해 주세요.');
  app.exit(1);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
