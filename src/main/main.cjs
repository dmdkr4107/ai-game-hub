const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {app, BrowserWindow, dialog, ipcMain} = require('electron');
const {windowPreferences, isTrustedDevUrl, attachSecurityHandlers} = require('./security.cjs');

// Internal development shell: not a production service, authentication is not implemented.
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');
app.whenReady().then(async () => {
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
  const devUrl = app.isPackaged ? undefined : process.env.AI_HUB_DEV_URL;
  const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
  // Encode literal percent signs in ZIP extraction folder names.
  const rendererUrl = isTrustedDevUrl(devUrl) ? new URL(devUrl).href : pathToFileURL(indexPath).href;
  attachSecurityHandlers(win.webContents, win.webContents.session);
  ipcMain.handle('hub:getAppInfo', (event) => {
    const frame = event.senderFrame;
    if (event.sender !== win.webContents || !frame || frame !== win.webContents.mainFrame || frame.url !== rendererUrl) {
      throw new Error('Untrusted IPC sender');
    }
    return {version: app.getVersion(), phase: 1, internalOnly: true};
  });
  win.once('ready-to-show', () => win.show());
  await win.loadURL(rendererUrl);
}).catch((error) => {
  console.error('AI Game Hub failed to load its interface:', error);
  dialog.showErrorBox('AI Game Hub', '화면을 불러오지 못했습니다. 실행 창의 오류 메시지를 확인해 주세요.');
  app.exit(1);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
