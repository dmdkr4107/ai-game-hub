const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {buildFreeGameHtml} = require('../src/main/free-game-html.cjs');

const game = {
  title: '별 & <달>',
  summary: '테스트 </p><b>제목</b> — Space로 점프',
  code: `function createGame({ctx}) {
    const text = "</script><b>화면</b>";
    return {
      update() {},
      draw() {ctx.fillText(text, 20, 20);}
    };
  }`,
};

const entities = {'&amp;':'&', '&lt;':'<', '&gt;':'>', '&quot;':'"', '&#39;':"'"};
const unescapeHtml = value => value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]);
const sha256 = value => "'sha256-" + createHash('sha256').update(value).digest('base64') + "'";

test('standalone export embeds only trusted scripts and preserves generated source as data', () => {
  const html = buildFreeGameHtml(game);
  assert.match(html, /^<!doctype html>\s+<html lang="ko">/);
  assert.match(html, /<title>별 &amp; &lt;달&gt;<\/title>/);
  assert.match(html, /테스트 &lt;\/p&gt;&lt;b&gt;제목&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>화면|<b>제목|<script[^>]+src=/);
  const source = html.match(/<template id="game-source">([^<]+)/)[1];
  assert.deepEqual(JSON.parse(Buffer.from(source, 'base64').toString('utf8')), {code:game.code});
  const child = unescapeHtml(html.match(/<template id="game-frame-markup">([^<]+)/)[1]);
  const runner = child.match(/<script>([\s\S]+)<\/script>/)[1];
  const productionRunner = readFileSync(path.join(__dirname, '..', 'src', 'main', 'free-preview', 'runner.js'), 'utf8');
  assert.equal(runner, productionRunner.replace(/\r\n?/g, '\n'));
  const shell = html.match(/<script>([\s\S]+)<\/script>/)[1];
  assert.match(shell, /setAttribute\('sandbox', 'allow-scripts'\)/);
  assert.doesNotMatch(shell, /eval\(|new Function\(|allow-same-origin/);
  const outerPolicy = unescapeHtml(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1]);
  const innerPolicy = unescapeHtml(child.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1]);
  assert.ok(outerPolicy.includes(sha256(shell)));
  assert.ok(outerPolicy.includes(sha256(runner)));
  assert.ok(innerPolicy.includes(sha256(runner)));
  assert.match(innerPolicy, /frame-src 'none'/);
  for (const policy of [outerPolicy, innerPolicy]) {
    assert.match(policy, /default-src 'none'/);
    assert.match(policy, /worker-src blob:/);
    assert.match(policy, /connect-src 'none'/);
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:/);
  }
});

test('standalone export rejects invalid game records and supports an English shell', () => {
  assert.throws(() => buildFreeGameHtml({...game, code:'<script>no</script>'}), /Invalid game data/);
  assert.throws(() => buildFreeGameHtml({...game, code:'function createGame('}), /Invalid game data/);
  assert.match(buildFreeGameHtml(game, 'en'), /<html lang="en">[\s\S]*>Focus game<\/button>/);
});
