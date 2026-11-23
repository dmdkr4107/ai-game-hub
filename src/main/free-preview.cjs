const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const path = require('node:path');

const freePreviewScheme = {
  scheme: 'hub-free',
  privileges: {standard: true, secure: true},
};

function serveFreePreview(session) {
  const script = readFileSync(path.join(__dirname, 'free-preview', 'runner.js'), 'utf8').replace(/\r\n?/g, '\n');
  const style = 'html,body{width:100%;height:100%;margin:0;background:#121526;overflow:hidden}' +
    'body{display:grid;place-items:center}canvas{display:block;width:min(100vw,177.7778vh);height:min(100vh,56.25vw);touch-action:none}';
  const hash = (text) => "'sha256-" + createHash('sha256').update(text, 'utf8').digest('base64') + "'";
  const csp = [
    "default-src 'none'", "script-src " + hash(script) + " blob:",
    "worker-src blob:", "style-src " + hash(style), "connect-src 'none'",
    "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
    'sandbox allow-scripts',
  ].join('; ');
  const html = '<!doctype html><meta charset="utf-8"><title>Game preview</title>' +
    '<style>' + style + '</style><canvas width="960" height="540"></canvas><script>' + script + '</script>';
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  };
  session.protocol.handle('hub-free', (request) => {
    if (request.url !== 'hub-free://play/index.html' || !['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, {status: 404});
    }
    return new Response(request.method === 'HEAD' ? null : html, {headers});
  });
}

module.exports = {freePreviewScheme, serveFreePreview};
