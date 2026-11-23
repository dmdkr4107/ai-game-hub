const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const {webAssets: assetTypes} = require('./web-export.cjs');
const {freePreviewScheme} = require('./free-preview.cjs');

const previewCsp = [
  "default-src 'none'", "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'", "connect-src 'self'", "img-src 'self' data: blob:",
  "worker-src 'self' blob:", "media-src 'self' blob:", "object-src 'none'",
  "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

function registerGameProtocol(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'hub-game',
    privileges: {standard:true, secure:true, supportFetchAPI:true, corsEnabled:true},
  }, freePreviewScheme]);
}

function serveGamePreview(session, net, games) {
  session.protocol.handle('hub-game', async request => {
    const notFound = () => new Response(null, {status: 404});
    if (request.method !== 'GET' && request.method !== 'HEAD') return notFound();
    const match = /^hub-game:\/\/play\/([0-9a-f-]{36})\/([a-z.-]+)$/.exec(request.url);
    if (!match || !Object.hasOwn(assetTypes, match[2])) return notFound();
    const [, token, file] = match;
    const directory = games.getPreviewDirectory(token);
    if (!directory) return notFound();
    try {
      const entry = path.join(directory, file);
      if (!(await fs.lstat(entry)).isFile() || await fs.realpath(entry) !== entry) return notFound();
      if (games.getPreviewDirectory(token) !== directory) return notFound();
      const payload = await net.fetch(pathToFileURL(entry).href, {method: request.method});
      if (games.getPreviewDirectory(token) !== directory) {
        void payload.body?.cancel().catch(() => {});
        return notFound();
      }
      const headers = new Headers(payload.headers);
      headers.set('Content-Type', assetTypes[file]);
      headers.set('Content-Security-Policy', previewCsp);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(payload.body, {status: payload.status, headers});
    } catch {
      return notFound();
    }
  });
}

module.exports = {registerGameProtocol, serveGamePreview};
