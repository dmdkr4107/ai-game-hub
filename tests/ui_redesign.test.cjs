const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

test('redesigned UI keeps four real navigation targets with accessible names', () => {
  const app = read('src/renderer/App.tsx');
  assert.match(app,/const nav:PageId\[\]=\['home','create','games','settings'\]/);
  for (const screen of ['home','create','games','settings']) assert.ok(app.includes(`page==='${screen}'`));
  assert.match(app,/aria-label=\{t\[item\]\}/);
  assert.match(app,/aria-current=/);
});

test('create studio is explicitly a UI demo and never submits a prompt', () => {
  const app=read('src/renderer/App.tsx');
  const lang=read('src/renderer/i18n/messages.ts');
  assert.match(app,/disabled className="primary-button disabled-action"/);
  assert.match(app,/maxLength=\{1000\}/);
  assert.match(app,/onClick=\{\(\)=>setPrompt\(sample\)\}/);
  assert.match(app,/setConcept\('2d'\)/);
  assert.match(app,/setConcept\('3d'\)/);
  assert.ok(lang.includes('작성한 내용은 서버나 AI로 전송되지 않고'));
  assert.doesNotMatch(app, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/);
});

test('settings language selector and reduced-motion switch are wired to local state', () => {
  const app=read('src/renderer/App.tsx');
  const css=read('src/renderer/styles.css');
  assert.match(app,/onChange=\{e=>setLanguage\(e\.target\.value as Language\)\}/);
  assert.match(app,/onClick=\{\(\)=>setReduceMotion\(v=>!v\)\}/);
  assert.match(app,/aria-checked=\{reduceMotion\}/);
  assert.match(css,/\.reduce-motion \*/);
});

test('new theme is self-contained and no service or engine code was added', () => {
  const css=read('src/renderer/styles.css');
  assert.match(css,/\.home-hero\{/);
  assert.match(css,/\.studio-grid\{/);
  assert.match(css,/\.library-empty\{/);
  assert.match(css,/\.settings-grid\{/);
  assert.doesNotMatch(css, /@import\s+url\(['"]https?:/);
  for (const folder of ['src/ai','src/godot','src/server']) {
    assert.equal(fs.existsSync(path.join(root,folder)),false,folder);
  }
});
