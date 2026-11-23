const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { mockOllama } = require('./smoke-ai.cjs');

const project = path.join(__dirname, '..');
const indexPath = path.join(project, 'dist', 'index.html');

function runElectron() {
  if (!existsSync(indexPath)) {
    console.error('Build the compiled UI with npm run build before running the smoke test.');
    process.exitCode = 1;
    return;
  }

  const electronPath = require('electron');
  const profile = mkdtempSync(path.join(tmpdir(), 'ai-game-hub-smoke-'));
  const env = { ...process.env, AI_HUB_SMOKE_PROFILE: profile };
  delete env.AI_HUB_DEV_URL;
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, [__filename], { cwd: project, env, stdio: 'inherit', windowsHide: true });
  const timeout = setTimeout(() => {
    console.error('Electron smoke test timed out.');
    process.exitCode = 1;
    child.kill();
  }, 150_000);

  const onInterrupt = () => {
    process.exitCode = 1;
    child.kill();
  };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);
  child.once('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.once('close', (code) => {
    clearTimeout(timeout);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    if (code !== 0) process.exitCode = 1;
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      console.error('Could not clean the smoke-test profile:', error);
      process.exitCode = 1;
    }
  });
}

async function waitFor(read, message) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await read()) return;
    await sleep(50);
  }
  assert.fail(message);
}

async function verifyWindow(win, runtime) {
  const contents = win.webContents;
  contents.setBackgroundThrottling(false);
  const evaluate = (expression) => contents.executeJavaScript(expression);
  await waitFor(() => evaluate("Boolean(document.querySelector('main h1'))"), 'Home did not render.');
  assert.equal(new URL(contents.getURL()).protocol, 'file:');
  const input = contents.debugger;
  input.attach();
  await input.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });

  const keys = {
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
    Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  };
  const key = async (name) => {
    const { text, ...details } = keys[name];
    await input.sendCommand('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...details, text });
    await input.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...details });
  };
  const click = async (selector) => {
    const [x, y] = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      const rect = element.getBoundingClientRect();
      return [Math.round(rect.x + rect.width / 2), Math.round(rect.y + rect.height / 2)];
    })()`);
    const button = { button: 'left', clickCount: 1, x, y };
    await input.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...button });
    await input.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...button });
  };
  const focused = () => evaluate('document.activeElement.getAttribute("aria-label")');
  const activePage = () => evaluate('document.querySelector(".nav-item[aria-current=page]").getAttribute("aria-label")');

  assert.equal(await activePage(), '홈');
  const pages = ['홈', 'AI 게임 만들기', '내 게임', '설정'];
  for (const page of pages) {
    await key('Tab');
    await waitFor(async () => (await focused()) === page, `Tab did not focus ${page}.`);
    assert.equal(await evaluate('document.activeElement.matches(":focus-visible")'), true);
    await key(page === '내 게임' ? 'Space' : 'Enter');
    await waitFor(async () => (await activePage()) === page, `Keyboard did not open ${page}.`);
  }

  await key('Tab');
  await waitFor(async () => (await focused()) === '표시 언어', 'Language control was not focusable.');
  await key('ArrowDown');
  await waitFor(() => evaluate('document.documentElement.lang === "en"'), 'Keyboard did not change language.');
  await key('Tab');
  await waitFor(async () => (await focused()) === 'Reduce motion', 'Reduced-motion switch was not focusable.');
  const initialMotion = await evaluate('document.documentElement.classList.contains("reduce-motion")');
  await key('Space');
  await waitFor(async () => (await evaluate('document.documentElement.classList.contains("reduce-motion")')) !== initialMotion,
    'Reduced-motion preference did not respond to the switch.');
  assert.equal(await evaluate('localStorage.getItem("ai-game-hub:reduce-motion")'), String(!initialMotion));
  assert.equal(await evaluate('localStorage.getItem("ai-game-hub:language")'), 'en');

  await click('.nav-item:nth-child(1)');
  await waitFor(async () => (await activePage()) === 'Home', 'Mouse did not open Home.');
  assert.equal(await evaluate('Boolean(document.querySelector("#start-game-draft, .starter-card, .first-use-chat"))'), false,
    'Home still exposes an old creation route.');
  await click('#open-free-studio');
  await waitFor(() => evaluate('Boolean(document.querySelector("#free-game-prompt"))'), 'Home did not open the production conversation.');
  assert.equal(await evaluate('document.activeElement.id'), 'free-studio-title');

  await click('.nav-item:nth-child(1)');
  await waitFor(async () => (await activePage()) === 'Home', 'Could not return to Home.');
  await click('.nav-item:nth-child(2)');
  await waitFor(async () => (await activePage()) === 'Create with AI', 'Mouse did not open the creation screen.');
  assert.ok(await evaluate('Boolean(document.querySelector("#free-game-prompt"))'));
  assert.equal(await evaluate('Boolean(document.querySelector("#game-idea, #free-studio-back, #open-local-chat, #use-direct-game-settings"))'), false,
    'Creation still exposes the template form or a second AI chat.');

  await click('.nav-item:nth-child(3)');
  await waitFor(async () => (await activePage()) === 'My Games', 'Mouse did not open the library.');
  await waitFor(() => evaluate('Boolean(document.querySelector(".library-empty button"))'), 'Empty game library did not render.');
  await click('.library-empty button');
  await waitFor(async () => (await activePage()) === 'Create with AI', 'Library action did not open the creation conversation.');

  // Seed through the original API to confirm that the existing Godot library still works.
  assert.equal((await evaluate('window.hub.createGame({mode:"2d", prompt:"Smoke Star Trail"})')).status, 'done');
  await click('.nav-item:nth-child(3)');
  const game = () => evaluate('document.querySelector("[data-game-id] h2")?.textContent');
  await waitFor(async () => (await game()) === 'Smoke Star Trail', 'A saved Godot game did not appear in My Games.');
  await click('.game-play');
  await waitFor(() => evaluate('Boolean(document.querySelector(".game-stop"))'), 'The preview did not change to the Stop state.');
  await waitFor(() => evaluate('document.querySelector("#game-preview")?.dataset.state === "ready"'), 'Embedded preview did not report ready.');
  assert.equal(await evaluate('document.querySelector("#game-preview-frame")?.getAttribute("sandbox")'), 'allow-scripts allow-same-origin');
  await click('#close-game-preview');
  await waitFor(() => evaluate('Boolean(document.querySelector(".game-play")) && !document.querySelector("#game-preview-frame")'), 'The embedded preview did not stop.');
  await click('.game-edit');
  await click('.game-update-prompt');
  await input.sendCommand('Input.insertText', {text: 'Make it four stars.'});
  await click('.game-update');
  await waitFor(async () => (await game()) === 'Updated Star Trail', 'The edited version did not replace the original.');
  await click('.game-restore');
  await waitFor(() => evaluate('Boolean(document.querySelector("#confirm-game-restore"))'), 'Restore did not ask for confirmation.');
  assert.equal(await game(), 'Updated Star Trail');
  await click('#confirm-game-restore');
  await waitFor(async () => (await game()) === 'Smoke Star Trail', 'The previous version was not restored.');
  await click('.nav-item:nth-child(2)');
  await waitFor(async () => (await activePage()) === 'Create with AI', 'Could not return to the creation screen.');

  await click('#free-game-prompt');
  await input.sendCommand('Input.insertText', {text: 'Make a race in a moonlit city.'});
  await click('.nav-item:nth-child(4)');
  await click('#open-ai-setup');
  await waitFor(() => evaluate('Boolean(document.querySelector("#local-ai-model"))'), 'Local model settings did not open.');
  assert.equal(await evaluate('Boolean(document.querySelector("#local-chat-prompt"))'), false, 'Model settings exposed a duplicate chat.');
  await waitFor(() => evaluate('document.querySelector("#local-ai-model").disabled === false'), 'Models were not available.');
  await evaluate('document.querySelector("#local-ai-model").focus()');
  await key('ArrowDown');
  await key('ArrowDown');
  await waitFor(() => evaluate('document.querySelector("#local-ai-model").value === "qwen2.5-coder:7b"'), 'The missing model could not be selected.');
  await click('#request-model-install');
  assert.equal(runtime.pulls.length, 0);
  await click('#dismiss-model-install');
  assert.equal(runtime.pulls.length, 0, 'Dismissing consent incorrectly downloaded a model.');
  await click('#request-model-install');
  await click('#confirm-model-install');
  await waitFor(() => runtime.pulls.length === 1, 'Model consent did not reach the backend.');
  assert.equal(runtime.pulls[0].model, 'qwen2.5-coder:7b');
  assert.equal(runtime.pulls[0].consent, true);
  runtime.emitProgress();
  await waitFor(() => evaluate('document.querySelector("#local-model-progress")?.value === 10'), 'Download progress did not render.');
  runtime.complete();
  await waitFor(() => evaluate('document.querySelector("#local-ai-status")?.dataset.status === "done"'), 'Model installation did not complete.');
  await click('#back-to-idea');
  await waitFor(() => evaluate('document.querySelector("#free-game-prompt")?.value === "Make a race in a moonlit city."'),
    'The creation draft was lost when returning from model settings.');

  const minimumSize = win.getMinimumSize();
  win.setSize(...minimumSize);
  assert.deepEqual(win.getSize(), minimumSize);
  const [width, height] = win.getContentSize();
  await waitFor(
    () => evaluate(`innerWidth === ${width} && innerHeight === ${height} && document.querySelector(".app-footer").getBoundingClientRect().bottom <= innerHeight`),
    'Footer was clipped at the minimum window height.',
  );

  assert.deepEqual(await evaluate('Object.keys(window.hub).sort()'), [
    'cancelAiOperation', 'commitFreeGame', 'createConfiguredGame', 'createGame', 'discardFreeGame', 'exportFreeGame', 'extractGameIdea',
    'generateFreeGame', 'getAiEnvironment', 'getAppInfo', 'installAiModel', 'listFreeProjects', 'listGames',
    'loadFreeProject', 'onAiEvent', 'openSetupResource', 'playGame', 'restoreFreeGame', 'restoreGame', 'startAiChat', 'stopGame', 'updateGame',
  ]);
  assert.equal(await evaluate('Object.isFrozen(window.hub)'), true);
  assert.equal(await evaluate('typeof window.require === "undefined" && typeof window.process === "undefined"'), true);
  const info = await evaluate('window.hub.getAppInfo()');
  assert.equal(typeof info.version, 'string');
  assert.equal(info.phase, 3);
  assert.equal(info.internalOnly, true);
  input.detach();

  const loaded = new Promise(resolve => contents.once('did-finish-load', resolve));
  contents.reload();
  await loaded;
  await waitFor(() => evaluate('Boolean(document.querySelector("#open-free-studio"))'), 'Home did not render after reload.');
  await evaluate('document.querySelector(".nav-item:nth-child(2)").click()');
  await waitFor(() => evaluate('Boolean(document.querySelector("#free-game-prompt"))'),
    'The creation menu did not open the AI conversation after reopening the document.');
}

function runSmoke() {
  const { app, BrowserWindow, dialog } = require('electron');
  const profile = process.env.AI_HUB_SMOKE_PROFILE;
  assert.ok(profile, 'Run this script with Node to create an isolated profile.');
  app.setPath('userData', profile);
  app.setAppPath(project);
  dialog.showErrorBox = (title, message) => console.error(`${title}: ${message}`);
  let readyToShow = false;
  app.on('browser-window-created', (_event, win) => {
    assert.equal(win.isVisible(), false, 'The smoke window must start hidden.');
    win.setFocusable(false);
    // Intercept the production ready-to-show callback in this isolated process.
    win.show = () => { readyToShow = true; };
    win.on('show', () => {
      console.error('The smoke window unexpectedly became visible.');
      app.exit(1);
    });
  });
  let verified = false;
  app.on('before-quit', (event) => {
    if (verified) return;
    event.preventDefault();
    console.error('Electron quit before completing the smoke test.');
    app.exit(1);
  });
  const runtime = mockOllama();
  runtime.service.planGame = async ({previous}) => ({status:'done', config:{
    title: previous ? 'Updated Star Trail' : 'Smoke Star Trail', stars: previous ? 4 : 3, difficulty:'easy',
  }});
  const gamePath = require.resolve('../src/main/games.cjs');
  const gameModule = require(gamePath);
  // Keep real project files, but substitute the preview child so tests remain hidden on every PC.
  require.cache[gamePath].exports = {
    ...gameModule,
    createGameService: (options) => gameModule.createGameService({
      ...options,
      enginePath: process.execPath,
      validateImpl: async () => true,
      async exportImpl({outputDirectory}) {
        await writeFile(path.join(outputDirectory, 'index.html'),
          '<!doctype html><title>Preview</title><script src="hub-bootstrap.js" defer></script>');
        await writeFile(path.join(outputDirectory, 'hub-bootstrap.js'),
          'parent.postMessage({type:"ai-hub-game-ready"}, "*");');
      },
    }),
  };
  const servicePath = require.resolve('../src/main/ollama.cjs');
  // Run the production IPC and UI against a deterministic in-process Ollama stand-in.
  require.cache[servicePath] = { loaded: true, exports: { createOllamaService: () => runtime.service } };
  require(path.join(project, 'src', 'main', 'main.cjs'));

  app.whenReady().then(async () => {
    const [win] = BrowserWindow.getAllWindows();
    assert.ok(win, 'The production app did not create a window.');
    win.webContents.once('render-process-gone', (_event, details) => {
      console.error('Renderer exited unexpectedly:', details);
      app.exit(1);
    });
    await verifyWindow(win, runtime);
    await waitFor(() => readyToShow, 'The production app did not request to show its window.');
    assert.equal(win.isVisible(), false, 'The smoke window must remain hidden.');
    verified = true;
    console.log('Hidden Electron smoke passed: navigation to a single creation conversation, model-download consent and progress, and saved Godot play, editing, and restore.');
    win.close();
  }).catch((error) => {
    console.error(error);
    app.exit(1);
  });
}

if (process.versions.electron) {
  runSmoke();
} else {
  runElectron();
}
