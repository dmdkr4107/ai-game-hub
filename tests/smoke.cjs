const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

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
  }, 30_000);

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

async function verifyWindow(win) {
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
    await input.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
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
  await key('Space');
  await waitFor(() => evaluate('document.documentElement.classList.contains("reduce-motion")'), 'Reduced motion was not applied.');

  await click('.nav-item:nth-child(1)');
  await waitFor(async () => (await activePage()) === 'Home', 'Mouse did not open Home.');
  const scrollTop = await evaluate('document.querySelector("main").scrollTop = 240; document.querySelector("main").scrollTop');
  assert.ok(scrollTop > 0, 'Home was not tall enough to check scroll reset.');
  await click('.nav-item:nth-child(2)');
  await waitFor(async () => (await activePage()) === 'Create with AI', 'Mouse did not open the creation screen.');
  assert.equal(await evaluate('document.querySelector("main").scrollTop'), 0);

  await click('.choice-button:nth-child(2)');
  await waitFor(() => evaluate('document.querySelector(".choice-button:nth-child(2)").getAttribute("aria-pressed") === "true"'), '3D selection did not apply.');
  await click('.example-card:nth-child(2)');
  await waitFor(() => evaluate('document.querySelector("textarea").value.length > 0'), 'The example did not populate the idea field.');
  assert.equal(await evaluate('document.querySelector(".disabled-action").disabled'), true);

  await click('.nav-item:nth-child(3)');
  await waitFor(async () => (await activePage()) === 'My Games', 'Mouse did not open the library.');
  assert.ok(await evaluate('document.querySelector(".library-empty h2").textContent.trim()'));
  await click('.library-empty button');
  await waitFor(async () => (await activePage()) === 'Create with AI', 'Library action did not open the creation screen.');
  assert.equal(await evaluate('document.activeElement.id'), 'main-content');

  const minimumSize = win.getMinimumSize();
  win.setSize(...minimumSize);
  assert.deepEqual(win.getSize(), minimumSize);
  const [width, height] = win.getContentSize();
  await waitFor(
    () => evaluate(`innerWidth === ${width} && innerHeight === ${height} && document.querySelector(".app-footer").getBoundingClientRect().bottom <= innerHeight`),
    'Footer was clipped at the minimum window height.',
  );

  assert.deepEqual(await evaluate('Object.keys(window.hub)'), ['getAppInfo']);
  assert.equal(await evaluate('Object.isFrozen(window.hub)'), true);
  assert.equal(await evaluate('typeof window.require === "undefined" && typeof window.process === "undefined"'), true);
  const info = await evaluate('window.hub.getAppInfo()');
  assert.equal(typeof info.version, 'string');
  assert.equal(info.phase, 1);
  assert.equal(info.internalOnly, true);
  input.detach();
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
  require(path.join(project, 'src', 'main', 'main.cjs'));

  app.whenReady().then(async () => {
    const [win] = BrowserWindow.getAllWindows();
    assert.ok(win, 'The production app did not create a window.');
    win.webContents.once('render-process-gone', (_event, details) => {
      console.error('Renderer exited unexpectedly:', details);
      app.exit(1);
    });
    await verifyWindow(win);
    await waitFor(() => readyToShow, 'The production app did not request to show its window.');
    assert.equal(win.isVisible(), false, 'The smoke window must remain hidden.');
    verified = true;
    console.log('Hidden Electron smoke passed: compiled startup, mouse and keyboard navigation, UI controls, and preload.');
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
