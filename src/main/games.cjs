const {execFile} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const {promisify} = require('node:util');
const path = require('node:path');
const {exportWebGame, hasWebTemplate} = require('./web-export.cjs');

const TEMPLATE_FILES = ['project.godot', 'main.tscn', 'main.gd'];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MODES = new Set(['2d', '3d']);
const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
const THEMES = new Set(['night', 'forest', 'space']);
const MOBILITIES = new Set(['steady', 'standard', 'swift']);
const fail = (code) => ({status: 'error', code});
const done = (game) => game ? {status: 'done', game} : {status: 'done'};

function validateGameConfig(config) {
  if (typeof config?.title !== 'string' ||
      !Number.isInteger(config.stars) || config.stars < 1 || config.stars > 8 ||
      !DIFFICULTIES.has(config.difficulty)) return null;
  const title = config.title.trim().normalize('NFC');
  if (!title || title.length > 80 || /[\p{C}]/u.test(title)) return null;
  const {theme = 'night', mobility = 'standard'} = config;
  if (!THEMES.has(theme) || !MOBILITIES.has(mobility)) return null;
  return {title, stars: config.stars, difficulty: config.difficulty, theme, mobility};
}

function samePath(first, second) {
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

async function checkPath(file, isDirectory) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || (isDirectory ? !stat.isDirectory() : !stat.isFile()) ||
      !samePath(await fs.realpath(file), file)) {
    throw new Error('Unexpected project path');
  }
  return stat;
}

async function readBounded(file, maxBytes) {
  const stat = await checkPath(file, false);
  if (stat.size > maxBytes) throw new Error('Project file exceeds its size limit');
  const data = await fs.readFile(file);
  if (data.length > maxBytes) throw new Error('Project file exceeds its size limit');
  return data;
}

async function removeOwnedDirectory(parent, directory) {
  if (!samePath(path.dirname(directory), parent)) return;
  try {
    await checkPath(parent, true);
    await checkPath(directory, true);
    await fs.rm(directory, {recursive: true, force: true, maxRetries: 4, retryDelay: 50});
  } catch {
    // A replaced or missing stage should never be followed.
  }
}

function view(id, manifest) {
  return {id, mode: manifest.mode, ...manifest.current.config, canRestore: !!manifest.backup};
}

function readRevision(revision) {
  if (!ID.test(revision?.id ?? '')) throw new Error('Invalid revision');
  const config = validateGameConfig(revision.config);
  if (!config) throw new Error('Invalid game configuration');
  return {id: revision.id, config};
}

const runEngine = promisify(execFile);

async function verifyCandidate(executable, directory, signal, mode, config) {
  const log = path.join(directory, '.verify-' + randomUUID() + '.log');
  try {
    await runEngine(executable, [
      '--headless', '--path', directory, '--log-file', log, '--quit-after', '400', '--', '--hub-self-test',
    ], {cwd: directory, windowsHide: true, timeout: 15_000, maxBuffer: 64 * 1024, signal});
    const contents = (await readBounded(log, 64 * 1024)).toString('utf8');
    const expected = 'AI_HUB_GAME_SELF_TEST_OK ' + mode.toUpperCase() +
      ' stars=' + config.stars + ' difficulty=' + config.difficulty +
      ' theme=' + config.theme + ' mobility=' + config.mobility;
    const lines = contents.split(/\r?\n/);
    return lines.includes(expected) && !lines.some((line) => /^(?:SCRIPT ERROR|ERROR):/.test(line));
  } catch {
    return false;
  } finally {
    await fs.unlink(log).catch(() => {});
  }
}

function createGameService({
  root,
  templatesRoot,
  enginePath,
  exportImpl = exportWebGame,
  previewReadyImpl = exportImpl === exportWebGame ? hasWebTemplate : async () => true,
  validateImpl = verifyCandidate,
  previewLimitMs = 60 * 60_000,
} = {}) {
  const storage = path.resolve(root);
  const templates = path.resolve(templatesRoot);
  const lifetime = new AbortController();
  let mutation;
  let preview;
  let previewStop;
  let disposal;
  const templateCache = new Map();

  async function openStorage() {
    await fs.mkdir(storage, {recursive: true});
    await checkPath(storage, true);
    return storage;
  }

  async function engine() {
    if (typeof enginePath !== 'string' || !path.isAbsolute(enginePath)) return null;
    const executable = path.normalize(enginePath);
    try {
      await checkPath(executable, false);
      return executable;
    } catch {
      return null;
    }
  }

  async function template(mode) {
    if (!templateCache.has(mode)) {
      const directory = path.join(templates, mode);
      await checkPath(directory, true);
      const files = await Promise.all(TEMPLATE_FILES.map(async (name) =>
        [name, await readBounded(path.join(directory, name), 512 * 1024)]));
      const common = path.join(templates, 'common');
      await checkPath(common, true);
      files.push(
        ['hub-run-clock.gd', await readBounded(path.join(common, 'run-clock.gd'), 32 * 1024)],
        ['hub-ui-font.bin', await readBounded(path.join(common, 'ui-font.bin'), 4 * 1024 * 1024)],
        ['hub-ui-font-OFL.txt', await readBounded(path.join(common, 'ui-font-OFL.txt'), 16 * 1024)],
      );
      templateCache.set(mode, files);
    }
    return templateCache.get(mode);
  }

  async function materialize(directory, mode, config) {
    const files = await template(mode);
    for (const [name, bytes] of files) {
      await fs.writeFile(path.join(directory, name), bytes, {flag: 'wx'});
    }
    await fs.writeFile(path.join(directory, 'game-config.json'), JSON.stringify(config) + '\n', {flag: 'wx'});
  }

  async function readGame(directory) {
    await checkPath(directory, true);
    const raw = JSON.parse((await readBounded(path.join(directory, 'state.json'), 4096)).toString('utf8'));
    if (!MODES.has(raw?.mode) || !Number.isSafeInteger(raw.savedAt)) throw new Error('Invalid game manifest');
    const manifest = {
      mode: raw.mode,
      current: readRevision(raw.current),
      backup: raw.backup === null ? null : readRevision(raw.backup),
      savedAt: raw.savedAt,
    };
    const revisions = path.join(directory, 'revisions');
    await checkPath(revisions, true);
    await checkPath(path.join(revisions, manifest.current.id), true);
    if (manifest.backup) await checkPath(path.join(revisions, manifest.backup.id), true);
    return manifest;
  }

  async function commit(directory, manifest) {
    const scratch = path.join(directory, 'state-' + randomUUID() + '.tmp');
    try {
      await fs.writeFile(scratch, JSON.stringify(manifest) + '\n', {flag: 'wx', flush: true});
      await fs.rename(scratch, path.join(directory, 'state.json'));
    } finally {
      await fs.unlink(scratch).catch(() => {});
    }
  }

  async function withMutation(action) {
    if (lifetime.signal.aborted || mutation) return fail('busy');
    const pending = action();
    mutation = pending;
    try {
      return await pending;
    } catch (error) {
      return fail(error.code === 'ENOENT' ? 'not-found' : 'storage-error');
    } finally {
      mutation = undefined;
    }
  }

  async function list() {
    const executable = await engine();
    const engineReady = Boolean(executable);
    const previewReady = engineReady && await previewReadyImpl(executable);
    const directory = await openStorage();
    const entries = await fs.readdir(directory, {withFileTypes: true});
    const games = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID.test(entry.name)) continue;
      try {
        const manifest = await readGame(path.join(directory, entry.name));
        games.push({savedAt: manifest.savedAt, game: view(entry.name, manifest)});
      } catch {
        // Incomplete, unsafe and corrupt folders remain untouched.
      }
    }
    games.sort((a, b) => b.savedAt - a.savedAt);
    return {
      games: games.map(({game}) => game),
      engineReady,
      previewReady,
      playingId: preview?.outputDirectory ? preview.id : null,
      previewUrl: preview?.outputDirectory ? 'hub-game://play/' + preview.token + '/index.html' : null,
    };
  }

  function create(request) {
    const mode = request?.mode;
    const config = validateGameConfig(request?.config);
    if (!MODES.has(mode) || !config) return Promise.resolve(fail('invalid-request'));
    return withMutation(async () => {
      const executable = await engine();
      if (!executable) return fail('engine-unavailable');
      const directory = await openStorage();
      const id = randomUUID();
      const revisionId = randomUUID();
      const stage = await fs.mkdtemp(path.join(directory, '.create-'));
      try {
        const revision = path.join(stage, 'revisions', revisionId);
        await fs.mkdir(revision, {recursive: true});
        await materialize(revision, mode, config);
        if (!await validateImpl(executable, revision, lifetime.signal, mode, config) || lifetime.signal.aborted) {
          return fail('validation-failed');
        }
        const manifest = {mode, current: {id: revisionId, config}, backup: null, savedAt: Date.now()};
        await commit(stage, manifest);
        await fs.rename(stage, path.join(directory, id));
        return done(view(id, manifest));
      } finally {
        await removeOwnedDirectory(directory, stage);
      }
    });
  }

  function update(request) {
    const id = request?.id;
    const config = validateGameConfig(request?.config);
    if (typeof id !== 'string' || !ID.test(id) || !config) return Promise.resolve(fail('invalid-request'));
    return withMutation(async () => {
      const executable = await engine();
      if (!executable) return fail('engine-unavailable');
      const directory = path.join(await openStorage(), id);
      const original = await readGame(directory);
      const revisions = path.join(directory, 'revisions');
      const revisionId = randomUUID();
      const revision = path.join(revisions, revisionId);
      const stage = await fs.mkdtemp(path.join(revisions, '.revise-'));
      let materialized = false;
      let committed = false;
      try {
        await materialize(stage, original.mode, config);
        if (!await validateImpl(executable, stage, lifetime.signal, original.mode, config) || lifetime.signal.aborted) {
          return fail('validation-failed');
        }
        await fs.rename(stage, revision);
        materialized = true;
        const manifest = {mode: original.mode, current: {id: revisionId, config}, backup: original.current, savedAt: Date.now()};
        await commit(directory, manifest);
        committed = true;
        return done(view(id, manifest));
      } finally {
        await removeOwnedDirectory(revisions, stage);
        if (materialized && !committed) await removeOwnedDirectory(revisions, revision);
      }
    });
  }

  function restore(id) {
    if (typeof id !== 'string' || !ID.test(id)) return Promise.resolve(fail('invalid-request'));
    return withMutation(async () => {
      const directory = path.join(await openStorage(), id);
      const original = await readGame(directory);
      if (!original.backup) return fail('no-backup');
      const manifest = {mode: original.mode, current: original.backup, backup: null, savedAt: Date.now()};
      await commit(directory, manifest);
      return done(view(id, manifest));
    });
  }

  async function clearPreview(session) {
    if (preview === session) preview = undefined;
    clearTimeout(session.timer);
    const directory = session.directory;
    session.directory = undefined;
    if (directory) await removeOwnedDirectory(session.parent, directory);
  }

  async function preparePreview(session) {
    const signal = session.controller.signal;
    let gameFound = false;
    try {
      const executable = await engine();
      signal.throwIfAborted();
      if (!executable) return fail('engine-unavailable');
      const original = await readGame(path.join(await openStorage(), session.id));
      gameFound = true;
      signal.throwIfAborted();
      session.parent = await fs.realpath(os.tmpdir());
      session.directory = await fs.mkdtemp(path.join(session.parent, 'ai-game-hub-preview-'));
      const projectDirectory = path.join(session.directory, 'project');
      const outputDirectory = path.join(session.directory, 'web');
      await fs.mkdir(projectDirectory);
      await fs.mkdir(outputDirectory);
      await materialize(projectDirectory, original.mode, original.current.config);
      signal.throwIfAborted();
      const result = await exportImpl({executable, projectDirectory, outputDirectory, signal});
      signal.throwIfAborted();
      if (result === false || !(await checkPath(path.join(outputDirectory, 'index.html'), false)).size) {
        return fail('play-failed');
      }
      signal.throwIfAborted();
      session.outputDirectory = outputDirectory;
      session.timer = setTimeout(() => {
        if (preview === session) void stop();
      }, previewLimitMs);
      session.timer.unref();
      return done(view(session.id, original));
    } catch (error) {
      if (signal.aborted) return {status: 'cancelled'};
      if (!gameFound && error?.code === 'ENOENT') return fail('not-found');
      if (error?.code === 'web-template-missing' || error?.code === 'web-export-timeout') return fail(error.code);
      return fail('play-failed');
    } finally {
      if (!session.outputDirectory) await clearPreview(session);
    }
  }

  function play(id) {
    if (typeof id !== 'string' || !ID.test(id)) return Promise.resolve(fail('invalid-request'));
    return withMutation(async () => {
      if (preview || previewStop) return fail('already-playing');
      const session = {id, token: randomUUID(), controller: new AbortController()};
      preview = session;
      session.pending = preparePreview(session);
      return session.pending;
    });
  }

  function stop() {
    if (previewStop) return previewStop;
    const current = preview;
    if (!current) return Promise.resolve(done());
    preview = undefined;
    current.controller.abort();
    previewStop = current.pending.then(async () => {
      await clearPreview(current);
      return done();
    }).finally(() => {
      previewStop = undefined;
    });
    return previewStop;
  }

  function getPreviewDirectory(token) {
    return preview && preview.token === token ? preview.outputDirectory ?? null : null;
  }

  function dispose() {
    if (!disposal) {
      lifetime.abort();
      disposal = Promise.all([stop(), mutation]).then(([result]) => result);
    }
    return disposal;
  }

  return {list, create, update, restore, play, stop, dispose, getPreviewDirectory};
}

module.exports = {createGameService, validateGameConfig};
