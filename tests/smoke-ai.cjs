const assert = require('node:assert/strict');

const firstModel = 'qwen2.5-coder:1.5b';
const secondModel = 'qwen2.5-coder:7b';

function mockOllama() {
  let environment = 'ready';
  let active;
  const installed = new Set([firstModel]);
  const chats = [];
  const pulls = [];
  const cancellations = [];
  const begin = (kind, request, emit) => new Promise((resolve) => {
    assert.equal(active, undefined, 'The UI started overlapping operations.');
    active = { kind, request, emit, resolve };
  });

  const complete = (status = 'done') => {
    assert.ok(active, 'No operation is active.');
    const { kind, request, resolve } = active;
    if (kind === 'pull' && status === 'done') installed.add(request.model);
    active = undefined;
    resolve({ status });
  };

  const service = {
    async getEnvironment() {
      return {
        runtime: environment,
        hardware: {
          cpu: 'Smoke-test CPU', logicalCores: 8, ramBytes: 16 * 1024 ** 3,
          vramBytes: null, freeDiskBytes: 20 * 1024 ** 3, modelDirectory: 'C:\\SmokeTest\\models',
        },
        models: [
          { id: firstModel, label: 'Qwen 1.5B', downloadBytes: 1_000_000_000, license: 'Apache-2.0', installed: installed.has(firstModel), recommended: true },
          { id: secondModel, label: 'Qwen 7B', downloadBytes: 5_000_000_000, license: 'Apache-2.0', installed: installed.has(secondModel), recommended: false },
        ],
      };
    },
    chat(request, emit) {
      chats.push(request);
      return begin('chat', request, emit);
    },
    pull(request, emit) {
      pulls.push(request);
      return begin('pull', request, emit);
    },
    cancel(id) {
      if (!active || active.request.id !== id) return false;
      cancellations.push(id);
      complete('cancelled');
      return true;
    },
    dispose() {
      if (active) complete('cancelled');
    },
  };

  return {
    service, chats, pulls, cancellations, complete,
    setUnavailable() { environment = 'unavailable'; },
    setReady() { environment = 'ready'; },
    emitDelta(text) {
      assert.equal(active?.kind, 'chat');
      active.emit({ type: 'chatDelta', id: active.request.id, text });
    },
    emitProgress() {
      assert.equal(active?.kind, 'pull');
      active.emit({ type: 'pullProgress', id: active.request.id, completed: 500_000_000, total: 5_000_000_000, stage: 'downloading' });
    },
  };
}

async function verifyLocalChat({ evaluate, click, key, inputText, waitFor }, runtime) {
  const visible = (selector) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  const enabled = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.disabled === false`);
  const selected = () => evaluate('document.querySelector("#local-ai-model")?.value');
  const status = (value) => visible(`#local-ai-status[data-status="${value}"]`);
  const assistantText = () => evaluate('Array.from(document.querySelectorAll("#local-chat-transcript .ai-message.assistant")).at(-1)?.textContent');
  const savingHistory = () => evaluate('document.querySelector("#save-local-chat-history").checked');
  const storedHistory = () => evaluate('JSON.parse(localStorage.getItem("ai-game-hub:chat-history"))');
  const send = async (prompt, withKeyboard = false) => {
    await click('#local-chat-prompt');
    await inputText(prompt);
    await waitFor(() => enabled('#send-local-chat'), 'Chat did not accept the prompt.');
    if (withKeyboard) await key('Enter');
    else await click('#send-local-chat');
    await waitFor(() => status('running'), 'Chat did not enter the running state.');
  };

  await click('#open-local-chat');
  await waitFor(() => visible('#local-chat'), 'The local chat screen did not open.');
  await waitFor(() => enabled('#local-chat-prompt'), 'The recommended installed model was not ready.');
  assert.equal(await enabled('#send-local-chat'), false, 'An empty chat message could be sent.');
  assert.equal(await savingHistory(), false, 'Saving history must require opting in.');
  assert.equal(await visible('#use-local-chat-idea'), false, 'An empty conversation offered game settings.');
  const prompt = 'Suggest a first level for a puzzle game.';
  await send(prompt, true);
  await waitFor(() => runtime.chats.length === 1, 'The first chat did not reach the backend.');
  assert.equal(runtime.chats[0].model, firstModel);
  assert.deepEqual(runtime.chats[0].messages.at(-1), { role: 'user', content: prompt });

  runtime.emitDelta('Try a room with ');
  await waitFor(async () => (await assistantText())?.includes('Try a room with'), 'The first chat response chunk did not render.');
  assert.equal(await status('running'), true, 'Chat ended before receiving the remaining response.');
  runtime.emitDelta('one movable block.');
  runtime.complete();
  await waitFor(() => status('done'), 'Chat did not reach completion.');
  assert.match(await assistantText(), /Try a room with one movable block\./);
  assert.equal(await storedHistory(), null, 'Chat was stored without opting in.');
  await waitFor(() => enabled('#use-local-chat-idea'), 'A completed chat did not offer game settings.');
  await click('#save-local-chat-history');
  assert.equal(await savingHistory(), true);
  const firstHistory = [{ prompt, output: 'Try a room with one movable block.' }];
  assert.deepEqual(await storedHistory(), firstHistory);

  await send('Suggest a second level.');
  await waitFor(() => runtime.chats.length === 2, 'The second chat did not reach the backend.');
  const secondChat = runtime.chats[1];
  assert.deepEqual(secondChat.messages, [
    { role: 'user', content: prompt },
    { role: 'assistant', content: 'Try a room with one movable block.' },
    { role: 'user', content: 'Suggest a second level.' },
  ]);
  runtime.emitDelta('This stream will be cancelled.');
  await waitFor(async () => (await assistantText())?.includes('This stream will be cancelled.'), 'The second response did not start streaming.');
  assert.equal(await enabled('#use-local-chat-idea'), false, 'Chat and conversion could run concurrently.');
  assert.deepEqual(await storedHistory(), firstHistory, 'An unfinished reply was stored.');
  await click('#cancel-local-ai');
  await waitFor(() => status('cancelled'), 'The chat cancellation did not reach the renderer.');
  assert.deepEqual(runtime.cancellations, [secondChat.id]);
  assert.deepEqual(await storedHistory(), firstHistory, 'A cancelled reply was stored.');
  await click('#save-local-chat-history');
  assert.equal(await savingHistory(), false);
  assert.equal(await storedHistory(), null, 'Turning off history did not delete the saved transcript.');
  assert.match(await assistantText(), /This stream will be cancelled\./, 'Turning off history cleared the current session.');
  await click('#save-local-chat-history');
  assert.deepEqual(await storedHistory(), firstHistory);
  await click('#reset-local-chat');
  await waitFor(() => enabled('#confirm-chat-reset'), 'The reset confirmation did not appear.');
  await click('#confirm-chat-reset');
  await waitFor(async () => !(await visible('.ai-turn')), 'The chat reset did not clear the transcript.');
  assert.deepEqual(await storedHistory(), [], 'The chat reset left replies in saved history.');
  await click('#use-chat-example');
  assert.ok(await evaluate('document.querySelector("#local-chat-prompt").value.length > 0'));
  await evaluate('document.querySelector("#local-chat-prompt").select()');
  await key('Backspace');

  // Exercise the select without opening a native popup on the desktop.
  await evaluate('document.querySelector("#local-ai-model").focus()');
  await key('ArrowDown');
  await key('ArrowDown');
  await waitFor(async () => (await selected()) === secondModel, 'The second model could not be selected.');
  await waitFor(() => enabled('#request-model-install'), 'Install was unavailable for the missing model.');
  await click('#request-model-install');
  await waitFor(() => visible('#model-download-consent'), 'Model installation did not ask for consent.');
  assert.equal(runtime.pulls.length, 0);
  await click('#dismiss-model-install');
  await waitFor(async () => !(await visible('#model-download-consent')), 'Declining installation did not close consent.');
  assert.equal(runtime.pulls.length, 0);

  await click('#request-model-install');
  await waitFor(() => visible('#model-download-consent'), 'Model installation did not request consent again.');
  await click('#confirm-model-install');
  await waitFor(() => status('running'), 'Model installation did not begin.');
  await waitFor(() => runtime.pulls.length === 1, 'Consent did not reach the backend.');
  assert.equal(runtime.pulls[0].model, secondModel);
  assert.equal(runtime.pulls[0].consent, true);
  runtime.emitProgress();
  await waitFor(
    () => evaluate('document.querySelector("#local-model-progress")?.value === 10'),
    'Model installation did not show the reported download progress.',
  );
  runtime.complete();
  await waitFor(() => status('done'), 'Model installation did not reach completion.');
  await waitFor(() => enabled('#local-chat-prompt'), 'The installed model was not ready for chat.');

  runtime.setUnavailable();
  await click('#refresh-local-ai');
  await waitFor(
    () => evaluate('document.querySelector("#local-chat")?.textContent.includes("Unable to connect to Ollama.")'),
    'Connection loss was not shown in chat.',
  );
  assert.equal(await evaluate('document.querySelector("#local-chat-prompt")?.disabled'), true);

  runtime.setReady();
  await click('#refresh-local-ai');
  await waitFor(() => enabled('#local-chat-prompt'), 'The restored local AI connection did not enable chat.');
  const gamePrompt = 'Suggest a 2D forest game with five stars.';
  const gameReply = 'Forest Signal is a hard game where you collect five stars.';
  await send(gamePrompt);
  await waitFor(() => runtime.chats.length === 3, 'The game idea did not reach chat.');
  runtime.emitDelta(gameReply);
  runtime.complete();
  await waitFor(() => enabled('#use-local-chat-idea'), 'The game idea was not ready to transfer.');
  await waitFor(async () => (await storedHistory())?.[0]?.output === gameReply, 'The completed game idea was not saved.');
  assert.deepEqual(await storedHistory(), [{ prompt: gamePrompt, output: gameReply }]);
}

module.exports = { mockOllama, verifyLocalChat };
