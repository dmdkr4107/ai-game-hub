const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root,file), 'utf8');
const {windowPreferences, isTrustedDevUrl} = require('../src/main/security.cjs');

test('four screens and menu navigation exist', () => {
  const app = read('src/renderer/App.tsx');
  assert.match(app, /\['home','create','games','settings'\]/);
  for (const screen of ['home','create','games','settings']) {
    assert.ok(app.includes(`page==='${screen}'`), `${screen} screen missing`);
  }
  assert.match(app, /onClick=\{\(\)=>setPage\(item\)\}/);
  assert.match(app, /aria-current=/);
});

test('Korean and English menu texts are provided', () => {
  const messages = read('src/renderer/i18n/messages.ts');
  for (const phrase of ['AI 게임 만들기','내 게임','설정','Create with AI','My Games','Settings']) {
    assert.ok(messages.includes(phrase));
  }
});

test('unfinished AI and game features are not exposed as working', () => {
  const app = read('src/renderer/App.tsx');
  assert.match(app, /disabled className="primary-button disabled-action"/);
  assert.match(app, /getAppInfo/);
  const preload = read('src/preload/preload.cjs');
  assert.doesNotMatch(preload, /exec\(|spawn\(|readFile|writeFile|openExternal/);
  assert.deepEqual([...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m=>m[1]), ['hub:getAppInfo']);
});

test('Electron renderer security defaults are restrictive', () => {
  assert.equal(windowPreferences.nodeIntegration,false);
  assert.equal(windowPreferences.contextIsolation,true);
  assert.equal(windowPreferences.sandbox,true);
  assert.equal(windowPreferences.webSecurity,true);
  assert.equal(windowPreferences.webviewTag,false);
  assert.equal(windowPreferences.allowRunningInsecureContent,false);
  const code=read('src/main/security.cjs');
  assert.match(code,/setPermissionRequestHandler/);
  assert.match(code,/setWindowOpenHandler/);
  assert.match(code,/will-navigate/);
  const html=read('index.html');
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/object-src 'none'/);
  assert.match(html,/script-src 'self';/);
});

test('only expected loopback development address may be loaded', () => {
  assert.equal(isTrustedDevUrl('http://127.0.0.1:5173/'),true);
  for (const address of ['https://example.com', 'http://evil.com:5173/', 'http://localhost:5173/', 'file:///tmp/a.html', 'http://127.0.0.1:9000/', 'http://127.0.0.1:5173/?evil=1']) {
    assert.equal(isTrustedDevUrl(address),false,address);
  }
});

test('original phase 1 docs remain and later stages are absent', () => {
  for (const doc of ['docs/README.md','docs/01_requirements_review.md','docs/02_architecture.md','docs/03_roadmap.md','docs/04_phase1_definition.md','docs/05_risks_decisions.md']) {
    assert.ok(fs.existsSync(path.join(root,doc)),doc);
  }
  for (const disallowed of ['src/ai','src/godot','src/server']) {
    assert.equal(fs.existsSync(path.join(root,disallowed)),false,disallowed);
  }
});
