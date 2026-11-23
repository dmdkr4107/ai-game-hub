const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const {serveGamePreview, registerGameProtocol} = require('../src/main/game-protocol.cjs');

test('game preview protocol allows Fetch without bypassing CSP or exposing Node', () => {
  let registration;
  registerGameProtocol({registerSchemesAsPrivileged(value) { registration = value; }});
  assert.equal(registration[0].scheme, 'hub-game');
  assert.equal(registration[0].privileges.supportFetchAPI, true);
  assert.notEqual(registration[0].privileges.bypassCSP, true);
});

test('preview serves only allowlisted assets for the current token', async () => {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'hub-preview-protocol-'));
  try {
    await fs.writeFile(path.join(directory, 'index.wasm'), 'game');
    await fs.writeFile(path.join(directory, 'secret.txt'), 'not a game resource');
    const token = '785039a8-3a5d-4dc5-8872-881a29964cd7';
    let active = true;
    let handle;
    const session = {protocol: {handle(channel, handler) { assert.equal(channel, 'hub-game'); handle=handler; }}};
    const net = {async fetch(url, {method}) {
      return new Response(method === 'HEAD' ? null : await fs.readFile(fileURLToPath(url)));
    }};
    serveGamePreview(session, net, {getPreviewDirectory: id => id === token && active ? directory : null});
    const base = 'hub-game://play/' + token;
    const response = await handle({url: base + '/index.wasm', method:'GET'});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/wasm');
    assert.match(response.headers.get('Content-Security-Policy'), /connect-src 'self'/);
    assert.equal(await response.text(), 'game');

    for (const file of ['/secret.txt','/%2e%2e/index.wasm','/index.wasm?untrusted=1','/index.js']) {
      assert.equal((await handle({url:base + file,method:'GET'})).status, 404);
    }
    assert.equal((await handle({url:base + '/index.wasm',method:'POST'})).status,404);
    active = false;
    assert.equal((await handle({url:base + '/index.wasm',method:'GET'})).status,404);
  } finally {
    await fs.rm(directory, {recursive:true,force:true,maxRetries:4,retryDelay:50});
  }
});

test('stopping a preview during an asset read prevents a late response', async () => {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'hub-preview-race-'));
  try {
    await fs.writeFile(path.join(directory, 'index.wasm'), 'game');
    const token = '785039a8-3a5d-4dc5-8872-881a29964cd7';
    let active = true;
    let cancelled = false;
    let handle;
    const session = {protocol: {handle(_channel, handler) { handle = handler; }}};
    const net = {async fetch() {
      active = false;
      return new Response(new ReadableStream({cancel() { cancelled = true; }}));
    }};
    serveGamePreview(session, net, {getPreviewDirectory: id => id === token && active ? directory : null});
    const response = await handle({url:'hub-game://play/' + token + '/index.wasm',method:'GET'});
    assert.equal(response.status, 404);
    assert.equal(cancelled, true);
  } finally {
    await fs.rm(directory, {recursive:true,force:true,maxRetries:4,retryDelay:50});
  }
});
