// Keep renderer permissions and navigation limited to the app shell.
const { URL } = require('node:url');
/** @type {Readonly<import('electron').WebPreferences>} */
const windowPreferences = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
});
/** @param {unknown} candidate */
function isTrustedDevUrl(candidate) {
  if (typeof candidate !== 'string') return false;
  try {
    const url = new URL(candidate);
    return url.origin === 'http://127.0.0.1:5173' && url.pathname === '/' &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
/**
 * @param {import('electron').WebContents} webContents
 * @param {import('electron').Session} session
 */
function attachSecurityHandlers(webContents, session) {
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  webContents.setWindowOpenHandler(() => ({action:'deny'}));
  webContents.on('will-navigate', (event) => event.preventDefault());
  webContents.on('will-redirect', (event) => event.preventDefault());
}
module.exports = { windowPreferences, isTrustedDevUrl, attachSecurityHandlers };
