const {randomUUID} = require('node:crypto');
const {createOllamaService} = require('./ollama.cjs');
const {validateGameConfig} = require('./games.cjs');
const {validFreeId, validFreePrompt} = require('./free-games.cjs');

function registerHubIpc(ipcMain, contents, rendererUrl, version, createService = createOllamaService, games, openSetupResource, freeGames, saveFreeGameHtml) {
  let service = createService();
  let buildingFreeGame = null;
  let exportingFreeGame = false;

  const resetService = () => {
    service.dispose();
    service = createService();
    buildingFreeGame = null;
    freeGames?.clearCandidate();
    if (games) void Promise.resolve(games.stop()).catch(() => {});
  };

  const runOperation = (kind, request) => {
    const current = service;
    return current[kind](request, (data) => {
      if (current !== service || contents.isDestroyed()) return;
      const frame = contents.mainFrame;
      if (frame?.url === rendererUrl) frame.send('hub:ai:event', data);
    });
  };

  const fail = (code) => ({status: 'error', code});
  let gameMutation = false;

  async function mutateGame(operation) {
    if (!games) return fail('storage-error');
    if (gameMutation) return fail('busy');
    gameMutation = true;
    try {
      return await operation();
    } catch {
      return fail('storage-error');
    } finally {
      gameMutation = false;
    }
  }

  async function planAndSave(request, editing) {
    const {mode, prompt, id} = request ?? {};
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1_000 ||
        (editing ? typeof id !== 'string' || id.length > 64 : !['2d', '3d'].includes(mode))) {
      return fail('invalid-request');
    }
    return mutateGame(async () => {
      const current = service;
      const library = await games.list();
      if (!library.engineReady) return fail('engine-unavailable');
      const previous = editing ? library.games.find(game => game.id === id) : undefined;
      if (editing && !previous) return fail('not-found');
      if (current !== service) return {status:'cancelled'};
      const result = await current.planGame({id: randomUUID(), mode: previous?.mode ?? mode, prompt, previous});
      if (current !== service) return {status:'cancelled'};
      if (result.status !== 'done') return result;
      return editing ? games.update({id, config: result.config}) : games.create({mode, config: result.config});
    });
  }

  async function extractGameIdea(request) {
    const {id, mode, messages, model} = request ?? {};
    if (!Array.isArray(messages)) return fail('invalid-request');
    const current = service;
    const result = await current.planGame({id, mode, conversation: messages, model});
    return current === service ? result : {status: 'cancelled'};
  }

  function createConfiguredGame(request) {
    const {mode, config} = request ?? {};
    if (!['2d', '3d'].includes(mode)) return fail('invalid-request');
    const validated = validateGameConfig(config);
    if (!validated) return fail('invalid-request');
    return mutateGame(() => games.create({mode, config: validated}));
  }

  async function generateFreeGame(request) {
    const {id, prompt, projectId, repairToken} = request ?? {};
    if (!validFreeId(id) || !validFreePrompt(prompt) || (projectId !== undefined && !validFreeId(projectId)) ||
        (repairToken !== undefined && !validFreeId(repairToken))) return fail('invalid-request');
    if (!freeGames) return fail('storage-error');
    if (buildingFreeGame) return fail('busy');
    const job = {id, cancelled: false};
    buildingFreeGame = job;
    const currentService = service;
    const inactive = () => job.cancelled || currentService !== service || contents.isDestroyed();
    try {
      const previous = projectId ? (await freeGames.read(projectId)).current : undefined;
      if (inactive()) return {status:'cancelled'};
      const requestText = prompt.trim();
      const failedSource = repairToken === undefined ? null
        : freeGames.takeFailedDraft({token: repairToken, prompt: requestText, projectId, baseRevision: previous?.revision});
      if (repairToken !== undefined && !failedSource) return fail('expired');
      const failed = failedSource ? {source: failedSource, issue: 'startup-error'} : undefined;
      const result = await currentService.buildFreeGame({id, prompt: requestText, previous, failed});
      if (inactive()) return {status:'cancelled'};
      if (result.status !== 'done') return result;
      const candidate = freeGames.stage({source: result.config, prompt, projectId, baseRevision: previous?.revision});
      return candidate ? {status:'done', candidate} : fail('build-invalid');
    } catch (cause) {
      if (inactive()) return {status:'cancelled'};
      return fail(cause?.code === 'ENOENT' ? 'not-found' : 'storage-error');
    } finally {
      if (buildingFreeGame === job) buildingFreeGame = null;
    }
  }

  function cancelAiOperation(id) {
    const job = buildingFreeGame;
    if (job && job.id === id) {
      job.cancelled = true;
      service.cancel(id);
      return true;
    }
    return service.cancel(id);
  }

  async function exportFreeGame(id) {
    if (!validFreeId(id)) return fail('invalid-request');
    if (!freeGames || !saveFreeGameHtml) return fail('storage-error');
    if (exportingFreeGame) return fail('busy');
    exportingFreeGame = true;
    try {
      const result = await freeGames.load(id);
      if (result.status !== 'done') return result;
      const {title, code, turns} = result.project;
      return await saveFreeGameHtml({title, code, summary: turns.at(-1).summary});
    } catch {
      return fail('storage-error');
    } finally {
      exportingFreeGame = false;
    }
  }

  const handlers = {
    'hub:getAppInfo': () => ({version, phase: 3, internalOnly: true}),
    'hub:setup:open': (kind) => openSetupResource?.(kind) ?? false,
    'hub:games:list': () => games?.list() ?? {games: [], engineReady: false, playingId: null, previewUrl: null},
    'hub:games:create': (request) => planAndSave(request, false),
    'hub:games:extractIdea': extractGameIdea,
    'hub:games:createConfigured': createConfiguredGame,
    'hub:games:update': (request) => planAndSave(request, true),
    'hub:games:restore': (id) => mutateGame(() => games.restore(id)),
    'hub:games:play': (id) => games?.play(id) ?? fail('engine-unavailable'),
    'hub:games:stop': () => games?.stop() ?? fail('engine-unavailable'),
    'hub:free:list': () => freeGames?.list() ?? [],
    'hub:free:load': (id) => freeGames?.load(id) ?? fail('storage-error'),
    'hub:free:generate': generateFreeGame,
    'hub:free:commit': (token) => freeGames?.commit(token) ?? fail('storage-error'),
    'hub:free:discard': (token) => freeGames?.discard(token) ?? false,
    'hub:free:restore': (id) => freeGames?.restore(id) ?? fail('storage-error'),
    'hub:free:export-html': exportFreeGame,
    'hub:ai:getEnvironment': async () => {
      const current = service;
      try {
        return await current.getEnvironment();
      } catch (error) {
        if (error?.name === 'AbortError' && (contents.isDestroyed() || current !== service)) return;
        throw error;
      }
    },
    'hub:ai:chat': (request) => runOperation('chat', request),
    'hub:ai:pull': (request) => runOperation('pull', request),
    'hub:ai:cancel': cancelAiOperation,
  };

  for (const [channel, invoke] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => {
      const frame = event.senderFrame;
      if (event.sender !== contents || !frame || frame !== contents.mainFrame || frame.url !== rendererUrl) {
        throw new Error('Untrusted IPC sender');
      }
      return invoke(...args);
    });
  }

  contents.on('did-start-navigation', (nav) => {
    if (nav.isMainFrame && !nav.isSameDocument) resetService();
  });
  contents.on('render-process-gone', resetService);
  contents.once('destroyed', () => {
    service.dispose();
    freeGames?.clearCandidate();
    if (games) void Promise.resolve(games.dispose()).catch(() => {});
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
  });
}

module.exports = { registerHubIpc };
