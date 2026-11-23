const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {validateFreeSource} = require('./free-source.cjs');

const runnerScript = readFileSync(path.join(__dirname, 'free-preview', 'runner.js'), 'utf8').replace(/\r\n?/g, '\n');
const runnerStyle = 'html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#121526}' +
  'body{display:grid;place-items:center}canvas{display:block;width:min(100vw,177.7778vh);height:min(100vh,56.25vw);touch-action:none}';
const playerStyle = `*{box-sizing:border-box}body{margin:0;padding:24px;background:#111322;color:#eef0fc;font:16px system-ui,sans-serif}
main{max-width:1000px;margin:auto}h1{margin:0 0 8px;overflow-wrap:anywhere}p{line-height:1.5;overflow-wrap:anywhere}
#surface iframe{width:100%;aspect-ratio:16/9;display:block;border:1px solid #535973;border-radius:8px}
button{cursor:pointer;font:inherit;color:inherit;background:#252b45;border:1px solid #626c93;border-radius:6px;padding:9px 12px;margin:0 8px 10px 0}
button:disabled{opacity:.6;cursor:default}button:focus-visible{outline:2px solid #b1c6ff;outline-offset:2px}`;
const playerScript = `'use strict';
const on = (id) => document.getElementById(id);
const frameMarkup = on('game-frame-markup').content.textContent;
const bytes = Uint8Array.from(atob(on('game-source').content.textContent), value => value.charCodeAt(0));
const {code} = JSON.parse(new TextDecoder().decode(bytes));
const surface = on('surface');
const focusButton = on('focus-game');
const reloadButton = on('restart-game');
const status = on('game-status');
let active;

function stop() {
  clearTimeout(active?.timeout);
  active?.port?.close();
  active?.frame.remove();
}

function start() {
  stop();
  focusButton.disabled = true;
  status.textContent = status.dataset.loading;
  const frame = document.createElement('iframe');
  frame.title = document.title;
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.referrerPolicy = 'no-referrer';

  function fail() {
    if (active !== game) return;
    stop();
    active = undefined;
    focusButton.disabled = true;
    status.textContent = status.dataset.error;
  }

  const game = {frame, timeout: setTimeout(fail, 15_000), port: null};
  active = game;
  frame.addEventListener('load', () => {
    if (active !== game) return;
    const channel = new MessageChannel();
    game.port = channel.port1;
    channel.port1.onmessage = ({data}) => {
      if (active !== game) return;
      if (data === 'ready') {
        clearTimeout(game.timeout);
        focusButton.disabled = false;
        status.textContent = status.dataset.ready;
      } else if (data === 'error') fail();
      else if (data === 'leave-focus') focusButton.focus();
    };
    frame.contentWindow.postMessage({type: 'hub-free:start', code}, '*', [channel.port2]);
  }, {once: true});
  frame.srcdoc = frameMarkup;
  surface.append(frame);
}

focusButton.addEventListener('click', () => {
  active?.frame.focus();
  active?.port?.postMessage('focus-canvas');
});
reloadButton.addEventListener('click', start);
window.addEventListener('pagehide', stop);
start();`;

const labels = {
  ko: {focus:'게임으로 포커스 이동', restart:'다시 시작', loading:'게임을 준비하고 있습니다.',
    ready:'게임을 열었습니다. 게임 영역을 클릭하면 조작할 수 있습니다.',
    error:'게임을 시작할 수 없습니다. 다시 시작하거나 최신 Chrome 또는 Edge에서 열어 주세요.'},
  en: {focus:'Focus game', restart:'Restart', loading:'Preparing the game.',
    ready:'Game loaded. Click the game area to use its controls.',
    error:'The game could not start. Try restarting or open it in an up-to-date Chrome or Edge.'},
};
const htmlEntities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const escapeHtml = text => text.replace(/[&<>"']/g, character => htmlEntities[character]);
const hashSource = text => "'sha256-" + createHash('sha256').update(text, 'utf8').digest('base64') + "'";

function policy(scripts, styles, frames) {
  return [
    "default-src 'none'",
    'script-src ' + scripts.map(hashSource).join(' ') + ' blob:',
    'style-src ' + styles.map(hashSource).join(' '),
    'worker-src blob:', "connect-src 'none'", 'frame-src ' + frames, "object-src 'none'",
    "base-uri 'none'", "form-action 'none'",
  ].join('; ');
}

function cspMeta(value) {
  return '<meta http-equiv="Content-Security-Policy" content="' + escapeHtml(value) + '">';
}

function buildFreeGameHtml(value, language = 'ko') {
  const game = validateFreeSource(value);
  if (!game) throw new Error('Invalid game data');
  const locale = language === 'en' ? 'en' : 'ko';
  const copy = labels[locale];
  const title = escapeHtml(game.title);
  // srcdoc inherits the shell policy, so both policies allow the trusted runner
  // hashes and its Blob worker. The inner policy does not allow nested frames.
  const child = '<!doctype html><meta charset="utf-8">' + cspMeta(policy([runnerScript], [runnerStyle], "'none'")) +
    '<style>' + runnerStyle + '</style><canvas width="960" height="540"></canvas><script>' + runnerScript + '</script>';
  const sourceData = Buffer.from(JSON.stringify({code:game.code}), 'utf8').toString('base64');
  return `<!doctype html>
<html lang="${locale}">
<meta charset="utf-8">
${cspMeta(policy([playerScript, runnerScript], [playerStyle, runnerStyle], "'self'"))}
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<style>${playerStyle}</style>
<main>
  <h1>${title}</h1>
  <p>${escapeHtml(game.summary)}</p>
  <button type="button" id="focus-game" disabled>${copy.focus}</button>
  <button type="button" id="restart-game">${copy.restart}</button>
  <div id="surface"></div>
  <p role="status" id="game-status" data-loading="${escapeHtml(copy.loading)}" data-ready="${escapeHtml(copy.ready)}" data-error="${escapeHtml(copy.error)}"></p>
</main>
<template id="game-frame-markup">${escapeHtml(child)}</template>
<template id="game-source">${sourceData}</template>
<script>${playerScript}</script>
</html>
`;
}

module.exports = {buildFreeGameHtml};
