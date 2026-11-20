// Phase 1: restrict renderer permissions; no arbitrary IPC bridge or shell access.
const { URL } = require('node:url');
const windowPreferences = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
});
function isTrustedDevUrl(candidate) {
  try {
    const url = new URL(candidate);
    return url.origin === 'http://127.0.0.1:5173' && url.pathname === '/' &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
function attachSecurityHandlers(webContents, session) {
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  webContents.setWindowOpenHandler(() => ({action:'deny'}));
  webContents.on('will-navigate', (event) => event.preventDefault());
  webContents.on('will-redirect', (event) => event.preventDefault());
}
module.exports = { windowPreferences, isTrustedDevUrl, attachSecurityHandlers };
