const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');
const {createGameService, validateGameConfig} = require('../src/main/games.cjs');

const legacyConfig = {title: '별을 모으는 게임', stars: 3, difficulty: 'normal'};
const config = {...legacyConfig, theme: 'night', mobility: 'standard'};
const changed = {title: '별이 가득한 게임', stars: 6, difficulty: 'hard', theme: 'forest', mobility: 'steady'};

async function fixture(t, options = {}) {
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'hub-game-store-test-'));
  t.after(async () => {
    if (path.dirname(directory) === parent && await fs.realpath(directory) === directory) {
      await fs.rm(directory, {recursive: true, force: true, maxRetries: 4, retryDelay: 50});
    }
  });
  const root = path.join(directory, 'projects');
  const templatesRoot = path.join(directory, 'templates');
  const common = path.join(templatesRoot, 'common');
  await fs.mkdir(common, {recursive:true});
  await fs.writeFile(path.join(common, 'run-clock.gd'), 'extends RefCounted\n');
  await fs.writeFile(path.join(common, 'ui-font.bin'), 'fixture font');
  await fs.writeFile(path.join(common, 'ui-font-OFL.txt'), 'fixture license');
  const enginePath = path.join(directory, 'Godot.exe');
  await fs.writeFile(enginePath, 'fake engine for injected test runner');
  for (const mode of ['2d', '3d']) {
    const template = path.join(templatesRoot, mode);
    await fs.mkdir(template, {recursive: true});
    for (const name of ['project.godot', 'main.tscn', 'main.gd']) {
      await fs.writeFile(path.join(template, name), mode + ':' + name);
    }
  }
  const args = {
    root, templatesRoot, enginePath,
    validateImpl: async () => true,
    exportImpl: ({outputDirectory}) => fs.writeFile(path.join(outputDirectory, 'index.html'), 'preview'),
    ...options,
  };
  const service = createGameService(args);
  t.after(() => service.dispose());
  return {directory, root, templatesRoot, enginePath, args, service};
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

test('keeps 2D and 3D projects and can restore an earlier immutable revision after restarting', async (t) => {
  const {root, args, service} = await fixture(t);
  const first = await service.create({mode: '2d', config});
  const second = await service.create({mode: '3d', config});
  assert.equal(first.status, 'done');
  assert.equal(second.status, 'done');
  assert.equal(second.game.mode, '3d');
  const directory = path.join(root, first.game.id);
  const statePath = path.join(directory, 'state.json');
  const original = await readJson(statePath);
  const originalConfig = path.join(directory, 'revisions', original.current.id, 'game-config.json');
  assert.deepEqual(await readJson(originalConfig), config);

  const reloaded = createGameService(args);
  const updated = await reloaded.update({id: first.game.id, config: changed});
  assert.equal(updated.status, 'done');
  assert.equal(updated.game.canRestore, true);
  assert.deepEqual(await readJson(originalConfig), config);
  const newState = await readJson(statePath);
  assert.notEqual(newState.current.id, original.current.id);
  assert.equal(newState.backup.id, original.current.id);
  assert.deepEqual(await readJson(path.join(directory, 'revisions', newState.current.id, 'game-config.json')), changed);

  const reopened = createGameService(args);
  const restored = await reopened.restore(first.game.id);
  assert.deepEqual(restored, {status: 'done', game: {...first.game, canRestore: false}});
  assert.deepEqual(await reopened.restore(first.game.id), {status: 'error', code: 'no-backup'});
  const library = await reopened.list();
  assert.ok(library.engineReady);
  assert.equal(library.playingId, null);
  assert.deepEqual(new Set(library.games.map(({mode}) => mode)), new Set(['2d', '3d']));
});

test('validates modes, text, game settings and project identifiers before touching storage', async (t) => {
  const {root, service} = await fixture(t);
  assert.equal(validateGameConfig({title: ' Foo\u0000 ', stars: 3, difficulty: 'normal'}), null);
  assert.deepEqual(validateGameConfig(legacyConfig), config);
  assert.deepEqual(validateGameConfig({...config, title: '  편한 제목  ', script: 'ignored'}), {...config, title: '편한 제목'});
  for (const candidate of [
    null, {...config, stars: 2.5}, {...config, stars: 9}, {...config, difficulty: 'debug'},
    {...config, title: 'x'.repeat(81)}, {...config, theme: 'https://example.com'},
    {...config, mobility: 9000}, {...config, mobility: null},
  ]) {
    assert.deepEqual(await service.create({mode: '2d', config: candidate}), {status: 'error', code: 'invalid-request'});
  }
  assert.deepEqual(await service.create({mode: '../2d', config}), {status: 'error', code: 'invalid-request'});
  assert.deepEqual(await service.update({id: '../other', config}), {status: 'error', code: 'invalid-request'});
  assert.deepEqual(await service.restore('..'), {status: 'error', code: 'invalid-request'});
  assert.deepEqual(await service.play('C:\\Windows'), {status: 'error', code: 'invalid-request'});
  await assert.rejects(fs.access(root), {code: 'ENOENT'});
});

test('loads and restores legacy projects with default presets without rewriting their revision', async (t) => {
  const {root, args, service} = await fixture(t);
  const {game} = await service.create({mode: '2d', config: legacyConfig});
  const directory = path.join(root, game.id);
  const statePath = path.join(directory, 'state.json');
  const manifest = await readJson(statePath);
  const originalConfig = path.join(directory, 'revisions', manifest.current.id, 'game-config.json');
  await fs.writeFile(statePath, JSON.stringify({...manifest, current: {...manifest.current, config: legacyConfig}}));
  await fs.writeFile(originalConfig, JSON.stringify(legacyConfig));

  const reopened = createGameService(args);
  assert.deepEqual((await reopened.list()).games, [game]);
  assert.equal((await reopened.update({id: game.id, config: changed})).game.theme, 'forest');
  assert.deepEqual((await reopened.restore(game.id)).game, game);
  assert.deepEqual(await readJson(originalConfig), legacyConfig);
});

test('a failed revision does not replace the last working manifest or leave a staged project', async (t) => {
  const {root, templatesRoot, args, service} = await fixture(t);
  const game = (await service.create({mode: '2d', config})).game;
  const directory = path.join(root, game.id);
  const statePath = path.join(directory, 'state.json');
  const original = await fs.readFile(statePath);
  await fs.unlink(path.join(templatesRoot, '2d', 'main.gd'));

  const reloaded = createGameService(args);
  assert.equal((await reloaded.update({id: game.id, config: changed})).status, 'error');
  assert.deepEqual(await fs.readFile(statePath), original);
  assert.equal((await fs.readdir(path.join(directory, 'revisions'))).length, 1);
  assert.deepEqual((await reloaded.list()).games, [game]);
});

test('requires a successful engine validation before creation or revision promotion', async (t) => {
  let passes = true;
  const calls = [];
  const {root, service} = await fixture(t, {
    validateImpl: async (executable, staged, signal) => {
      assert.ok(path.isAbsolute(executable));
      assert.equal(signal.aborted, false);
      calls.push(await readJson(path.join(staged, 'game-config.json')));
      return passes;
    },
  });
  const game = (await service.create({mode: '2d', config})).game;
  const directory = path.join(root, game.id);
  const before = await fs.readFile(path.join(directory, 'state.json'));
  passes = false;
  assert.deepEqual(await service.update({id: game.id, config: changed}), {status: 'error', code: 'validation-failed'});
  assert.deepEqual(await service.create({mode: '3d', config: changed}), {status: 'error', code: 'validation-failed'});
  assert.deepEqual(calls, [config, changed, changed]);
  assert.deepEqual(await fs.readFile(path.join(directory, 'state.json')), before);
  assert.equal((await fs.readdir(path.join(directory, 'revisions'))).length, 1);
  assert.deepEqual((await fs.readdir(root)), [game.id]);
  assert.deepEqual((await service.list()).games, [game]);
});

test('filters project junctions and refuses to read, change or launch them', async (t) => {
  const {root, directory, service} = await fixture(t);
  const created = (await service.create({mode: '2d', config})).game;
  const old = path.join(root, created.id);
  const outside = path.join(directory, 'external-project');
  await fs.rename(old, outside);
  await fs.symlink(outside, old, process.platform === 'win32' ? 'junction' : 'dir');
  const stateFile = path.join(outside, 'state.json');
  const stateBefore = await fs.readFile(stateFile);
  assert.deepEqual((await service.list()).games, []);
  assert.equal((await service.update({id: created.id, config: changed})).status, 'error');
  assert.equal((await service.play(created.id)).status, 'error');
  assert.deepEqual(await fs.readFile(stateFile), stateBefore);
});

test('exports a fresh trusted preview and revokes the session and files on stop', async (t) => {
  let invocation;
  const exportImpl = async (options) => {
    invocation = options;
    await fs.writeFile(path.join(options.outputDirectory, 'index.html'), 'preview');
  };
  const {service, root, enginePath} = await fixture(t, {exportImpl});
  const game = (await service.create({mode: '3d', config})).game;
  const base = path.join(root, game.id);
  const manifest = await readJson(path.join(base, 'state.json'));
  await fs.writeFile(path.join(base, 'revisions', manifest.current.id, 'main.gd'), 'user edits ignored by preview');

  assert.deepEqual(await service.play(game.id), {status: 'done', game});
  assert.equal(invocation.executable, enginePath);
  assert.equal(path.dirname(invocation.projectDirectory), path.dirname(invocation.outputDirectory));
  assert.notEqual(invocation.projectDirectory, invocation.outputDirectory);
  assert.equal(invocation.signal.aborted, false);
  assert.equal(await fs.readFile(path.join(invocation.projectDirectory, 'main.gd'), 'utf8'), '3d:main.gd');
  assert.deepEqual(await readJson(path.join(invocation.projectDirectory, 'game-config.json')), config);
  const {playingId, previewUrl} = await service.list();
  assert.equal(playingId, game.id);
  assert.match(previewUrl, /^hub-game:\/\/play\/[\da-f-]{36}\/index\.html$/);
  const token = new URL(previewUrl).pathname.split('/')[1];
  assert.equal(service.getPreviewDirectory(token), invocation.outputDirectory);
  assert.equal(service.getPreviewDirectory(token + '/..'), null);
  assert.deepEqual(await service.play(game.id), {status: 'error', code: 'already-playing'});
  assert.deepEqual(await service.stop(), {status: 'done'});
  assert.equal((await service.list()).playingId, null);
  assert.equal((await service.list()).previewUrl, null);
  assert.equal(service.getPreviewDirectory(token), null);
  await assert.rejects(fs.access(path.dirname(invocation.projectDirectory)), {code: 'ENOENT'});
});

test('cleans a failed or incomplete export and preserves the saved game', async (t) => {
  let previewDirectory;
  let throwFailure = true;
  const exportImpl = async ({outputDirectory}) => {
    previewDirectory = path.dirname(outputDirectory);
    if (throwFailure) {
      await fs.writeFile(path.join(outputDirectory, 'partial'), 'incomplete');
      throw new Error('test export failure');
    }
  };
  const {service, args} = await fixture(t, {exportImpl});
  const game = (await service.create({mode: '2d', config})).game;
  const missing = createGameService({...args, enginePath: 'missing.exe'});
  assert.equal((await missing.list()).engineReady, false);
  assert.deepEqual(await missing.play(game.id), {status: 'error', code: 'engine-unavailable'});

  assert.deepEqual(await service.play(game.id), {status: 'error', code: 'play-failed'});
  await assert.rejects(fs.access(previewDirectory), {code: 'ENOENT'});
  throwFailure = false;
  assert.deepEqual(await service.play(game.id), {status: 'error', code: 'play-failed'});
  await assert.rejects(fs.access(previewDirectory), {code: 'ENOENT'});
  assert.deepEqual((await service.list()).games, [game]);
  assert.equal((await service.list()).previewUrl, null);
});

test('stopping an in-progress export aborts it and removes its temporary workspace', async (t) => {
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  const {service} = await fixture(t, {
    exportImpl: ({projectDirectory, signal}) => {
      started(path.dirname(projectDirectory));
      return delay(10_000, undefined, {signal});
    },
  });
  const game = (await service.create({mode: '2d', config})).game;
  const play = service.play(game.id);
  const directory = await entered;
  assert.equal((await service.list()).previewUrl, null);
  assert.deepEqual(await service.stop(), {status: 'done'});
  assert.deepEqual(await play, {status: 'cancelled'});
  await assert.rejects(fs.access(directory), {code: 'ENOENT'});
  assert.equal((await service.list()).playingId, null);
});

test('preview expiry revokes its URL without changing the saved game', async (t) => {
  const {service} = await fixture(t, {previewLimitMs: 200});
  const game = (await service.create({mode: '2d', config})).game;
  assert.equal((await service.play(game.id)).status, 'done');
  const {previewUrl} = await service.list();
  assert.ok(previewUrl);
  const token = new URL(previewUrl).pathname.split('/')[1];
  const directory = path.dirname(service.getPreviewDirectory(token));
  for (let attempt = 0; attempt < 100 && await fs.access(directory).then(() => true, () => false); attempt++) {
    await delay(10);
  }
  await assert.rejects(fs.access(directory), {code: 'ENOENT'});
  assert.equal(service.getPreviewDirectory(token), null);
  assert.deepEqual((await service.list()).games, [game]);
});

test('does not interleave project mutations and leaves a coherent snapshot', async (t) => {
  const {service} = await fixture(t);
  const [first, overlapping] = await Promise.all([
    service.create({mode: '2d', config}), service.create({mode: '3d', config}),
  ]);
  assert.equal(first.status, 'done');
  assert.deepEqual(overlapping, {status: 'error', code: 'busy'});
  assert.deepEqual((await service.list()).games, [first.game]);
});

test('distinguishes a ready game engine from a missing Web preview template', async (t) => {
  const {service} = await fixture(t, {
    previewReadyImpl: async () => false,
    exportImpl: async () => {
      throw Object.assign(new Error('missing Web template'), {code: 'web-template-missing'});
    },
  });
  const {game} = await service.create({mode: '2d', config});
  const library = await service.list();
  assert.equal(library.engineReady, true);
  assert.equal(library.previewReady, false);
  assert.deepEqual(await service.play(game.id), {status: 'error', code: 'web-template-missing'});
  assert.deepEqual((await service.list()).games, [game]);
});

test('an export timeout releases the preview and can be retried', async (t) => {
  let first = true;
  const {service} = await fixture(t, {
    async exportImpl({outputDirectory}) {
      if (first) {
        first = false;
        throw Object.assign(new Error('timed out'), {code: 'web-export-timeout'});
      }
      await fs.writeFile(path.join(outputDirectory, 'index.html'), 'preview');
    },
  });
  const {game} = await service.create({mode: '2d', config});
  assert.deepEqual(await service.play(game.id), {status: 'error', code: 'web-export-timeout'});
  assert.equal((await service.list()).previewUrl, null);
  assert.equal((await service.play(game.id)).status, 'done');
});

test('concurrent stops and shutdown wait for the same in-progress export cleanup', async (t) => {
  let start;
  let release;
  const started = new Promise(resolve => { start = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const {service} = await fixture(t, {
    async exportImpl({projectDirectory, signal}) {
      start(path.dirname(projectDirectory));
      await held;
      signal.throwIfAborted();
    },
  });
  const {game} = await service.create({mode: '2d', config});
  const play = service.play(game.id);
  const directory = await started;
  const stop = service.stop();
  assert.equal(service.stop(), stop);
  const dispose = service.dispose();
  assert.equal(service.dispose(), dispose);
  let finished = false;
  const saved = dispose.then(() => { finished = true; });
  await delay(10);
  assert.equal(finished, false);
  release();
  assert.deepEqual(await play, {status: 'cancelled'});
  await saved;
  await assert.rejects(fs.access(directory), {code: 'ENOENT'});
});
