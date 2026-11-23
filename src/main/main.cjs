const path = require('node:path');
const {existsSync} = require('node:fs');
const {rename, rm, writeFile} = require('node:fs/promises');
const {randomUUID} = require('node:crypto');
const {createGameService} = require('./games.cjs');
const {pathToFileURL} = require('node:url');
const {app, BrowserWindow, dialog, ipcMain, net, protocol, shell} = require('electron');
const {windowPreferences, isTrustedDevUrl, attachSecurityHandlers} = require('./security.cjs');
const {registerHubIpc} = require('./hub-ipc.cjs');
const {createSetupActions} = require('./setup.cjs');
const {registerGameProtocol, serveGamePreview} = require('./game-protocol.cjs');
const {serveFreePreview} = require('./free-preview.cjs');
const {createFreeGameStore} = require('./free-games.cjs');
const {buildFreeGameHtml} = require('./free-game-html.cjs');

registerGameProtocol(protocol);

// Internal development shell: not a production service, authentication is not implemented.
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');
async function openMainWindow() {
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
  const userData = app.getPath('userData');
  const candidates = [
    process.env.AI_HUB_GODOT_PATH,
    path.join(userData, 'runtime', 'Godot.exe'),
    ...(!app.isPackaged ? [path.join(app.getAppPath(), 'tools', 'godot', 'Godot.exe')] : []),
  ];
  const enginePath = candidates.find(candidate => candidate && path.isAbsolute(candidate) && existsSync(candidate));
  const games = createGameService({
    root: path.join(userData, 'games'),
    templatesRoot: path.join(__dirname, 'templates'),
    enginePath,
  });
  const freeGames = createFreeGameStore(path.join(userData, 'free-games'));
  let quitting = false;
  let cleanupComplete = false;
  app.on('before-quit', event => {
    if (cleanupComplete) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;

    const finish = () => {
      if (cleanupComplete) return;
      cleanupComplete = true;
      clearTimeout(deadline);
      app.quit();
    };
    const deadline = setTimeout(finish, 4_000);
    void Promise.allSettled([games.dispose(), freeGames.waitForWrites()]).then(finish);
  });
  serveGamePreview(win.webContents.session, net, games);
  serveFreePreview(win.webContents.session);
  const openSetupResource = createSetupActions({shell, userData, enginePath});
  const saveFreeGameHtml = async (source) => {
    const title = source.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'AI Game Hub - ' + title + '.html',
      filters: [{name: 'HTML', extensions: ['html']}],
    });
    if (result.canceled || !result.filePath || win.isDestroyed()) return {status:'cancelled'};
    if (!/\.html?$/i.test(result.filePath)) return {status:'error', code:'invalid-export-path'};
    const html = buildFreeGameHtml(source);
    const temporaryFile = path.join(path.dirname(result.filePath), randomUUID() + '.tmp');
    try {
      await writeFile(temporaryFile, html, {encoding:'utf8', flag:'wx'});
      await rename(temporaryFile, result.filePath);
    } finally {
      await rm(temporaryFile, {force:true});
    }
    return {status:'done', fileName: path.basename(result.filePath)};
  };
  registerHubIpc(ipcMain, win.webContents, rendererUrl, app.getVersion(), undefined, games, openSetupResource, freeGames, saveFreeGameHtml);
  win.once('ready-to-show', () => win.show());
  await win.loadURL(rendererUrl);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(openMainWindow).catch(error => {
    console.error('AI Game Hub failed to load its interface:', error);
    dialog.showErrorBox('AI Game Hub', '화면을 불러오지 못했습니다. 실행 창의 오류 메시지를 확인해 주세요.');
    app.exit(1);
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
