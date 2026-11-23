const assert = require('node:assert/strict');
const test = require('node:test');
const {extractFreeGameReply} = require('../src/main/free-reply.cjs');
const {freeSourceLimits} = require('../src/main/free-source.cjs');

const metadata = {title: 'Recovered game', summary: 'Play and view the progress in the preview.'};
const code = [
  'function createGame({ctx}) {',
  '  const pattern = /[{}]/;',
  '  const text = `closing brace } and a template ${pattern.test("{")}`;',
  '  // This comment also contains }',
  '  return {update(dt, input) { return input.keys.includes("KeyA"); }, draw() { ctx.fillText(text, 20, 20); }};',
  '}',
].join('\n');
const source = {...metadata, code};

test('preserves strict and fenced JSON metadata', () => {
  const generated = {...source, title: '별 수집', summary: '별을 모으세요.'};
  const json = JSON.stringify(generated);
  assert.deepEqual(extractFreeGameReply(json, metadata), {source: generated});
  assert.deepEqual(extractFreeGameReply('Here is your game.\r\n```json\r\n' + json + '\r\n```\r\nPlay!', metadata),
    {source: generated});
  const fencedCode = JSON.stringify({...generated, code: '```js\n' + code + '\n```'});
  assert.deepEqual(extractFreeGameReply(fencedCode, metadata), {source: generated});
});

test('extracts fenced JavaScript and a function surrounded by prose', () => {
  assert.deepEqual(extractFreeGameReply('Ready:\n~~~javascript\n' + code + '\n~~~\nEnjoy!', metadata), {source});
  assert.deepEqual(extractFreeGameReply('```json\n' + code + '\n```', metadata), {source});
  assert.deepEqual(extractFreeGameReply('Here is your game.\n' + code + ';\nEnjoy!', metadata), {source});
  assert.deepEqual(extractFreeGameReply('Code: ' + code + '\nNow play.', metadata), {source});
  assert.deepEqual(extractFreeGameReply('{\n  "code": "' + code + '"\n}', metadata), {source});
  const withHelper = code + '\nfunction helper() { return 1; }';
  assert.deepEqual(extractFreeGameReply('```js\n' + withHelper + '\n```', metadata),
    {source: {...metadata, code: withHelper}});
  assert.deepEqual(extractFreeGameReply(withHelper, metadata), {source: {...metadata, code: withHelper}});
});

test('rejects ambiguous, incomplete and unsupported markup replies', () => {
  assert.match(extractFreeGameReply('```js\n' + code, metadata).issue, /did not close/);
  assert.match(extractFreeGameReply(code.slice(0, -1), metadata).issue, /complete JavaScript/);
  assert.match(extractFreeGameReply('```js\n' + code + '\n```\n```js\n' + code + '\n```', metadata).issue, /one game/);
  assert.match(extractFreeGameReply(code + '\n' + code, metadata).issue, /one complete/);
  assert.match(extractFreeGameReply('```html\n<script>\n' + code + '\n</script>\n```', metadata).issue, /complete JavaScript/);
});

test('keeps source bounds and strict JSON fields', () => {
  assert.match(extractFreeGameReply(JSON.stringify({...source, extra: true}), metadata).issue, /only title/);
  assert.match(extractFreeGameReply(JSON.stringify({...source, code: code + ' '.repeat(freeSourceLimits.code)}), metadata).issue,
    /valid syntax/);
  assert.match(extractFreeGameReply(' '.repeat(150_000) + code, metadata).issue, /size limit/);
  assert.match(extractFreeGameReply('', metadata).issue, /no game source/);
});

test('syntax validation does not evaluate JavaScript', () => {
  const script = 'function createGame() { throw new Error("Not executed in parser"); }';
  assert.deepEqual(extractFreeGameReply(script, metadata), {source: {...metadata, code: script}});
});
