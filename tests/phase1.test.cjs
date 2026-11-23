const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root,file), 'utf8');
const {windowPreferences, isTrustedDevUrl} = require('../src/main/security.cjs');

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
  assert.match(html,/connect-src 'none';/);
});

test('only expected loopback development address may be loaded', () => {
  assert.equal(isTrustedDevUrl('http://127.0.0.1:5173/'),true);
  for (const address of ['https://example.com', 'http://evil.com:5173/', 'http://localhost:5173/', 'file:///tmp/a.html', 'http://127.0.0.1:9000/', 'http://127.0.0.1:5173/?evil=1']) {
    assert.equal(isTrustedDevUrl(address),false,address);
  }
});

test('original design docs remain and public service remains outside the prototype', () => {
  for (const doc of ['docs/README.md','docs/01_requirements_review.md','docs/02_architecture.md','docs/03_roadmap.md','docs/04_phase1_definition.md','docs/05_risks_decisions.md']) {
    assert.ok(fs.existsSync(path.join(root,doc)),doc);
  }
  assert.equal(fs.existsSync(path.join(root, 'src/server')), false);
});
