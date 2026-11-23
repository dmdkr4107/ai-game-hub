const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createGameService} = require('../src/main/games.cjs');
const {createOllamaService} = require('../src/main/ollama.cjs');

const project = path.join(__dirname, '..');

async function run() {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'ai-game-hub-stage3-'));
  const enginePath = process.env.AI_HUB_GODOT_PATH || path.join(project, 'tools', 'godot', 'Godot.exe');
  const live = process.argv.includes('--live');
  const ollama = createOllamaService();
  const games = createGameService({
    root,
    templatesRoot: path.join(project, 'src', 'main', 'templates'),
    enginePath,
  });

  async function plan(mode, stars, previous) {
    const title = mode === '2d' ? '달빛 별 여행' : '공간 별 여행';
    const theme = stars === 3 ? (mode === '2d' ? 'forest' : 'space') : (mode === '2d' ? 'space' : 'forest');
    const mobility = stars === 3 ? 'swift' : 'steady';
    const difficulty = stars === 3 ? 'easy' : 'hard';
    if (!live) return {title, stars, difficulty, theme, mobility};
    const result = await ollama.planGame({
      id: mode + '_' + stars, mode, previous,
      prompt: `제목 "${title}", 별 ${stars}개, difficulty ${difficulty}, theme ${theme}, mobility ${mobility}로 설정해 줘.`,
    });
    assert.equal(result.status, 'done', JSON.stringify(result));
    assert.equal(result.config.stars, stars);
    assert.equal(result.config.difficulty, difficulty);
    assert.equal(result.config.theme, theme);
    assert.equal(result.config.mobility, mobility);
    return result.config;
  }

  try {
    assert.ok((await games.list()).engineReady, 'Godot was not found. See README.md.');
    for (const mode of ['2d','3d']) {
      const original = await plan(mode, 3);
      const created = await games.create({mode, config: original});
      assert.equal(created.status, 'done', JSON.stringify(created));
      const {id} = created.game;
      assert.equal(created.game.stars, 3);
      assert.equal(created.game.theme, original.theme);
      assert.equal(created.game.mobility, 'swift');
      assert.equal(created.game.canRestore, false);
      const played = await games.play(id);
      assert.equal(played.status, 'done', JSON.stringify(played));
      const snapshot = await games.list();
      assert.equal(snapshot.playingId, id);
      const url = new URL(snapshot.previewUrl);
      assert.equal(url.protocol, 'hub-game:');
      const directory = games.getPreviewDirectory(url.pathname.split('/')[1]);
      assert.ok(directory, 'The embedded preview was not registered.');
      for (const name of ['index.html', 'index.wasm', 'index.pck']) {
        assert.ok((await fs.stat(path.join(directory, name))).size > 0, name);
      }
      assert.equal((await games.stop()).status, 'done');
      assert.equal((await games.list()).previewUrl, null);
      const revision = await plan(mode, 4, created.game);
      const updated = await games.update({id, config: revision});
      assert.equal(updated.status, 'done', JSON.stringify(updated));
      assert.equal(updated.game.stars, 4);
      assert.equal(updated.game.theme, revision.theme);
      assert.equal(updated.game.mobility, 'steady');
      assert.equal(updated.game.canRestore, true);
      const restored = await games.restore(id);
      assert.equal(restored.status, 'done', JSON.stringify(restored));
      assert.equal(restored.game.stars, 3);
      assert.equal(restored.game.theme, original.theme);
      assert.equal(restored.game.mobility, 'swift');
      assert.equal(restored.game.canRestore, false);
      console.log(`${mode.toUpperCase()}: ${original.theme}/swift preview exported, ${revision.theme}/steady revision validated, and original restored.`);
    }
    assert.equal((await games.list()).games.length, 2);
  } finally {
    ollama.dispose();
    await games.dispose();
    await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}

run().catch(error => {console.error(error);process.exitCode=1;});
