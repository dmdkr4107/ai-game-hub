const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {freeSourceLimits, validateFreeSource} = require('./free-source.cjs');

const maxProjectBytes = 512 * 1024;
const maxTurns = 12;
const candidateLifetime = 5 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const validFreeId = (id) => typeof id === 'string' && uuid.test(id);
const validFreePrompt = (prompt) => typeof prompt === 'string' && prompt.length <= freeSourceLimits.prompt && !!prompt.trim();
const error = (code) => ({status: 'error', code});
const done = (project) => ({status: 'done', project});

function readVersion(raw) {
  const source = validateFreeSource(raw);
  if (!source || !validFreeId(raw.revision) || !Array.isArray(raw.turns) || !raw.turns.length || raw.turns.length > maxTurns) {
    throw new Error('Invalid free game revision');
  }
  const turns = raw.turns.map(turn => {
    if (!validFreePrompt(turn?.prompt) || typeof turn?.summary !== 'string' ||
        !turn.summary.trim() || turn.summary.length > freeSourceLimits.summary) throw new Error('Invalid free game conversation');
    return {prompt: turn.prompt, summary: turn.summary};
  });
  return {...source, revision: raw.revision, turns};
}

function summary(id, saved) {
  return {id, title: saved.current.title, updatedAt: saved.updatedAt, canRestore: saved.previous !== null};
}

function view(id, saved) {
  return {...summary(id, saved), code: saved.current.code, turns: saved.current.turns};
}

function createFreeGameStore(root, now = Date.now) {
  let pending = null;
  let writeTask = null;

  async function openDirectory() {
    await fs.mkdir(root, {recursive: true});
    const entry = await fs.lstat(root);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Invalid free games directory');
    return fs.realpath(root);
  }

  async function read(id, directory) {
    if (!validFreeId(id)) throw new Error('Invalid free game identifier');
    const folder = directory ?? await openDirectory();
    const file = path.join(folder, id + '.json');
    const entry = await fs.lstat(file);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > maxProjectBytes || await fs.realpath(file) !== file) {
      throw new Error('Invalid free game file');
    }
    const handle = await fs.open(file, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxProjectBytes || stat.ino !== entry.ino || stat.dev !== entry.dev) {
        throw new Error('Free game file changed while reading');
      }
      const bytes = Buffer.alloc(stat.size + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const {bytesRead} = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== stat.size) throw new Error('Free game file contents changed while reading');
      const raw = JSON.parse(bytes.toString('utf8', 0, offset));
      if (raw?.format !== 1 || !Number.isSafeInteger(raw.updatedAt)) throw new Error('Invalid free game manifest');
      return {updatedAt: raw.updatedAt, current: readVersion(raw.current), previous: raw.previous === null ? null : readVersion(raw.previous)};
    } finally {
      await handle.close();
    }
  }

  async function write(id, saved) {
    const directory = await openDirectory();
    const temp = path.join(directory, randomUUID() + '.tmp');
    const file = path.join(directory, id + '.json');
    const data = JSON.stringify({format: 1, ...saved}) + '\n';
    if (Buffer.byteLength(data) > maxProjectBytes) throw new Error('Free game exceeds storage limit');
    const handle = await fs.open(temp, 'wx');
    try {
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temp, file);
    } finally {
      await fs.rm(temp, {force: true});
    }
  }

  async function list() {
    const directory = await openDirectory();
    const games = [];
    const files = await fs.readdir(directory, {withFileTypes: true});
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const id = entry.name.slice(0, -5);
      if (!validFreeId(id)) continue;
      try {
        games.push(summary(id, await read(id, directory)));
      } catch {
        // A missing, unreadable, or invalid project does not hide the other projects.
      }
    }
    return games.sort((first, second) => second.updatedAt - first.updatedAt);
  }

  async function load(id) {
    if (!validFreeId(id)) return error('invalid-request');
    try {
      return done(view(id, await read(id)));
    } catch (cause) {
      return error(cause?.code === 'ENOENT' ? 'not-found' : 'storage-error');
    }
  }

  function stage({source, prompt, projectId, baseRevision}) {
    const config = validateFreeSource(source);
    if (!config || !validFreePrompt(prompt)) return null;
    const token = randomUUID();
    pending = {token, config, prompt: prompt.trim(), projectId, baseRevision, expires: now() + candidateLifetime};
    return {token, ...config};
  }

  function discard(token) {
    if (!pending || pending.token !== token) return false;
    pending = null;
    return true;
  }

  function takeFailedDraft({token, prompt, projectId, baseRevision}) {
    const item = pending;
    if (!item || item.token !== token || item.expires <= now() || item.prompt !== prompt ||
        item.projectId !== projectId || item.baseRevision !== baseRevision) return null;
    pending = null;
    return item.config;
  }

  async function mutate(operation) {
    if (writeTask) return error('busy');
    writeTask = Promise.resolve().then(operation);
    try {
      return await writeTask;
    } catch (cause) {
      return error(cause?.code === 'ENOENT' ? 'not-found' : 'storage-error');
    } finally {
      writeTask = null;
    }
  }

  function commit(token) {
    if (!validFreeId(token)) return Promise.resolve(error('invalid-request'));
    return mutate(async () => {
      const item = pending;
      if (!item || item.token !== token) return error('expired');
      pending = null;
      if (item.expires <= now()) return error('expired');
      const id = item.projectId ?? randomUUID();
      const previous = item.projectId ? (await read(id)).current : null;
      if (previous && previous.revision !== item.baseRevision) return error('conflict');
      const turns = [...(previous?.turns ?? []), {prompt: item.prompt, summary: item.config.summary}];
      if (turns.length > maxTurns) turns.splice(1, turns.length - maxTurns);
      const current = {...item.config, revision: randomUUID(), turns};
      const saved = {updatedAt: now(), current, previous};
      await write(id, saved);
      return done(view(id, saved));
    });
  }

  function restore(id) {
    if (!validFreeId(id)) return Promise.resolve(error('invalid-request'));
    return mutate(async () => {
      const saved = await read(id);
      if (!saved.previous) return error('not-found');
      const restored = {updatedAt: now(), current: saved.previous, previous: null};
      await write(id, restored);
      return done(view(id, restored));
    });
  }

  return {
    list, load, read, stage, commit, discard, restore, takeFailedDraft,
    clearCandidate() { pending = null; },
    async waitForWrites() { await writeTask; },
  };
}

module.exports = {createFreeGameStore, validFreeId, validFreePrompt};
