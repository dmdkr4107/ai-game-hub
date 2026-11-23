const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {registerGameProtocol} = require('../src/main/game-protocol.cjs');
const {serveFreePreview} = require('../src/main/free-preview.cjs');

test('free games use a separate secure scheme without overriding Chromium security policy', () => {
  let schemes;
  registerGameProtocol({registerSchemesAsPrivileged(value) { schemes = value; }});
  assert.equal(schemes[0].scheme, 'hub-game');
  const free = schemes.find(({scheme}) => scheme === 'hub-free');
  assert.equal(free.privileges.secure, true);
  assert.notEqual(free.privileges.bypassCSP, true);
  assert.notEqual(free.privileges.supportFetchAPI, true);
});

test('free preview serves a hash-restricted opaque runner and no other resources', async () => {
  let handle;
  serveFreePreview({protocol: {handle(scheme, callback) {
    assert.equal(scheme, 'hub-free');
    handle = callback;
  }}});
  const url = 'hub-free://play/index.html';
  const runner = await handle({url, method: 'GET'});
  assert.equal(runner.status, 200);
  assert.equal(runner.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(runner.headers.get('Cache-Control'), 'no-store');
  const policy = runner.headers.get('Content-Security-Policy');
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /sandbox allow-scripts$/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /worker-src blob:/);
  assert.doesNotMatch(policy, /allow-same-origin|unsafe-inline|unsafe-eval|https?:/);
  const html = await runner.text();
  for (const tag of ['script', 'style']) {
    const body = html.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'))[1];
    assert.ok(policy.includes("'sha256-" + createHash('sha256').update(body).digest('base64') + "'"));
  }
  const head = await handle({url, method: 'HEAD'});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const rejected of [url + '?x=1', 'hub-free://play/runner.js', 'hub-free://other/index.html']) {
    assert.equal((await handle({url: rejected, method: 'GET'})).status, 404);
  }
  assert.equal((await handle({url, method: 'POST'})).status, 404);
});
