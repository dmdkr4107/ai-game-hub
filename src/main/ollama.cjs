const http = require('node:http');
const { inspectHardware } = require('./hardware.cjs');
const { validateGameConfig } = require('./games.cjs');
const { freeSourceLimits, validateFreeSource } = require('./free-source.cjs');
const { enhanceFreeGamePrompt, findMissingGenreLogic } = require('./free-game-prompt.cjs');
const { extractFreeGameReply } = require('./free-reply.cjs');

const baseUrl = 'http://127.0.0.1:11434';
const GIB = 1024 ** 3;
const KiB = 1024;
const defaultModelId = 'qwen3:8b';
const modelCatalog = [
  {
    id: 'qwen2.5-coder:1.5b',
    label: 'Qwen2.5-Coder 1.5B',
    downloadBytes: 986_062_089,
    license: 'Apache-2.0',
    digest: 'd7372fd828518a4d38b1eb196c673c31a85f2ed302b3d1e406c4c2d1b64a0668',
  },
  {
    id: 'qwen2.5-coder:7b',
    label: 'Qwen2.5-Coder 7B',
    downloadBytes: 4_683_087_561,
    license: 'Apache-2.0',
    digest: 'dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364',
  },
  {
    id: defaultModelId,
    label: 'Qwen3 8B',
    downloadBytes: 5_225_388_164,
    license: 'Apache-2.0',
    digest: '500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41',
  },
];

class ServiceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const invalid = () => ({ status: 'error', code: 'invalid-request' });
const failure = (code) => ({ status: 'error', code });

function localRequest(url, { method, headers, body, signal }) {
  return new Promise((resolve, reject) => {
    // An independent HTTP agent avoids system/ambient proxy configuration.
    const req = http.request(url, { method, headers, signal, agent: false }, (response) => {
      response.on('error', () => {});
      resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        body: response,
      });
    });
    req.once('error', reject);
    req.end(body);
  });
}

function discard(body) {
  if (typeof body?.destroy === 'function') body.destroy();
  else if (typeof body?.cancel === 'function') void body.cancel().catch(() => {});
}

async function* boundedText(body, signal, byteLimit) {
  if (!body) throw new ServiceError('response-error');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  for await (const chunk of body) {
    signal.throwIfAborted();
    bytes += chunk.byteLength;
    if (bytes > byteLimit) throw new ServiceError('response-limit');
    yield decoder.decode(chunk, { stream: true });
  }
  signal.throwIfAborted();
  yield decoder.decode();
}

async function readJson(body, signal) {
  let text = '';
  for await (const part of boundedText(body, signal, 512 * KiB)) text += part;
  return JSON.parse(text);
}

function parseRecord(line) {
  if (line.length > 96 * KiB) throw new ServiceError('response-limit');
  const record = JSON.parse(line);
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.error) {
    throw new ServiceError('response-error');
  }
  return record;
}

async function* readRecords(body, signal, byteLimit) {
  let pending = '';
  for await (const part of boundedText(body, signal, byteLimit)) {
    const lines = (pending + part).split('\n');
    pending = lines.pop();
    for (const line of lines) {
      signal.throwIfAborted();
      if (line.trim()) yield parseRecord(line);
    }
    if (pending.length > 96 * KiB) throw new ServiceError('response-limit');
  }
  if (pending.trim()) yield parseRecord(pending);
}

function sameModelName(name, model) {
  return name === model.id || name === 'library/' + model.id ||
    name === 'registry.ollama.ai/library/' + model.id || name === 'registry.ollama.com/library/' + model.id;
}

function modelStatus(entries, model) {
  const matches = entries.filter((entry) => entry && (
    sameModelName(entry.name, model) || sameModelName(entry.model, model)
  ));
  if (!matches.length) return 'missing';
  const valid = matches.every((entry) => (
    entry.digest === model.digest && entry.size > 0 && entry.details?.format === 'gguf' &&
    !entry.remote_host && !entry.remote_model
  ));
  return valid ? 'installed' : 'conflict';
}

function suggestedModel(hardware) {
  if (hardware.ramBytes >= 16 * GIB && hardware.vramBytes >= 7 * GIB) return defaultModelId;
  if (hardware.ramBytes >= 8 * GIB) return 'qwen2.5-coder:1.5b';
  return null;
}

function validatedMessages(messages, finalRole = 'user') {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 12) return null;
  const accepted = [];
  let total = 0;
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' ||
        !message.content.trim() || message.content.length > 4_000) return null;
    total += message.content.length;
    if (total > 12_000) return null;
    accepted.push({ role: message.role, content: message.content });
  }
  return accepted.at(-1).role === finalRole ? accepted : null;
}

function validateConversation(messages) {
  const accepted = validatedMessages(messages, 'assistant');
  if (!accepted || accepted.length % 2 !== 0) return null;
  const alternates = accepted.every((message, index) => message.role === (index % 2 === 0 ? 'user' : 'assistant'));
  return alternates ? accepted : null;
}

const gameSchema = {
  type: 'object',
  properties: {
    title: {type: 'string', minLength: 1, maxLength: 80},
    stars: {type: 'integer', minimum: 1, maximum: 8},
    difficulty: {type: 'string', enum: ['easy', 'normal', 'hard']},
    theme: {type: 'string', enum: ['night', 'forest', 'space']},
    mobility: {type: 'string', enum: ['steady', 'standard', 'swift']},
  },
  required: ['title', 'stars', 'difficulty', 'theme', 'mobility'],
  additionalProperties: false,
};

const freeGameSchema = {
  type: 'object',
  properties: {
    title: {type: 'string', minLength: 1, maxLength: freeSourceLimits.title},
    summary: {type: 'string', minLength: 1, maxLength: freeSourceLimits.summary},
    code: {type: 'string', minLength: 1, maxLength: freeSourceLimits.code},
  },
  required: ['title', 'summary', 'code'],
  additionalProperties: false,
};

const freeRepairPlanSchema = {
  type: 'object',
  properties: {
    approach: {type: 'string', enum: ['patch', 'rewrite']},
    changes: {type: 'array', minItems: 1, maxItems: 6, items: {type: 'string', maxLength: 200}},
  },
  required: ['approach', 'changes'],
  additionalProperties: false,
};

const freeRepairRequest = /\b(?:bug|broken|missing|unresponsive|fix|repair|not working|cannot|can['’]t|doesn['’]t work)\b|안\s*(?:되|돼|움직|먹|보)|못\s*(?:하|해|움직)|없(?:어|고|네|음)|작동하지|빠졌|오류|고장|버그|먹통|고쳐|똑같/iu;

const freeGameInstructions = [
  'Build one small original Canvas 2D game. Explicit user instructions take precedence over genreBrief defaults. On edits keep working rules and apply the latest request and repairPlan.',
  'Implement real controls, playable progress, and a visible goal and result. Prefer simple art and a complete game loop.',
  'Start code with function createGame({canvas,ctx,width,height}) and return {update(dt,input), draw()}. Keep state inside the function. Canvas is 960x540 and dt is seconds.',
  'Use input.keys.includes("KeyW") for held movement (KeyW/KeyA/KeyS/KeyD, ArrowLeft/ArrowRight/ArrowUp/ArrowDown, Space), input.pressed for new presses, or input.pointer {x,y,down,pressed}.',
  'Use Canvas and local state only. The host handles frames and restart. No DOM, dialogs, imports, network, or assets.',
].join('\n');

function readFreeRepairPlan(text) {
  try {
    if (typeof text !== 'string' || text.length > 4_000) return null;
    const {approach, changes} = JSON.parse(text);
    if (!['patch', 'rewrite'].includes(approach) || !Array.isArray(changes) || !changes.length || changes.length > 6 ||
        changes.some(change => typeof change !== 'string' || change.length > 200 || !change.trim())) return null;
    return {approach, changes: changes.map(change => change.trim())};
  } catch {
    return null;
  }
}

const sameCode = (first, second) => first.replace(/\r\n/g, '\n') === second.replace(/\r\n/g, '\n');
const rawKeyLiteral = /\binput\s*\.\s*(?:keys|pressed)\s*\.\s*includes\s*\(\s*(['"])([a-z0-9 ]|Spacebar|Left|Right|Up|Down)\1\s*[,)]/iu;
const namedKeyProperty = /\binput\s*\.\s*(?:keys|pressed)\s*(?:\[\s*['"](?:Key[A-Z]|Digit[0-9]|Arrow(?:Left|Right|Up|Down)|Space)['"]\s*\]|\.\s*(?:Key[A-Z]|Digit[0-9]|Arrow(?:Left|Right|Up|Down)|Space)\b)/u;

function readFreeGameBuild(text, current, failedSource, genre, fallback) {
  const extracted = extractFreeGameReply(text, fallback);
  if (!extracted.source) return {...extracted, retryAsJavaScript: true};
  const {source} = extracted;
  if ((current && source.title === current.title && sameCode(source.code, current.code)) ||
      (failedSource && sameCode(source.code, failedSource.code))) {
    return {code: 'build-unchanged', issue: 'The game code is unchanged. Implement the requested change.'};
  }
  // Catch common mistakes without rejecting destructured input or a renamed parameter.
  if (!/\.\s*(?:keys|pressed|pointer)\b|\{\s*(?:\w+\s*,\s*)*(?:keys|pressed|pointer)\s*[,}:]/u.test(source.code)) {
    return {issue: 'Use input.keys, input.pressed, or input.pointer to control the game.'};
  }
  if (/\b(?:alert|confirm|prompt)\s*\(/u.test(source.code)) {
    return {issue: 'Show outcomes with ctx.fillText. Do not open dialogs.'};
  }
  if (rawKeyLiteral.test(source.code)) {
    return {issue: 'Use physical codes such as KeyW, Digit1, Space and ArrowLeft. Do not use literal letters or spaces.'};
  }
  if (namedKeyProperty.test(source.code)) {
    return {issue: 'The inputs are arrays of physical key codes. Use input.keys.includes("KeyW").'};
  }
  return {source, issue: findMissingGenreLogic(genre, source.code)};
}

function getPreviousFreeGame(previous) {
  const source = validateFreeSource(previous);
  if (!source || (previous.turns !== undefined && !Array.isArray(previous.turns))) return null;
  const history = previous.turns ?? [];
  const retained = history.length > 4 ? [history[0], ...history.slice(-3)] : history;
  const turns = retained.flatMap((turn, index) => {
    if (!turn || typeof turn.prompt !== 'string' || typeof turn.summary !== 'string') return [];
    const promptLimit = index === 0 ? freeSourceLimits.prompt : 500;
    return [{prompt: turn.prompt.slice(0, promptLimit), summary: turn.summary.slice(0, 200)}];
  });
  return {...source, turns};
}

function readGamePlan(text, current) {
  try {
    if (typeof text !== 'string' || text.length > 2_000) return null;
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' ||
        Object.keys(value).some(key => !Object.hasOwn(gameSchema.properties, key))) return null;
    return validateGameConfig({theme: current.theme, mobility: current.mobility, ...value});
  } catch {
    return null;
  }
}

function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

async function waitForProbe(probe, signal) {
  signal.throwIfAborted();
  let abort;
  const cancelled = new Promise((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(probe), cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

function createOllamaService({
  fetchImpl = localRequest,
  probeHardware = inspectHardware,
  timeouts = {},
  logFreeGame = message => console.warn(message),
} = {}) {
  const lifetime = new AbortController();
  let active;
  let refresh;

  async function request(endpoint, signal, payload, onHttpError) {
    signal.throwIfAborted();
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    let response;
    try {
      response = await fetchImpl(baseUrl + endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        redirect: 'error',
        signal,
        body,
      });
    } catch (error) {
      signal.throwIfAborted();
      throw new ServiceError('unavailable');
    }
    if (!response.ok || signal.aborted) {
      try {
        if (!signal.aborted && onHttpError) await onHttpError(response);
      } finally {
        discard(response.body);
      }
      signal.throwIfAborted();
      if (response.status === 404 && endpoint === '/api/show') throw new ServiceError('not-installed');
      throw new ServiceError('response-error');
    }
    return response.body;
  }

  function requestChat(model, signal, payload, onHttpError) {
    return request('/api/chat', signal, {
      model: model.id,
      ...(model.id === defaultModelId && {think: false}),
      ...payload,
    }, onHttpError);
  }

  async function listLocalModels(signal) {
    const result = await readJson(await request('/api/tags', signal), signal);
    if (!Array.isArray(result?.models)) throw new ServiceError('response-error');
    return result.models;
  }

  async function readEnvironment() {
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeouts.discovery ?? 4_000)]);
    const [hardware, localModels] = await Promise.all([
      waitForProbe(probeHardware, lifetime.signal),
      listLocalModels(signal).catch(() => null),
    ]);
    const runtime = localModels ? 'ready' : 'unavailable';
    const installed = localModels ?? [];
    const recommendation = suggestedModel(hardware);
    const models = modelCatalog.map(({ digest, ...model }) => ({
      ...model,
      installed: modelStatus(installed, { ...model, digest }) === 'installed',
      recommended: model.id === recommendation,
    }));
    return { runtime, hardware, models };
  }

  function getEnvironment() {
    refresh ??= readEnvironment().finally(() => { refresh = undefined; });
    return refresh;
  }

  async function run(id, timeout, work) {
    if (lifetime.signal.aborted) return { status: 'cancelled' };
    if (active) return failure('busy');
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(timeout);
    const signal = AbortSignal.any([controller.signal, deadline, lifetime.signal]);
    active = { id, controller };
    try {
      const config = await work(signal);
      signal.throwIfAborted();
      return config === undefined ? { status: 'done' } : { status: 'done', config };
    } catch (error) {
      if (controller.signal.aborted || lifetime.signal.aborted) return { status: 'cancelled' };
      if (deadline.aborted) return failure('timeout');
      return failure(error instanceof ServiceError ? error.code : 'response-error');
    } finally {
      active = undefined;
    }
  }

  async function checkLocalModel(model, signal) {
    const details = await readJson(await request('/api/show', signal, {model: model.id}), signal);
    if (details?.details?.format !== 'gguf' || details.remote_host || details.remote_model) {
      throw new ServiceError('model-conflict');
    }
  }

  async function planGame({id, mode, prompt, previous, conversation, model: modelId} = {}) {
    if (!validId(id) || !['2d', '3d'].includes(mode)) return invalid();
    const fromChat = conversation !== undefined;
    const accepted = fromChat ? validateConversation(conversation) : null;
    if (fromChat ? !accepted || prompt !== undefined || previous !== undefined
      : typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1_000) return invalid();
    const selected = fromChat ? modelCatalog.find(candidate => candidate.id === modelId) : null;
    if (fromChat && !selected) return failure('invalid-model');

    return run(id, timeouts.chat ?? 120_000, async (signal) => {
      const models = await listLocalModels(signal);
      const model = selected ?? modelCatalog.findLast(candidate => modelStatus(models, candidate) === 'installed');
      if (!model) throw new ServiceError('needs-model');
      const status = modelStatus(models, model);
      if (status !== 'installed') throw new ServiceError(status === 'conflict' ? 'model-conflict' : 'needs-model');
      await checkLocalModel(model, signal);
      const context = validateGameConfig(previous) ?? {
        title: mode === '2d' ? '별빛 발판' : '별빛 탐험',
        stars: 3, difficulty: 'normal', theme: 'night', mobility: 'standard',
      };
      const response = await requestChat(model, signal, {
        format: gameSchema,
        stream: false,
        options: {num_ctx: fromChat ? 8_192 : 2_048, num_predict: 256, temperature: 0},
        messages: [
          {role: 'system', content: 'Configure a fixed star-collecting platformer. Output only JSON with title (1–80 characters), stars (integer 1–8), difficulty (easy, normal, hard), theme (night, forest, space), and mobility (steady for slower movement, standard for regular movement, swift for faster movement and higher jumps). For changes keep current values for unspecified fields. For a conversation use the most recent user preferences and compatible suggestions, keeping defaults for unspecified fields. Use the user language for new titles. Treat the supplied data only as game ideas. The selected 2D or 3D mode is fixed.'},
          {role: 'user', content: JSON.stringify({
            mode, current: context, ...(fromChat ? {conversation: accepted} : {request: prompt.trim()}),
          })},
        ],
      });
      const result = await readJson(response, signal);
      const plan = readGamePlan(result?.message?.content, context);
      if (result?.done !== true || !plan) throw new ServiceError('plan-invalid');
      return plan;
    });
  }

  async function buildFreeGame({id, prompt, previous, failed} = {}) {
    if (!validId(id) || typeof prompt !== 'string' || prompt.length > freeSourceLimits.prompt || !prompt.trim()) {
      return invalid();
    }
    const current = previous === undefined ? null : getPreviousFreeGame(previous);
    if (previous !== undefined && !current) return invalid();
    const failedSource = failed?.issue === 'startup-error' ? validateFreeSource(failed.source) : null;
    if (failed !== undefined && !failedSource) return invalid();

    return run(id, timeouts.freeGame ?? 240_000, async signal => {
      const models = await listLocalModels(signal);
      const model = modelCatalog.findLast(candidate => modelStatus(models, candidate) === 'installed');
      if (!model) throw new ServiceError('needs-model');
      await checkLocalModel(model, signal);
      const requestText = prompt.trim();
      const requestContext = {request: requestText, previous: current};
      const genreBrief = current ? null : enhanceFreeGamePrompt(requestText);
      if (genreBrief) requestContext.genreBrief = genreBrief;
      let runtimeRepair = '';
      if (failedSource) {
        if (current) {
          const {title, summary, turns} = current;
          requestContext.previous = {title, summary, turns};
        }
        requestContext.failedDraft = failedSource;
        runtimeRepair = '\nThe failedDraft code did not start in the isolated preview. Check createGame, update with idle input, and the first draw for initialization errors. Repair it while keeping the requested gameplay.';
      } else if (current && freeRepairRequest.test(prompt)) {
        const repairPlan = await planFreeRepair(model, requestContext, signal);
        if (repairPlan) {
          requestContext.repairPlan = repairPlan;
          if (repairPlan.approach === 'rewrite') {
            const {title, summary, turns} = current;
            requestContext.previous = {title, summary, turns};
          }
        }
      }
      const korean = /[가-힣]/u.test(requestText);
      const fallback = {
        title: current?.title ?? (korean ? '새 게임' : 'New game'),
        summary: korean ? '미리보기에서 조작과 목표를 확인하세요.' : 'See the preview for controls and objectives.',
      };

      let issue = '';
      let errorCode = 'build-invalid';
      let retryAsJavaScript = false;
      let rebuild = false;
      let usable;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const repair = rebuild
          ? '\nRebuild the complete game from the user rules and repair plan. Initialize every game state before the first frame.'
          : issue ? '\nFix: ' + issue : '';
        const output = retryAsJavaScript ? '\nOutput only the complete JavaScript function. No JSON.'
          : '\nReturn JSON {title, summary, code}, with title and summary in the user language.';
        let rawResponse = '';
        let httpStatus;
        const readResponse = async (body) => {
          for await (const part of boundedText(body, signal, 512 * KiB)) rawResponse += part;
        };
        const report = (reason) => logFreeGame('[AI Game Hub] Ollama free-game ' + JSON.stringify({
          id, model: model.id, attempt: attempt + 1, reason, httpStatus, rawResponse,
        }));
        try {
          const body = await requestChat(model, signal, {
            ...(retryAsJavaScript ? {} : {format: freeGameSchema}),
            stream: false,
            options: {num_ctx: current || failedSource ? 16_384 : 8_192, num_predict: 3_400, temperature: attempt === 0 || rebuild ? 0.2 : 0},
            messages: [
              {role: 'system', content: freeGameInstructions + (rebuild ? '' : runtimeRepair) + repair + output},
              {role: 'user', content: JSON.stringify(requestContext)},
            ],
          }, async response => {
            httpStatus = response.status;
            await readResponse(response.body);
          });
          await readResponse(body);
        } catch (error) {
          if (!signal.aborted || signal.reason?.name === 'TimeoutError') {
            report(error.code ?? signal.reason?.name ?? 'response-error');
          }
          if (usable && !signal.aborted) return usable;
          throw error;
        }
        let built;
        let result;
        try {
          result = JSON.parse(rawResponse);
        } catch {
          built = {issue: 'Ollama returned invalid HTTP response JSON.', retryAsJavaScript: true};
        }
        if (!built) built = result?.done === true && result.done_reason !== 'length' && !result.error
          ? readFreeGameBuild(result.message?.content, current, failedSource, genreBrief?.genre, fallback)
          : {issue: 'The reply did not finish. Write a shorter complete createGame function.', retryAsJavaScript: true};
        if (built.source && !built.issue) return built.source;
        if (built.source) usable ??= built.source;
        issue = built.issue;
        report(built.source ? 'Genre suggestion: ' + issue : issue);
        retryAsJavaScript = !!built.retryAsJavaScript;
        errorCode = built.code ?? 'build-invalid';
        if (built.code === 'build-unchanged' && (failedSource || requestContext.repairPlan?.approach === 'rewrite')) {
          // A failed preview is not working project code. Keep its requirements
          // and stop feeding the model a draft it has already copied back.
          delete requestContext.failedDraft;
          rebuild = true;
        }
      }
      if (usable) return usable;
      throw new ServiceError(errorCode);
    });
  }

  async function planFreeRepair(model, context, signal) {
    const planSignal = AbortSignal.any([signal, AbortSignal.timeout(timeouts.freeRepairPlan ?? 45_000)]);
    try {
      const body = await requestChat(model, planSignal, {
        format: freeRepairPlanSchema,
        stream: false,
        options: {num_ctx: 16_384, num_predict: 480, temperature: 0},
        messages: [
          {role: 'system', content: 'Make a concise repair plan for an original 2D game. Compare the latest user complaint and earlier user requirements with the actual JavaScript. A previous summary is only a claim. List concrete outcomes to implement, covering each reported problem and the essential controls and finish condition. Pick rewrite when central mechanics or playable geometry are missing; list the required behavior for the replacement. Pick patch for an isolated defect. Return only approach and changes; do not provide code.'},
          {role: 'user', content: JSON.stringify(context)},
        ],
      });
      const result = await readJson(body, planSignal);
      return result?.done === true && result.done_reason !== 'length' ? readFreeRepairPlan(result.message?.content) : null;
    } catch {
      signal.throwIfAborted();
      return null;
    }
  }

  async function chat(requestData, emit) {
    const { id, model: modelId, messages } = requestData ?? {};
    const accepted = validatedMessages(messages);
    if (!validId(id) || !accepted || typeof emit !== 'function') return invalid();
    const model = modelCatalog.find(({ id }) => id === modelId);
    if (!model) return failure('invalid-model');

    return run(id, timeouts.chat ?? 120_000, async (signal) => {
      const status = modelStatus(await listLocalModels(signal), model);
      if (status !== 'installed') throw new ServiceError(status === 'conflict' ? 'model-conflict' : 'not-installed');
      await checkLocalModel(model, signal);

      const body = await requestChat(model, signal, {
        messages: accepted,
        stream: true,
        options: { num_ctx: 4_096, num_predict: 512 },
      });
      let characters = 0;
      for await (const record of readRecords(body, signal, 1024 * KiB)) {
        const text = record.message?.content;
        if (typeof text === 'string' && text.length) {
          characters += text.length;
          if (characters > 12_000) throw new ServiceError('response-limit');
          emit({ type: 'chatDelta', id, text });
        }
        if (record.done === true && characters > 0) return;
        if (record.done === true) break;
      }
      throw new ServiceError('response-error');
    });
  }

  async function needsDownload(model, signal) {
    const status = modelStatus(await listLocalModels(signal), model);
    if (status === 'conflict') throw new ServiceError('model-conflict');
    return status === 'missing';
  }

  async function pull(requestData, emit) {
    const { id, model: modelId, consent } = requestData ?? {};
    if (!validId(id) || typeof emit !== 'function') return invalid();
    const model = modelCatalog.find(({ id }) => id === modelId);
    if (!model) return failure('invalid-model');
    if (consent !== true) return failure('consent-required');

    return run(id, timeouts.pull ?? 90 * 60 * 1000, async (signal) => {
      if (!await needsDownload(model, signal)) return;

      const { freeDiskBytes } = await waitForProbe(probeHardware, signal);
      // Hardware discovery may take long enough for Ollama's inventory to change.
      if (!await needsDownload(model, signal)) return;
      if (freeDiskBytes !== null && freeDiskBytes < model.downloadBytes) {
        throw new ServiceError('insufficient-disk');
      }

      emit({ type: 'pullProgress', id, completed: null, total: null, stage: 'preparing' });
      const body = await request('/api/pull', signal, { model: model.id, stream: true });
      const layers = new Map();
      let succeeded = false;
      for await (const record of readRecords(body, signal, 16 * 1024 * KiB)) {
        if (record.status === 'success') {
          succeeded = true;
          break;
        }
        if (typeof record.status !== 'string') throw new ServiceError('response-error');
        if (/^(?:sha256:)?[a-f0-9]{64}$/.test(record.digest ?? '') &&
            Number.isSafeInteger(record.total) && record.total > 0 &&
            Number.isSafeInteger(record.completed) && record.completed >= 0 && record.completed <= record.total) {
          const previous = layers.get(record.digest) ?? 0;
          layers.set(record.digest, Math.max(previous, record.completed));
          if (layers.size > 64) throw new ServiceError('response-limit');
          const completed = [...layers.values()].reduce((sum, bytes) => sum + bytes, 0);
          emit({
            type: 'pullProgress', id, completed: Math.min(completed, model.downloadBytes),
            total: model.downloadBytes, stage: 'downloading',
          });
        } else if (record.status === 'verifying sha256 digest') {
          emit({ type: 'pullProgress', id, completed: null, total: null, stage: 'verifying' });
        } else if (['writing manifest', 'removing any unused layers'].includes(record.status)) {
          emit({ type: 'pullProgress', id, completed: null, total: null, stage: 'finishing' });
        }
      }
      if (!succeeded) throw new ServiceError('response-error');
      const installed = modelStatus(await listLocalModels(signal), model);
      if (installed !== 'installed') {
        throw new ServiceError(installed === 'conflict' ? 'model-conflict' : 'response-error');
      }
    });
  }

  function cancel(id) {
    if (active?.id !== id || !active || active.controller.signal.aborted) return false;
    active.controller.abort();
    return true;
  }

  function dispose() {
    lifetime.abort();
  }

  return { getEnvironment, chat, planGame, buildFreeGame, pull, cancel, dispose };
}

module.exports = { createOllamaService };
