const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {existsSync, mkdtempSync, realpathSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {setTimeout: wait} = require('node:timers/promises');
const {mockOllama} = require('./smoke-ai.cjs');

const project = path.join(__dirname, '..');
const startingGame = {
  title: 'Paper Plane Dispatch',
  summary: 'Direction input changes the sky, and D + Space enables drift.',
  code: `function createGame({ctx, width, height}) {
    let sky = '#c34f62';
    const idle = sky;
    return {
      update(dt, input) {
        sky = idle;
        if (input.keys.includes('KeyW')) sky = '#2c84b7';
        if (input.keys.includes('KeyD') && input.keys.includes('Space')) sky = '#47ca72';
      },
      draw() { ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height); }
    };
  }`,
};

const changedGame = {
  title: 'Paper Plane at Night',
  summary: 'Added a midnight sky and kept the direction input.',
  code: startingGame.code.replace('#c34f62', '#312754'),
};

async function until(check, message, timeout = 10_000) {
  const stopAt = Date.now() + timeout;
  while (Date.now() < stopAt) {
    const result = await check();
    if (result) return result;
    await wait(40);
  }
  assert.fail(message);
}

function launchHiddenElectron() {
  assert.ok(existsSync(path.join(project, 'dist', 'index.html')), 'Build the compiled app first.');
  const tmp = realpathSync(tmpdir());
  const profile = mkdtempSync(path.join(tmp, 'ai-game-hub-free-studio-smoke-'));
  const env = {...process.env, AI_HUB_FREE_STUDIO_SMOKE_PROFILE: profile};
  delete env.AI_HUB_DEV_URL;
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], {cwd: project, env, stdio: 'inherit', windowsHide: true});
  const timeout = setTimeout(() => {
    console.error('Hidden free-studio smoke timed out.');
    process.exitCode = 1;
    child.kill();
  }, 50_000);
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('close', code => {
    clearTimeout(timeout);
    if (code !== 0) process.exitCode = 1;
    if (path.dirname(profile) === tmp && path.basename(profile).startsWith('ai-game-hub-free-studio-smoke-')) {
      try {
        rmSync(profile, {recursive: true, force: true, maxRetries: 4, retryDelay: 100});
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      }
    }
  });
}

async function verifyStudio(win, requests, exportPath) {
  const contents = win.webContents;
  contents.setBackgroundThrottling(false);
  const evaluate = expression => contents.executeJavaScript(expression);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const stage = () => evaluate('document.querySelector("#free-game-status")?.dataset.stage');
  const title = () => evaluate('document.querySelector("#free-play-title")?.textContent');
  const projects = () => evaluate('window.hub.listFreeProjects()');
  const previewReady = () => evaluate('Boolean(document.querySelector("[data-free-game-state=ready]"))');
  const send = async message => {
    await evaluate(`(() => {
      const input = document.querySelector('#free-game-prompt');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(message)});
      input.dispatchEvent(new Event('input', {bubbles:true}));
    })()`);
    await until(() => evaluate('document.querySelector("#free-generate-game")?.disabled === false'),
      'Studio did not accept the request.');
    await click('#free-generate-game');
  };

  await until(() => evaluate('Boolean(document.querySelector("#open-free-studio"))'), 'Home did not appear.');
  await click('#open-free-studio');
  await until(() => evaluate('document.activeElement.id === "free-studio-title"'),
    'Opening the free studio did not focus its heading.');
  assert.equal(await evaluate('document.querySelector("#free-game-prompt").value'), '');
  assert.deepEqual(await projects(), []);

  await send('Build a paper plane delivery game.');
  await until(async () => (await projects()).length === 1 && (await stage()) === 'idle' && await previewReady(),
    'First game was not rendered and saved.');
  assert.equal(await title(), startingGame.title);
  assert.equal(await evaluate('document.querySelector("#free-game-frame").sandbox.value'), 'allow-scripts');
  const [initial] = await projects();
  assert.equal(initial.canRestore, false);
  assert.equal(await evaluate('document.querySelector(".free-transcript").textContent.includes("Direction input")'), true);
  await click('#free-export-game');
  await until(() => evaluate('document.querySelector("#free-game-status")?.textContent.includes("HTML") && document.querySelector("#free-game-status")?.dataset.stage === "idle"'),
    'Saving the standalone HTML did not finish.');
  assert.match(await require('node:fs/promises').readFile(exportPath, 'utf8'), /^<!doctype html>/i);

  // The fixture responds to WASD and a simultaneous D/Space through the actual worker.
  const sampleColor = async () => {
    const rect = await evaluate(`(() => {
      const b = document.querySelector('#free-game-frame').getBoundingClientRect();
      return {x: Math.floor(b.x + b.width / 2), y: Math.floor(b.y + b.height / 2), width: 1, height: 1};
    })()`);
    return [...(await contents.capturePage(rect, {stayHidden:true})).toBitmap()].slice(0, 4);
  };
  const looksLike = (pixel, target) => target.every((channel, index) => Math.abs(pixel[index] - channel) < 8);
  await until(async () => looksLike(await sampleColor(), [98, 79, 195]), 'The first sky color was not rendered.');
  const debuggerInput = contents.debugger;
  debuggerInput.attach();
  await debuggerInput.sendCommand('Emulation.setFocusEmulationEnabled', {enabled: true});
  const isGameFocused = () => evaluate(`document.activeElement.id === 'free-game-frame' &&
    document.querySelector('.free-game-preview').dataset.keyboardFocus === 'true'`);
  const key = (type, code, key, windowsVirtualKeyCode) =>
    debuggerInput.sendCommand('Input.dispatchKeyEvent', {type, code, key, windowsVirtualKeyCode});
  await click('#focus-free-game');
  await until(isGameFocused, 'Focus did not reach the sandboxed game canvas.');
  await key('rawKeyDown', 'KeyW', 'w', 87);
  await until(async () => looksLike(await sampleColor(), [183, 132, 44]), 'Gameplay did not receive W.');
  await key('rawKeyDown', 'KeyD', 'd', 68);
  await key('rawKeyDown', 'Space', ' ', 32);
  await until(async () => looksLike(await sampleColor(), [114, 202, 71]), 'Gameplay did not receive D and Space together.');
  await key('rawKeyDown', 'Escape', 'Escape', 27);
  await until(() => evaluate(`document.activeElement.id === 'focus-free-game' &&
    document.querySelector('.free-game-preview').dataset.keyboardFocus === 'false'`), 'Escape did not release game focus.');
  await click('#focus-free-game');
  await until(isGameFocused, 'The game canvas could not be focused again.');
  await until(async () => looksLike(await sampleColor(), [98, 79, 195]), 'The game retained held inputs after losing focus.');
  await key('keyUp', 'KeyW', 'w', 87);
  await key('keyUp', 'KeyD', 'd', 68);
  await key('keyUp', 'Space', ' ', 32);
  await key('keyUp', 'Escape', 'Escape', 27);
  debuggerInput.detach();

  await send('Break the game for this test.');
  await until(async () => (await stage()) === 'idle' && await evaluate('document.querySelector("#free-game-status").dataset.error === "true"'),
    'The broken update did not report a validation failure.');
  await until(previewReady, 'The previous running game did not return after a broken update.');
  assert.deepEqual(await projects(), [initial]);
  assert.equal(await title(), startingGame.title);
  assert.equal(await evaluate('document.querySelector("#free-game-prompt").value'), 'Break the game for this test.');
  await until(() => evaluate('document.querySelector("#free-repair-game")?.disabled === false'),
    'The broken revision did not offer an explicit repair.');

  await send('Wait until I cancel this request.');
  await until(async () => (await stage()) === 'generating' && requests.length === 3, 'The cancellable operation did not start.');
  assert.equal(await title(), startingGame.title);
  assert.equal(await previewReady(), true, 'The existing preview disappeared during generation.');
  await click('#free-cancel-game');
  await until(async () => (await stage()) === 'idle', 'The cancelled operation did not finish.');
  assert.deepEqual(await projects(), [initial]);
  assert.equal(await evaluate('document.querySelector("#free-game-prompt").value'), 'Wait until I cancel this request.');

  await send('Change it to a midnight sky.');
  await until(async () => (await title()) === changedGame.title && (await projects())[0].canRestore && await previewReady(),
    'The working revision was not saved and played.');
  assert.equal(requests.at(-1).previous.code, startingGame.code, 'The model did not get the current game to revise.');
  await click('#free-restore-game');
  await until(() => evaluate('Boolean(document.querySelector("#free-confirm-restore"))'), 'Restore did not require confirmation.');
  await click('#free-confirm-restore');
  await until(async () => (await title()) === startingGame.title && (await stage()) === 'idle' && await previewReady(),
    'The previous version did not reopen.');
  assert.equal((await projects())[0].canRestore, false);

  const loaded = new Promise(resolve => contents.once('did-finish-load', resolve));
  contents.reload();
  await loaded;
  await until(() => evaluate('Boolean(document.querySelector("#open-free-studio"))'), 'Home did not reopen.');
  await click('#open-free-studio');
  await until(() => evaluate('document.querySelector("#free-project-select")?.disabled === false'), 'Saved games did not reappear.');
  await evaluate(`(() => {
    const select = document.querySelector('#free-project-select');
    select.value = ${JSON.stringify(initial.id)};
    select.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  await until(async () => (await title()) === startingGame.title && await previewReady(), 'A previously saved game did not reopen.');
  assert.equal((await projects())[0].id, initial.id);

  await send('Break the game again to test repair.');
  await until(() => evaluate('document.querySelector("#free-repair-game")?.disabled === false'),
    'A repair could not be requested for the second broken revision.');
  await click('#free-repair-game');
  await until(async () => (await title()) === changedGame.title && await previewReady() && (await projects())[0].canRestore,
    'The explicit repair did not run and save a playable revision.');
  assert.equal(requests.at(-1).prompt, 'Break the game again to test repair.');
  assert.equal(requests.at(-1).previous.code, startingGame.code);
  assert.equal(requests.at(-1).failed.issue, 'startup-error');
  assert.match(requests.at(-1).failed.source.code, /Second draw failed/);

  await click('#free-new-game');
  await send('Test a repeated draft on a blank project.');
  await until(() => evaluate('document.querySelector("#free-game-status")?.textContent.includes("실행되지 않은 코드를 다시")'),
    'A repeated draft indicated that a saved version existed.');
  assert.equal(await evaluate('document.querySelector("#free-game-prompt").value'), 'Test a repeated draft on a blank project.');
  assert.equal((await projects())[0].id, initial.id);
  assert.equal(await evaluate('document.querySelector("#free-studio-back") === null'), true);

  win.setSize(...win.getMinimumSize());
  await until(() => evaluate(`(() => {
    const studio = document.querySelector('.free-studio').getBoundingClientRect();
    const panel = document.querySelector('.free-play-panel').getBoundingClientRect();
    return panel.left >= studio.left && panel.right <= studio.right + 1 && panel.width >= 280;
  })()`), 'The game panel did not fit at the minimum window size.');
  assert.equal(win.isVisible(), false);
}

function runSmoke() {
  const {app, BrowserWindow, dialog} = require('electron');
  assert.ok(process.env.AI_HUB_FREE_STUDIO_SMOKE_PROFILE, 'Run this test via Node to use an isolated profile.');
  const exportPath = path.join(process.env.AI_HUB_FREE_STUDIO_SMOKE_PROFILE, 'generated-test-game.html');
  dialog.showSaveDialog = async () => ({canceled:false, filePath:exportPath});
  app.setPath('userData', process.env.AI_HUB_FREE_STUDIO_SMOKE_PROFILE);
  app.setAppPath(project);
  dialog.showErrorBox = (title, message) => { throw new Error(title + ' ' + message); };
  app.on('browser-window-created', (_event, win) => {
    assert.equal(win.isVisible(), false);
    win.setFocusable(false);
    win.show = () => {};
  });
  const {service} = mockOllama();
  const requests = [];
  let pending;
  service.buildFreeGame = async request => {
    requests.push(request);
    if (request.prompt.includes('repeated draft')) return {status:'error',code:'build-unchanged'};
    if (request.failed) return {status:'done', config:changedGame};
    if (/cancel/.test(request.prompt)) {
      return new Promise(resolve => { pending = {id: request.id, resolve}; });
    }
    if (/Break/.test(request.prompt)) {
      const code = startingGame.code
        .replace('let sky', 'let frames = 0; let sky')
        .replace('draw() { ctx', 'draw() { if (++frames === 2) throw new Error("Second draw failed"); ctx');
      return {status:'done', config:{...startingGame, code}};
    }
    return {status:'done', config: request.previous ? changedGame : startingGame};
  };
  service.cancel = id => {
    if (pending?.id !== id) return false;
    const work = pending;
    pending = undefined;
    work.resolve({status:'done',config:changedGame});
    return true;
  };
  require.cache[require.resolve('../src/main/ollama.cjs')] = {
    loaded: true,
    exports: {createOllamaService: () => service},
  };
  require('../src/main/main.cjs');
  app.whenReady().then(async () => {
    const windows = BrowserWindow.getAllWindows();
    assert.equal(windows.length, 1);
    await verifyStudio(windows[0], requests, exportPath);
    console.log('Hidden free-studio smoke passed: create, WASD and handbrake, invalid revision, cancellation, revise, restore, reopen, and repair.');
    app.quit();
  }).catch(error => { console.error(error); app.exit(1); });
}

if (process.versions.electron) runSmoke();
else launchHiddenElectron();
