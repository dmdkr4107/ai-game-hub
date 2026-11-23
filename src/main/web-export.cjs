const {execFile} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {promisify} = require('node:util');

const runEngine = promisify(execFile);
const webTemplate = 'web_nothreads_release.zip';
const templateSize = 10_245_903;
// Extracted from the checksum-verified official Godot 4.7.2 export bundle.
const templateSha256 = 'd3ee2f08cef0cf3cf6678a6355a92a8db48ccdd35cbd2e8bfd5f0e8a0b4032a0';

const webAssets = Object.freeze({
  'index.html': 'text/html; charset=utf-8',
  'index.js': 'text/javascript; charset=utf-8',
  'index.wasm': 'application/wasm',
  'index.pck': 'application/octet-stream',
  'index.audio.worklet.js': 'text/javascript; charset=utf-8',
  'index.audio.position.worklet.js': 'text/javascript; charset=utf-8',
  'hub-bootstrap.js': 'text/javascript; charset=utf-8',
  'hub-player.css': 'text/css; charset=utf-8',
});

const shell = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta id="hub-game-config" content='$GODOT_CONFIG'>
  <title>AI Game Hub</title>
  <link rel="stylesheet" href="hub-player.css">
</head>
<body>
  <canvas id="canvas" tabindex="0">WebGL 2.0 required</canvas>
  <script defer src="$GODOT_URL"></script>
  <script defer src="hub-bootstrap.js"></script>
</body>
</html>`;

const bootstrap = `'use strict';

const notify = (type) => window.parent.postMessage({type}, '*');
async function loadGame() {
  try {
    const options = JSON.parse(document.querySelector('#hub-game-config').content);
    const canvas = document.querySelector('#canvas');
    const engine = new Engine({
      ...options,
      canvas,
      onExit: (code) => notify(code === 0 ? 'ai-hub-game-exit' : 'ai-hub-game-error'),
    });
    await engine.startGame();
    notify('ai-hub-game-ready');
  } catch {
    notify('ai-hub-game-error');
  }
}
void loadGame();
`;

const css = `html, body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #141326;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
`;

function preset(template) {
  const location = JSON.stringify(template.split(path.sep).join('/'));
  return `[preset.0]

name="Hub Web"
platform="Web"
runnable=true
advanced_options=true
export_filter="all_resources"
include_filter="game-config.json,hub-ui-font.bin,hub-ui-font-OFL.txt"
exclude_filter="hub-export.html"
encrypt_pck=false
encrypt_directory=false

[preset.0.options]

custom_template/release=${location}
variant/extensions_support=false
variant/thread_support=false
html/export_icon=false
html/custom_html_shell="res://hub-export.html"
html/canvas_resize_policy=2
progressive_web_app/enabled=false
`;
}

function unavailable() {
  return Object.assign(new Error('The verified Godot 4.7.2 Web export template is missing or invalid.'), {
    code: 'web-template-missing',
  });
}

function resolveWebTemplate(executable) {
  return path.join(path.dirname(executable), webTemplate);
}

async function hasWebTemplate(executable) {
  if (!executable) return false;
  try {
    const info = await fs.lstat(resolveWebTemplate(executable));
    return info.isFile() && info.size === templateSize;
  } catch {
    return false;
  }
}

async function exportWebGame({executable, projectDirectory, outputDirectory, signal}) {
  signal?.throwIfAborted();
  if (!await hasWebTemplate(executable)) throw unavailable();
  const template = resolveWebTemplate(executable);
  const bytes = await fs.readFile(template, {signal});
  if (bytes.length !== templateSize || createHash('sha256').update(bytes).digest('hex') !== templateSha256) {
    throw unavailable();
  }

  await fs.writeFile(path.join(projectDirectory, 'export_presets.cfg'), preset(template), {flag:'wx', signal});
  await fs.writeFile(path.join(projectDirectory, 'hub-export.html'), shell, {flag:'wx', signal});
  await fs.mkdir(outputDirectory, {recursive:true});
  const deadline = AbortSignal.timeout(60_000);
  const exportSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    await runEngine(executable, [
      '--headless', '--path', projectDirectory,
      '--export-release', 'Hub Web', path.join(outputDirectory, 'index.html'),
    ], {cwd: projectDirectory, windowsHide:true, maxBuffer:128 * 1024, signal: exportSignal});
  } catch (error) {
    if (deadline.aborted && !signal?.aborted) {
      throw Object.assign(new Error('The Web preview export timed out.'), {code: 'web-export-timeout'});
    }
    throw error;
  }

  await fs.writeFile(path.join(outputDirectory,'hub-bootstrap.js'), bootstrap, {flag:'wx', signal});
  await fs.writeFile(path.join(outputDirectory,'hub-player.css'), css, {flag:'wx', signal});
  for (const name of Object.keys(webAssets)) {
    signal?.throwIfAborted();
    const info = await fs.lstat(path.join(outputDirectory, name));
    if (!info.isFile() || info.size === 0) throw new Error('Missing required Web export file: ' + name);
  }
}

module.exports = {exportWebGame, hasWebTemplate, webAssets};
