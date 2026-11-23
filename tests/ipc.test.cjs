const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { randomUUID } = require('node:crypto');
const { registerHubIpc } = require('../src/main/hub-ipc.cjs');

test('preload exposes only the intended methods and forwards AI data without the Electron event', async () => {
  const renderer = new EventEmitter();
  const invokes = [];
  renderer.invoke = async (...args) => { invokes.push(args); };
  let api;
  const contextBridge = {
    exposeInMainWorld(name, value) {
      assert.equal(name, 'hub');
      api = value;
    },
  };
  runInNewContext(readFileSync(require.resolve('../src/preload/preload.cjs'), 'utf8'), {
    require(name) {
      assert.equal(name, 'electron');
      return {contextBridge, ipcRenderer: renderer};
    },
  });

  assert.deepEqual(Object.keys(api), [
    'getAppInfo', 'openSetupResource', 'getAiEnvironment', 'startAiChat', 'installAiModel', 'cancelAiOperation',
    'listGames', 'createGame', 'extractGameIdea', 'createConfiguredGame', 'updateGame', 'restoreGame', 'playGame', 'stopGame',
    'listFreeProjects', 'loadFreeProject', 'generateFreeGame', 'commitFreeGame', 'discardFreeGame', 'restoreFreeGame', 'exportFreeGame', 'onAiEvent',
  ]);
  assert.ok(Object.isFrozen(api));
  await api.getAppInfo();
  await api.openSetupResource('godot');
  await api.getAiEnvironment();
  await api.startAiChat({id: 'chat'});
  await api.installAiModel({id: 'pull'});
  await api.cancelAiOperation('chat');
  await api.listGames();
  await api.createGame({mode:'2d',prompt:'three stars'});
  await api.extractGameIdea({id:'idea',mode:'2d',messages:[],model:'model'});
  await api.createConfiguredGame({mode:'2d',config:{}});
  await api.updateGame({id:'game',prompt:'four stars'});
  await api.restoreGame('game');
  await api.playGame('game');
  await api.stopGame();
  await api.listFreeProjects();
  await api.loadFreeProject('project');
  await api.generateFreeGame({id:'job',prompt:'Fix the maze',projectId:'project'});
  await api.commitFreeGame('candidate');
  await api.discardFreeGame('candidate');
  await api.restoreFreeGame('project');
  await api.exportFreeGame('project');
  assert.deepEqual(invokes.map(([channel]) => channel), [
    'hub:getAppInfo', 'hub:setup:open', 'hub:ai:getEnvironment', 'hub:ai:chat', 'hub:ai:pull', 'hub:ai:cancel',
    'hub:games:list', 'hub:games:create', 'hub:games:extractIdea', 'hub:games:createConfigured', 'hub:games:update', 'hub:games:restore', 'hub:games:play', 'hub:games:stop',
    'hub:free:list', 'hub:free:load', 'hub:free:generate', 'hub:free:commit', 'hub:free:discard', 'hub:free:restore', 'hub:free:export-html',
  ]);
  const received = [];
  const unsubscribe = api.onAiEvent((...data) => received.push(data));
  const payload = {type: 'chatDelta', id: 'chat', text: 'hello'};
  renderer.emit('hub:ai:event', {sender: 'private'}, payload);
  unsubscribe();
  renderer.emit('hub:ai:event', {sender: 'private'}, payload);
  assert.deepEqual(received, [[payload]]);
});

test('IPC accepts the matching top frame and disposes the previous AI service on document reload', async () => {
  const url = 'file:///fixture/dist/index.html';
  const events = [];
  const registered = new Map();
  const ipcMain = {handle: (channel, fn) => registered.set(channel, fn), removeHandler: (channel) => registered.delete(channel)};
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    mainFrame: {url, send: (...data) => events.push(data)},
  });
  const services = [];
  const planned = [];
  const created = [];
  const config = {title: 'A forest game', stars: 3, difficulty: 'normal', theme: 'forest', mobility: 'swift'};
  const createService = () => {
    const item = {
      disposeCount: 0,
      emit: null,
      getEnvironment: () => ({runtime: 'ready'}),
      chat(_request, emit) {
        item.emit = emit;
        return {status: 'done'};
      },
      planGame(request) {
        planned.push(request);
        return {status: 'done', config};
      },
      dispose: () => { item.disposeCount += 1; },
    };
    services.push(item);
    return item;
  };
  registerHubIpc(ipcMain, contents, url, 'fixture', createService, {
    async stop() {},
    async dispose() {},
    async create(request) { created.push(request); return {status: 'done'}; },
  });
  const event = {sender: contents, senderFrame: contents.mainFrame};
  const getInfo = registered.get('hub:getAppInfo');
  assert.deepEqual(await getInfo(event), {version: 'fixture', phase: 3, internalOnly: true});
  const chat = registered.get('hub:ai:chat');
  assert.throws(() => chat({...event, sender: {}}), /Untrusted IPC sender/);
  assert.throws(() => chat({...event, senderFrame: {url}}), /Untrusted IPC sender/);
  contents.mainFrame.url = 'file:///fixture/elsewhere.html';
  assert.throws(() => chat(event), /Untrusted IPC sender/);
  contents.mainFrame.url = url;

  const extract = registered.get('hub:games:extractIdea');
  const save = registered.get('hub:games:createConfigured');
  assert.throws(() => extract({...event, senderFrame: {url}}, {}), /Untrusted IPC sender/);
  assert.throws(() => save({...event, senderFrame: {url}}, {}), /Untrusted IPC sender/);
  assert.deepEqual(await extract(event, {id: 'idea', mode: '2d'}), {status: 'error', code: 'invalid-request'});
  const messages = [{role: 'user', content: 'A forest game'}, {role: 'assistant', content: 'Three stars'}];
  assert.deepEqual(await extract(event, {id: 'idea', mode: '2d', messages, model:'model'}), {status: 'done', config});
  assert.deepEqual(planned, [{id:'idea', mode:'2d', conversation:messages, model:'model'}]);
  assert.equal(created.length, 0);
  assert.deepEqual(await save(event, {mode: '2d', config: {...config, theme: 'arbitrary'}}), {status:'error', code:'invalid-request'});
  assert.deepEqual(await save(event, {mode: '3d', config}), {status:'done'});
  assert.deepEqual(created, [{mode:'3d', config}]);

  const data = {type: 'chatDelta', id: 'a', text: 'chunk'};
  assert.deepEqual(await chat(event, {id: 'a'}), {status: 'done'});
  services[0].emit(data);
  assert.deepEqual(events, [['hub:ai:event', data]]);
  contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: true});
  assert.equal(services.length, 1);
  contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
  assert.equal(services[0].disposeCount, 1);
  assert.equal(services.length, 2);
  services[0].emit(data);
  assert.equal(events.length, 1);
  contents.emit('destroyed');
  assert.equal(services[1].disposeCount, 1);
  assert.equal(registered.size, 0);
});

test('only full renderer navigation and crashes stop existing previews', () => {
  const registered = new Map();
  const ipcMain = {handle: (name, callback) => registered.set(name, callback),
    removeHandler: name => registered.delete(name)};
  const contents = new EventEmitter();
  let stops = 0;
  let disposals = 0;
  const games = {stop() { stops += 1; return Promise.resolve(); },
    dispose() { disposals += 1; return Promise.resolve(); }};
  registerHubIpc(ipcMain, contents, 'file:///preview.html', 'fixture', () => ({dispose() {}}), games);

  contents.emit('did-start-navigation', {isMainFrame: false, isSameDocument: false});
  contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: true});
  assert.equal(stops, 0);
  contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
  contents.emit('render-process-gone');
  assert.equal(stops, 2);
  contents.emit('destroyed');
  assert.equal(disposals, 1);
  assert.equal(registered.size, 0);
});

test('free generation accepts only the main document, supports cancellation, and stages successful code for preview', async () => {
  const url = 'file:///fixture/index.html';
  const registered = new Map();
  const ipc = {handle: (channel, handler) => registered.set(channel, handler), removeHandler: key => registered.delete(key)};
  const contents = Object.assign(new EventEmitter(), {isDestroyed: () => false, mainFrame: {url}});
  const config = {title:'Ice Pond', summary:'Glide to the far bank.', code:'function createGame() {}'};
  const job = {id: randomUUID(), prompt: '  Glide across a frozen pond.  '};
  const staged = [];
  let finish;
  let finished = false;
  let cancelCount = 0;
  let cleared = 0;
  const service = {
    dispose() {},
    cancel() { cancelCount += 1; return true; },
    buildFreeGame({prompt}) {
      assert.equal(prompt, job.prompt.trim());
      return finished ? {status:'done', config} : new Promise(resolve => { finish = resolve; });
    },
  };
  registerHubIpc(ipc, contents, url, 'test', () => service, undefined, undefined, {
    stage(item) { staged.push(item); return {...item.source, token:'candidate-token'}; },
    clearCandidate() { cleared += 1; },
  });
  const generate = registered.get('hub:free:generate');
  const event = {sender:contents, senderFrame:contents.mainFrame};
  assert.throws(() => generate({...event, senderFrame:{url}}, job), /Untrusted IPC sender/);
  assert.deepEqual(await generate(event, {...job, projectId:'../invalid'}), {status:'error', code:'invalid-request'});
  const pending = generate(event, job);
  assert.deepEqual(await generate(event, job), {status:'error', code:'busy'});
  assert.equal(await registered.get('hub:ai:cancel')(event, job.id), true);
  finish({status:'done', config});
  assert.deepEqual(await pending, {status:'cancelled'});
  assert.deepEqual(staged, []);
  assert.equal(cancelCount, 1);
  finished = true;
  assert.deepEqual(await generate(event, job), {status:'done', candidate:{...config, token:'candidate-token'}});
  assert.equal(staged.length, 1);
  contents.emit('did-start-navigation', {isMainFrame:true, isSameDocument:false});
  assert.equal(cleared, 1);
});
