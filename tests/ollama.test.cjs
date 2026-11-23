const test = require('node:test');
const assert = require('node:assert/strict');
const { createOllamaService } = require('../src/main/ollama.cjs');

const small = 'qwen2.5-coder:1.5b';
const large = 'qwen2.5-coder:7b';
const preferred = 'qwen3:8b';
const preferredDigest = '500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41';
const largeDigest = 'dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364';
const smallDigest = 'd7372fd828518a4d38b1eb196c673c31a85f2ed302b3d1e406c4c2d1b64a0668';
const GIB = 1024 ** 3;
const testHardware = {
  cpu: 'Windows test CPU', logicalCores: 12, ramBytes: 32 * GIB,
  vramBytes: 8 * GIB, freeDiskBytes: 60 * GIB, modelDirectory: 'C:\\test\\models',
};

function entry(model = large, digest = largeDigest) {
  return { name: model, model, digest, size: 100, details: { format: 'gguf' } };
}

const tags = (entries = [entry()]) => Response.json({ models: entries });
const show = () => Response.json({ details: { format: 'gguf' } });
const line = (record) => JSON.stringify(record) + '\n';
const delta = (content) => ({ message: { role: 'assistant', content }, done: false });
const end = { done: true };
const stream = (...records) => new Response(records.map(line).join(''));
const request = (messages = [{ role: 'user', content: '아이디어를 정리해 줘.' }], id = 'job1') => (
  { id, model: large, messages }
);
const error = (code) => ({ status: 'error', code });
const done = { status: 'done' };
const cancelled = { status: 'cancelled' };

function fixture(routes = {}, settings = {}) {
  const calls = [];
  const handlers = { '/api/tags': () => tags(), '/api/show': show, ...routes };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'http://127.0.0.1:11434');
    assert.equal(options.redirect, 'error');
    const route = handlers[parsed.pathname];
    if (!route) assert.fail('Unexpected Ollama endpoint: ' + parsed.pathname);
    const payload = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ pathname: parsed.pathname, method: options.method, payload });
    return route(options, payload);
  };
  const service = createOllamaService({
    fetchImpl,
    probeHardware: async () => testHardware,
    logFreeGame: () => {},
    ...settings,
  });
  return { service, calls };
}

test('environment uses hardware, verified local inventory, and one shared in-flight probe', async () => {
  let releaseList;
  const { service, calls } = fixture({
    '/api/tags': () => new Promise((resolve) => { releaseList = resolve; }),
  });
  const first = service.getEnvironment();
  assert.strictEqual(service.getEnvironment(), first);
  releaseList(tags([entry(), { ...entry('example:cloud'), remote_host: 'example.invalid' }]));
  const { runtime, hardware, models } = await first;
  assert.equal(runtime, 'ready');
  assert.equal(calls.length, 1);
  assert.equal(hardware.ramBytes, 32 * GIB);
  assert.deepEqual(models.map(({ id, installed, recommended }) => ({ id, installed, recommended })), [
    { id: small, installed: false, recommended: false },
    { id: large, installed: true, recommended: false },
    { id: preferred, installed: false, recommended: true },
  ]);
  assert.ok(models.every((model) => model.license === 'Apache-2.0' && !Object.hasOwn(model, 'digest')));
});

test('disconnected Ollama keeps hardware information and can be refreshed', async () => {
  let running = false;
  const { service } = fixture({
    '/api/tags': () => {
      if (!running) throw new Error('Ollama disconnected');
      return tags();
    },
  });
  const environment = await service.getEnvironment();
  assert.equal(environment.runtime, 'unavailable');
  assert.equal(environment.hardware.logicalCores, 12);
  assert.ok(environment.models.every((model) => model.installed === false));
  assert.deepEqual(await service.chat(request(), () => {}), error('unavailable'));
  running = true;
  assert.equal((await service.getEnvironment()).runtime, 'ready');
});

test('chat joins fragmented UTF-8, handles CRLF, and forwards text-only bounded requests', async () => {
  const good = '안녕하세요';
  const bytes = Buffer.from(JSON.stringify(delta(good)) + '\r\n' + JSON.stringify(end));
  const begin = bytes.indexOf(Buffer.from(good)) + 1;
  const { service, calls } = fixture({
    '/api/chat': () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, begin));
        controller.enqueue(bytes.subarray(begin, begin + 4));
        controller.enqueue(bytes.subarray(begin + 4));
        controller.close();
      },
    })),
  });
  const events = [];
  const messages = [{ role: 'user', content: 'hello', images: ['not passed'] }];
  assert.deepEqual(await service.chat(request(messages), (event) => events.push(event)), done);
  assert.deepEqual(events, [{ type: 'chatDelta', id: 'job1', text: good }]);
  assert.deepEqual(calls.at(-1), {
    pathname: '/api/chat',
    method: 'POST',
    payload: {
      model: large,
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
      options: { num_ctx: 4096, num_predict: 512 },
    },
  });
});

test('chat rejects unsupported model, empty/system history, and request limits before touching Ollama', async () => {
  const { service, calls } = fixture();
  const results = await Promise.all([
    service.chat(null, () => {}),
    service.chat(request([], 'bad/id'), () => {}),
    service.chat(request([{ role: 'system', content: 'x' }]), () => {}),
    service.chat(request([{ role: 'assistant', content: 'x' }]), () => {}),
    service.chat(request([{ role: 'user', content: 'x'.repeat(4_001) }]), () => {}),
    service.chat(request(Array.from({ length: 4 }, () => ({ role: 'user', content: 'x'.repeat(3_001) }))), () => {}),
    service.chat(request(Array.from({ length: 13 }, () => ({ role: 'user', content: 'x' }))), () => {}),
    service.chat({ ...request(), model: 'remote-model' }, () => {}),
  ]);
  assert.deepEqual(results.slice(0, -1), Array(7).fill(error('invalid-request')));
  assert.deepEqual(results.at(-1), error('invalid-model'));
  assert.deepEqual(calls, []);
});

test('chat disallows missing, renamed and remote models before any generation request', async () => {
  const missing = fixture({ '/api/tags': () => tags([]) });
  assert.deepEqual(await missing.service.chat(request(), () => {}), error('not-installed'));
  assert.deepEqual(missing.calls.map((call) => call.pathname), ['/api/tags']);

  const remapped = fixture({
    '/api/tags': () => tags([entry('registry.ollama.ai/library/' + large, 'different')]),
  });
  assert.deepEqual(await remapped.service.chat(request(), () => {}), error('model-conflict'));
  assert.deepEqual(remapped.calls.map((call) => call.pathname), ['/api/tags']);

  const remote = fixture({
    '/api/show': () => Response.json({ details: { format: 'gguf' }, remote_host: 'https://example.invalid' }),
  });
  assert.deepEqual(await remote.service.chat(request(), () => {}), error('model-conflict'));
  assert.deepEqual(remote.calls.map((call) => call.pathname), ['/api/tags', '/api/show']);
});

test('chat rejects failed, incomplete, malformed and oversize output', async () => {
  const outcomes = [
    [() => stream(delta('partial')), 'response-error'],
    [() => stream(end), 'response-error'],
    [() => stream({ error: 'upstream error' }), 'response-error'],
    [() => new Response('{bad json}\n'), 'response-error'],
    [() => new Response('x'.repeat(1024 * 1024 + 1)), 'response-limit'],
    [() => stream(delta('x'.repeat(12_001)), end), 'response-limit'],
    [() => new Response(null, { status: 302, headers: { Location: 'https://example.invalid/' } }), 'response-error'],
  ];
  for (const [handler, code] of outcomes) {
    const { service } = fixture({ '/api/chat': handler });
    assert.deepEqual(await service.chat(request(), () => {}), error(code));
  }
});

function hangingResponse(signal) {
  return new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error('abort did not occur')), 500);
    signal.addEventListener('abort', () => {
      clearTimeout(keepAlive);
      reject(signal.reason);
    }, { once: true });
  });
}

test('one job at a time, scoped cancellation, and retry after cancellation', async () => {
  let entered;
  let hang = true;
  const ready = new Promise((resolve) => { entered = resolve; });
  const { service } = fixture({
    '/api/chat': ({ signal }) => {
      if (!hang) return stream(delta('retry'), end);
      entered();
      return hangingResponse(signal);
    },
  });
  const first = service.chat(request(), () => {});
  await ready;
  assert.deepEqual(await service.pull({ id: 'other', model: small, consent: true }, () => {}), error('busy'));
  assert.equal(service.cancel('other'), false);
  assert.equal(service.cancel('job1'), true);
  assert.equal(service.cancel('job1'), false);
  assert.deepEqual(await first, cancelled);
  hang = false;
  assert.deepEqual(await service.chat(request(), () => {}), done);
});

test('timeout and service disposal produce separate terminal states', async () => {
  const unfinished = fixture({ '/api/chat': ({ signal }) => hangingResponse(signal) }, { timeouts: { chat: 20 } });
  assert.deepEqual(await unfinished.service.chat(request(), () => {}), error('timeout'));

  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const { service } = fixture({
    '/api/chat': ({ signal }) => {
      entered();
      return hangingResponse(signal);
    },
  });
  const pending = service.chat(request(), () => {});
  await ready;
  service.dispose();
  assert.deepEqual(await pending, cancelled);
  assert.deepEqual(await service.chat(request(), () => {}), cancelled);
});

test('pull requires consent and refuses to overwrite a same-name model', async () => {
  const changed = fixture({ '/api/tags': () => tags([entry(small, 'unexpected')]) });
  assert.deepEqual(await changed.service.pull({ id: 'pull1', model: small, consent: false }, () => {}), error('consent-required'));
  assert.deepEqual(changed.calls, []);
  assert.deepEqual(await changed.service.pull({ id: 'pull1', model: small, consent: true }, () => {}), error('model-conflict'));
  assert.deepEqual(changed.calls.map((call) => call.pathname), ['/api/tags']);

  const already = fixture();
  assert.deepEqual(await already.service.pull({ id: 'pull1', model: large, consent: true }, () => {}), done);
  assert.deepEqual(already.calls.map((call) => call.pathname), ['/api/tags']);
});

test('pull blocks if known available disk is below download size', async () => {
  const { service, calls } = fixture({
    '/api/tags': () => tags([]),
  }, {
    probeHardware: async () => ({ ...testHardware, freeDiskBytes: 100 }),
  });
  assert.deepEqual(await service.pull({ id: 'pull1', model: small, consent: true }, () => {}), error('insufficient-disk'));
  assert.deepEqual(calls.map((call) => call.pathname), ['/api/tags', '/api/tags']);
});

test('pull emits bounded progress and verifies installed digest after success', async () => {
  const layer = 'sha256:' + 'a'.repeat(64);
  let inInventory = false;
  const { service, calls } = fixture({
    '/api/tags': () => tags(inInventory ? [entry(small, smallDigest)] : []),
    '/api/pull': () => {
      inInventory = true;
      return stream(
        { status: 'pulling manifest' },
        { status: 'pulling layer', digest: layer, completed: 20, total: 100 },
        { status: 'pulling layer', digest: layer, completed: 10, total: 100 },
        { status: 'verifying sha256 digest' },
        { status: 'writing manifest' },
        { status: 'success' },
      );
    },
  });
  const events = [];
  assert.deepEqual(await service.pull({ id: 'pull1', model: small, consent: true }, (event) => events.push(event)), done);
  assert.deepEqual(calls.map((call) => call.pathname), ['/api/tags', '/api/tags', '/api/pull', '/api/tags']);
  assert.deepEqual(calls[2].payload, { model: small, stream: true });
  assert.deepEqual(events.map((event) => event.stage), ['preparing', 'downloading', 'downloading', 'verifying', 'finishing']);
  assert.deepEqual(events.filter((event) => event.stage === 'downloading').map((event) => event.completed), [20, 20]);
  assert.ok(events.every((event) => event.id === 'pull1'));
});

test('pull decline, cancellation, and success without the expected model never report installed', async () => {
  const absent = fixture({
    '/api/tags': () => tags([]),
    '/api/pull': () => stream({ status: 'success' }),
  });
  assert.deepEqual(await absent.service.pull({ id: 'pull1', model: small, consent: true }, () => {}), error('response-error'));

  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const { service } = fixture({
    '/api/tags': () => tags([]),
    '/api/pull': ({ signal }) => {
      entered();
      return hangingResponse(signal);
    },
  });
  const pending = service.pull({ id: 'pull1', model: small, consent: true }, () => {});
  await ready;
  assert.equal(service.cancel('pull1'), true);
  assert.deepEqual(await pending, cancelled);
});

test('pull rechecks inventory after hardware discovery without replacing a model', async () => {
  for (const [digest, expected] of [[smallDigest, done], ['custom', error('model-conflict')]]) {
    let records = [];
    const { service, calls } = fixture({
      '/api/tags': () => tags(records),
    }, {
      probeHardware: async () => {
        records = [entry(small, digest)];
        return testHardware;
      },
    });
    assert.deepEqual(await service.pull({ id: 'pull1', model: small, consent: true }, () => {}), expected);
    assert.deepEqual(calls.map((call) => call.pathname), ['/api/tags', '/api/tags']);
  }
});

test('cancelling a pull settles without waiting for a stuck hardware probe', { timeout: 1_000 }, async () => {
  let entered;
  const probing = new Promise((resolve) => { entered = resolve; });
  let completeProbe;
  const blocked = new Promise((resolve) => { completeProbe = resolve; });
  let hang = true;
  const { service, calls } = fixture({
    '/api/tags': () => tags([]),
    '/api/pull': () => stream({ error: 'fake upstream failure' }),
  }, {
    probeHardware: async () => {
      if (!hang) return testHardware;
      entered();
      return blocked;
    },
  });
  try {
    const pending = service.pull({ id: 'pull1', model: small, consent: true }, () => {});
    await probing;
    assert.equal(service.cancel('pull1'), true);
    assert.deepEqual(await pending, cancelled);
    assert.deepEqual(calls.map((call) => call.pathname), ['/api/tags']);

    hang = false;
    assert.deepEqual(await service.pull({ id: 'pull2', model: small, consent: true }, () => {}), error('response-error'));
    assert.deepEqual(calls.map((call) => call.pathname), ['/api/tags', '/api/tags', '/api/tags', '/api/pull']);
  } finally {
    completeProbe(testHardware);
  }
});


test('game planning sends a strict config schema to the approved local model and preserves edit context', async () => {
  const previous = {id: 'ignored', mode: '3d', title: '별 여행', stars: 3, difficulty: 'easy', theme: 'forest', mobility: 'swift'};
  const config = {title: '별 여행', stars: 4, difficulty: 'easy'};
  const {service, calls} = fixture({'/api/chat': () => Response.json({done:true,message:{content:JSON.stringify(config)}})});
  assert.deepEqual(await service.planGame({id:'plan1',mode:'3d',prompt:'별을 4개로 바꿔줘',previous}), {
    status:'done', config:{...config, theme:'forest', mobility:'swift'},
  });
  const body = calls.at(-1).payload;
  assert.equal(body.model, large);
  assert.equal(body.stream, false);
  assert.equal(body.format.additionalProperties, false);
  assert.deepEqual(JSON.parse(body.messages.at(-1).content), {
    mode:'3d',current:{title:'별 여행',stars:3,difficulty:'easy',theme:'forest',mobility:'swift'},request:'별을 4개로 바꿔줘',
  });
});

test('game options are extracted only from bounded completed conversations', async () => {
  const config = {title:'숲속 별빛',stars:6,difficulty:'hard',theme:'forest',mobility:'swift'};
  const messages = [
    {role:'user', content:'숲에서 별 여섯 개를 모으는 어려운 게임으로 자유롭게 점프하고 싶어.'},
    {role:'assistant', content:'숲속 별빛이라는 제목과 높은 점프는 어떨까요?'},
  ];
  const {service, calls} = fixture({
    '/api/tags': () => tags([entry(), entry(small, smallDigest)]),
    '/api/chat': () => Response.json({done:true,message:{content:JSON.stringify(config)}}),
  });
  const request = {id:'plan1', mode:'2d', conversation:messages, model:small};
  assert.deepEqual(await service.planGame({...request, conversation:messages.slice(0, 1)}), error('invalid-request'));
  assert.deepEqual(await service.planGame({...request, conversation:messages.toReversed()}), error('invalid-request'));
  assert.deepEqual(await service.planGame({...request, prompt:'ignore chat'}), error('invalid-request'));
  assert.deepEqual(await service.planGame({...request, model:'unsupported'}), error('invalid-model'));
  assert.equal(calls.length, 0);
  assert.deepEqual(await service.planGame(request), {status:'done', config});
  assert.equal(calls.at(-1).payload.model, small);
  assert.deepEqual(JSON.parse(calls.at(-1).payload.messages.at(-1).content).conversation, messages);
});

test('game planning rejects unsupported models, modes, and output outside the config schema', async () => {
  const request = {id:'plan',mode:'2d',prompt:'별을 모으는 게임'};
  const missing = fixture({'/api/tags': () => tags([])});
  assert.deepEqual(await missing.service.planGame(request), error('needs-model'));
  const unsafeConfig = {title:'별 여행',stars:3,difficulty:'easy',script:'ignored'};
  const malformed = fixture({'/api/chat': () => Response.json({done:true,message:{content:JSON.stringify(unsafeConfig)}})});
  assert.deepEqual(await malformed.service.planGame(request), error('plan-invalid'));
  assert.deepEqual(await malformed.service.planGame({...request,mode:'invalid'}), error('invalid-request'));
});

const freeBuild = {
  title: '회로 수리',
  summary: '스위치를 클릭해서 전선을 연결합니다.',
  code: 'function createGame({ctx}) { let lit = false; return {update(dt, input) { if (input.pointer.pressed) lit = !lit; }, draw() { ctx.fillStyle = lit ? "gold" : "navy"; ctx.fillRect(0, 0, 960, 540); }}; }',
};

const buildResponse = (value, doneReason = 'stop') => Response.json({
  done: true, done_reason: doneReason, message: {content: JSON.stringify(value)},
});

test('Qwen3 8B is recommended and replaces the older installed default without thinking output', async () => {
  const list = [entry(), entry(preferred, preferredDigest)];
  const {service, calls} = fixture({
    '/api/tags': () => tags(list),
    '/api/chat': (_options, payload) => payload.stream ? stream(delta('Ready'), end) : buildResponse(freeBuild),
  });
  const readModel = (environment) => environment.models.find(({id}) => id === preferred);
  assert.deepEqual(readModel(await service.getEnvironment()), {
    id: preferred, label: 'Qwen3 8B', downloadBytes: 5_225_388_164,
    license: 'Apache-2.0', installed: true, recommended: true,
  });

  const build = {id:'qwen-build', prompt:'Create an electric circuit puzzle.'};
  assert.deepEqual(await service.buildFreeGame(build), {status:'done', config:freeBuild});
  assert.equal(calls.at(-1).payload.model, preferred);
  assert.equal(calls.at(-1).payload.think, false);

  assert.deepEqual(await service.chat({...request(), model:preferred}, () => {}), done);
  assert.equal(calls.at(-1).payload.model, preferred);
  assert.equal(calls.at(-1).payload.think, false);

  // A model with an unexpected digest cannot replace a validated older model.
  list[1] = entry(preferred, 'unexpected-digest');
  assert.equal(readModel(await service.getEnvironment()).installed, false);
  assert.deepEqual(await service.buildFreeGame(build), {status:'done', config:freeBuild});
  assert.equal(calls.at(-1).payload.model, large);
  assert.equal(Object.hasOwn(calls.at(-1).payload, 'think'), false);
});

test('weaker PCs still recommend the lightweight model', async () => {
  const {service} = fixture({}, {
    probeHardware: async () => ({...testHardware, ramBytes: 8 * GIB, vramBytes: 4 * GIB}),
  });
  assert.equal((await service.getEnvironment()).models.find(({recommended}) => recommended).id, small);
});

test('short game requests send concrete genre defaults and retain the original prompt', async () => {
  const racingBuild = {...freeBuild, code:
    'function createGame({ctx}) { let laps = 0; const opponents = [{x:0}]; return {update(dt, input) { if (input.keys.includes("KeyW")) laps++; }, draw() { ctx.fillRect(laps, 0, 30, 30); }}; }'};
  for (const [id, prompt, genre, check, modelOutput] of [
    ['genre-race', '레이싱 게임 만들어줘', 'racing', /ordered checkpoints/, racingBuild],
    ['genre-pickup', '별 수집 게임 만들어줘', 'collection', /overlap/, freeBuild],
  ]) {
    const {service, calls} = fixture({'/api/chat': () => buildResponse(modelOutput)});
    assert.equal((await service.buildFreeGame({id, prompt})).status, 'done');
    const payload = calls.at(-1).payload;
    assert.match(payload.messages[0].content, /Explicit user instructions take precedence/);
    const context = JSON.parse(payload.messages[1].content);
    assert.equal(context.request, prompt);
    assert.equal(context.genreBrief.genre, genre);
    assert.match(context.genreBrief.goals.join(' '), check);
    assert.equal(calls.filter(call => call.pathname === '/api/chat').length, 1);
  }
});

test('genre suggestions are logged and retried without discarding a valid game', async () => {
  const noCars = {...freeBuild, code: freeBuild.code
    .replace('let lit = false;', 'let lit = false; let laps = 0; const opponents = [];')
    .replace('lit = !lit;', '{ lit = !lit; laps++; }')};
  let generation = 0;
  const notices = [];
  const {service, calls} = fixture({
    '/api/chat': () => buildResponse(generation++ === 0 ? noCars : {...freeBuild, code: 'incomplete'}),
  }, {logFreeGame: line => notices.push(line)});
  assert.deepEqual(await service.buildFreeGame({id:'advisory-race', prompt:'레이싱 게임 만들어줘'}), {
    status:'done', config:noCars,
  });
  assert.match(calls.at(-1).payload.messages[0].content, /Start with at least one rival/);
  assert.match(notices[0], /Genre suggestion/);
});

test('free-form generation recovers fenced code and can retry invalid JSON without a response schema', async () => {
  const content = 'Here is your game.\n```javascript\n' + freeBuild.code + '\n```';
  const raw = JSON.stringify({done:true, done_reason:'stop', message:{content:'{broken'}});
  let attempts = 0;
  const logs = [];
  const {service, calls} = fixture({
    '/api/chat': () => ++attempts === 1 ? new Response(raw) : Response.json({done:true,message:{content}}),
  }, {logFreeGame: line => logs.push(JSON.parse(line.slice(line.indexOf('{'))))});
  assert.deepEqual(await service.buildFreeGame({id:'raw-fallback', prompt:'새 게임 만들어줘'}), {
    status:'done', config:{title:'새 게임', summary:'미리보기에서 조작과 목표를 확인하세요.', code:freeBuild.code},
  });
  assert.equal(calls.at(-1).payload.format, undefined);
  assert.match(calls.at(-1).payload.messages[0].content, /Output only the complete JavaScript function/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].attempt, 1);
  assert.equal(logs[0].rawResponse, raw);
  assert.match(logs[0].reason, /complete JavaScript/);
});

test('free-form failure diagnostics include a non-success HTTP response and status', async () => {
  const raw = '{"error":"model request failed"}';
  const logs = [];
  const {service} = fixture({'/api/chat': () => new Response(raw,{status:503})},
    {logFreeGame: line => logs.push(JSON.parse(line.slice(line.indexOf('{'))))});
  assert.deepEqual(await service.buildFreeGame({id:'http-failure', prompt:'Make a game.'}), error('response-error'));
  assert.equal(logs[0].reason, 'response-error');
  assert.equal(logs[0].httpStatus, 503);
  assert.equal(logs[0].rawResponse, raw);
});

test('free-form game generation uses verified local Ollama and includes the prior source for revisions', async () => {
  const {service, calls} = fixture({'/api/chat': () => buildResponse(freeBuild)});
  const {title, summary, code} = freeBuild;
  const request = {
    id: 'free1',
    prompt: '회로를 돌려 전기를 연결하면 이기는 퍼즐을 만들어줘.',
  };
  assert.deepEqual(await service.buildFreeGame(request), {status: 'done', config: freeBuild});
  assert.deepEqual(calls.map(call => call.pathname), ['/api/tags', '/api/show', '/api/chat']);
  const build = calls.at(-1).payload;
  assert.equal(build.model, large);
  assert.equal(build.format.additionalProperties, false);
  assert.deepEqual(build.format.required, ['title', 'summary', 'code']);
  assert.equal(build.stream, false);
  assert.deepEqual(JSON.parse(build.messages[1].content), {request: request.prompt, previous: null});

  const turns = Array.from({length: 6}, (_, i) => ({prompt: 'edit ' + i + 'x'.repeat(550), summary: 'x'.repeat(240)}));
  const previous = {...freeBuild, turns, projectId: 'local metadata'};
  const edit = {...request, id: 'free2', prompt: '성공 메시지를 추가해.', previous};
  const revised = {...freeBuild, code: code.replace('ctx.fillRect(0, 0, 960, 540);', 'ctx.fillRect(0, 0, 960, 540); if (lit) ctx.fillText("성공!", 20, 20);')};
  const revision = fixture({'/api/chat': () => buildResponse(revised)});
  assert.deepEqual(await revision.service.buildFreeGame(edit), {status: 'done', config: revised});
  assert.deepEqual(JSON.parse(revision.calls.at(-1).payload.messages[1].content), {
    request: edit.prompt,
    previous: {
      title, summary, code,
      turns: [turns[0], ...turns.slice(-3)].map((turn, index) => ({
        prompt: index === 0 ? turn.prompt : turn.prompt.slice(0, 500),
        summary: turn.summary.slice(0, 200),
      })),
    },
  });
});

test('free-form revisions retry unchanged code instead of saving an unchanged game with a new summary', async () => {
  const previous = {...freeBuild, code: freeBuild.code.replace('let lit', '\nlet lit')};
  const unchanged = {...previous, summary: '조작을 수정했습니다.', code: previous.code.replaceAll('\n', '\r\n')};
  const request = {id: 'revision', prompt: '조작을 하나 추가해.', previous};
  const retry = fixture({'/api/chat': () => buildResponse(unchanged)});
  assert.deepEqual(await retry.service.buildFreeGame(request), error('build-unchanged'));
  const calls = retry.calls.filter(call => call.pathname === '/api/chat');
  assert.equal(calls.length, 2);
  assert.match(calls[1].payload.messages[0].content, /game code is unchanged/);
  assert.equal(calls[0].payload.messages[1].content, calls[1].payload.messages[1].content);
  assert.equal(JSON.parse(calls[1].payload.messages[1].content).previous.code, previous.code);

  const renamed = {...previous, title: '새 회로'};
  const rename = fixture({'/api/chat': () => buildResponse(renamed)});
  assert.deepEqual(await rename.service.buildFreeGame({...request, prompt: '제목을 새 회로로 바꿔줘.'}),
    {status: 'done', config: renamed});
});

test('free game complaints use a repair plan and can rewrite rather than copying broken source', async () => {
  const previous = {...freeBuild, turns: [{prompt:'전등을 클릭으로 켜고 끄기', summary:freeBuild.summary}]};
  const request = {id: 'repair-plan', prompt: '전등이 안 켜지고 완료 문구도 없어.', previous};
  const plan = {approach:'rewrite', changes:['클릭 시 전등이 켜지게 함', '전등이 켜지면 완료 문구 표시']};
  const revised = {...freeBuild, code: freeBuild.code.replace('ctx.fillRect(0, 0, 960, 540);', 'ctx.fillRect(0, 0, 960, 540); if (lit) ctx.fillText("완료", 20, 20);')};
  const {service, calls} = fixture({
    '/api/chat': (_options, payload) => buildResponse(payload.format.required.includes('approach') ? plan : revised),
  });
  assert.deepEqual(await service.buildFreeGame(request), {status:'done', config:revised});
  const [review, build] = calls.filter(call => call.pathname === '/api/chat');
  assert.equal(JSON.parse(review.payload.messages[1].content).previous.code, previous.code);
  assert.deepEqual(JSON.parse(build.payload.messages[1].content), {
    request:request.prompt,
    previous:{title:previous.title, summary:previous.summary, turns:previous.turns},
    repairPlan:plan,
  });

  const fallback = fixture({'/api/chat': () => buildResponse(revised)});
  assert.deepEqual(await fallback.service.buildFreeGame(request), {status:'done', config:revised});
  assert.deepEqual(JSON.parse(fallback.calls.at(-1).payload.messages[1].content), {request:request.prompt, previous});

  let builds = 0;
  const repeated = fixture({'/api/chat': (_options, payload) => {
    if (payload.format.required.includes('approach')) return buildResponse(plan);
    return buildResponse(++builds === 1 ? freeBuild : revised);
  }});
  assert.deepEqual(await repeated.service.buildFreeGame(request), {status:'done', config:revised});
  const retry = repeated.calls.at(-1).payload.messages;
  assert.match(retry[0].content, /Rebuild the complete game/);
  assert.deepEqual(JSON.parse(retry[1].content), JSON.parse(build.payload.messages[1].content));
});

test('free-form generation retries unsupported keyboard input with physical key guidance', async () => {
  const corrected = {...freeBuild, code: freeBuild.code.replace('input.pointer.pressed', "input.pressed.includes('Space')")};
  for (const [wrongControl, messagePattern] of [
    ["input.keys.includes(' ')", /Do not use literal letters or spaces/],
    ["input.pressed['Space']", /arrays of physical key codes/],
    ['input.keys.Space', /arrays of physical key codes/],
  ]) {
    const wrongKey = {...freeBuild, code: freeBuild.code.replace('input.pointer.pressed', wrongControl)};
    let attempts = 0;
    const {service, calls} = fixture({'/api/chat': () => buildResponse(++attempts === 1 ? wrongKey : corrected)});
    assert.deepEqual(await service.buildFreeGame({id: 'key-repair', prompt: '스페이스바로 전등을 켜줘.'}), {
      status: 'done', config: corrected,
    });
    assert.equal(attempts, 2);
    assert.match(calls.at(-1).payload.messages[0].content, messagePattern);
  }
});

test('free-form runtime repair passes the failed draft with prior requirements and rejects resubmitting its code', async () => {
  const previous = {...freeBuild, turns:[{prompt:'클릭으로 전등을 켜줘.', summary:freeBuild.summary}]};
  const bad = {...freeBuild, code: freeBuild.code.replace('let lit = false;', 'let lit = missingState;')};
  const request = {id: 'startup-repair', prompt: '전등에 리셋을 추가해.', previous, failed: {source:bad, issue:'startup-error'}};
  const repaired = {...freeBuild, code: freeBuild.code.replace('if (input.pointer.pressed)', 'if (input.pressed.includes("KeyR")) lit = false; if (input.pointer.pressed)')};
  const {service, calls} = fixture({'/api/chat': () => buildResponse(repaired)});
  assert.deepEqual(await service.buildFreeGame({...request, failed:{source:bad, issue:'unrecognized'}}), error('invalid-request'));
  assert.equal(calls.length, 0);
  assert.deepEqual(await service.buildFreeGame(request), {status:'done', config:repaired});
  const messages = calls.at(-1).payload.messages;
  assert.match(messages[0].content, /did not start in the isolated preview/);
  assert.deepEqual(JSON.parse(messages[1].content), {
    request: request.prompt,
    previous: {title:previous.title, summary:previous.summary, turns:previous.turns},
    failedDraft: bad,
  });
  const unchanged = fixture({'/api/chat': () => buildResponse({...bad, title:'새 이름'})});
  assert.deepEqual(await unchanged.service.buildFreeGame(request), error('build-unchanged'));
  const [first, second] = unchanged.calls.filter(call => call.pathname === '/api/chat');
  const context = JSON.parse(first.payload.messages[1].content);
  assert.deepEqual(JSON.parse(second.payload.messages[1].content), {
    request: request.prompt,
    previous: {title:previous.title, summary:previous.summary, turns:previous.turns},
  });
  assert.deepEqual(context.failedDraft, bad);
  assert.match(second.payload.messages[0].content, /Rebuild the complete game/);
});

test('retrying an unchanged first game rebuilds from the original rules without the failed source', async () => {
  const failed = {...freeBuild, code: freeBuild.code.replace('let lit = false;', 'let lit = missingState;')};
  const request = {id:'first-game-rebuild', prompt:'레이싱 게임 만들어줘', failed:{source:failed, issue:'startup-error'}};
  let attempts = 0;
  const {service, calls} = fixture({'/api/chat': () => buildResponse(++attempts === 1 ? failed : freeBuild)});
  assert.deepEqual(await service.buildFreeGame(request), {status:'done', config:freeBuild});
  const [first, second] = calls.filter(call => call.pathname === '/api/chat').map(call => call.payload);
  const initialContext = JSON.parse(first.messages[1].content);
  assert.equal(initialContext.genreBrief.genre, 'racing');
  assert.deepEqual(initialContext.failedDraft, failed);
  assert.deepEqual(JSON.parse(second.messages[1].content), {
    request: request.prompt, previous:null, genreBrief:initialContext.genreBrief,
  });
  assert.match(second.messages[0].content, /Rebuild the complete game from the user rules/);
  assert.doesNotMatch(second.messages[0].content, /failedDraft/);
});

test('free-form generation retries incomplete source once and rejects invalid output or untrusted models', async () => {
  const request = {id: 'build', prompt: 'Make a new game.'};
  let attempts = 0;
  const repaired = fixture({
    '/api/chat': () => ++attempts === 1
      ? buildResponse({...freeBuild, code: 'function createGame() {'})
      : buildResponse(freeBuild),
  });
  assert.deepEqual(await repaired.service.buildFreeGame(request), {status: 'done', config: freeBuild});
  assert.equal(attempts, 2);

  const invalidSource = [
    {...freeBuild, code: 'not a game'},
    {...freeBuild, code: 'function createGame() {} ' + ' '.repeat(24_000)},
    {...freeBuild, code: 'function createGame() { return {update() {}, draw() {}}; }'},
    {...freeBuild, code: freeBuild.code.replace('lit = !lit', 'alert("Win!")')},
    {...freeBuild, title: 'long '.repeat(20)},
    {...freeBuild, extra: 'unrecognized'},
  ];
  for (const value of invalidSource) {
    const result = fixture({'/api/chat': () => buildResponse(value)});
    assert.deepEqual(await result.service.buildFreeGame(request), error('build-invalid'));
  }
  const truncated = fixture({'/api/chat': () => buildResponse(freeBuild, 'length')});
  assert.deepEqual(await truncated.service.buildFreeGame(request), error('build-invalid'));
  const unavailable = fixture({'/api/tags': () => tags([entry(large, 'renamed')])});
  assert.deepEqual(await unavailable.service.buildFreeGame(request), error('needs-model'));
  assert.deepEqual(unavailable.calls.map(call => call.pathname), ['/api/tags']);
  assert.deepEqual(await unavailable.service.buildFreeGame({...request, prompt: 'x'.repeat(2001)}), error('invalid-request'));
  assert.deepEqual(await unavailable.service.buildFreeGame({...request, previous: {}}), error('invalid-request'));
});

test('free-form generation can be cancelled and shares the local model job limit', async () => {
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const {service, calls} = fixture({
    '/api/chat': options => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), {once: true});
      ready();
    }),
  });
  const job = service.buildFreeGame({id: 'free1', prompt: 'Make a short matching game.'});
  await started;
  assert.deepEqual(await service.chat(request(), () => {}), error('busy'));
  assert.equal(service.cancel('different'), false);
  assert.equal(service.cancel('free1'), true);
  assert.deepEqual(await job, cancelled);
  assert.equal(calls.filter(call => call.pathname === '/api/chat').length, 1);
});
