'use strict';

// This function is serialized into the worker. Only the worker loads game source.
function startWorker() {
  const scope = globalThis;
  const loadSource = scope.importScripts.bind(scope);
  const disabled = [
    'Worker', 'SharedWorker', 'importScripts', 'postMessage', 'fetch', 'XMLHttpRequest',
    'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport',
    'RTCPeerConnection', 'webkitRTCPeerConnection', 'TCPSocket', 'TCPServerSocket', 'UDPSocket',
    'BroadcastChannel', 'indexedDB', 'caches',
  ];
  for (const name of disabled) {
    Object.defineProperty(scope, name, {value: undefined, writable: false, configurable: false});
  }

  scope.addEventListener('message', (event) => {
    const {canvas, url} = event.data;
    const [channel] = event.ports;
    const report = channel.postMessage.bind(channel);
    const listen = channel.addEventListener.bind(channel);
    const begin = channel.start.bind(channel);
    scope.addEventListener('unhandledrejection', () => report('error'));
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      loadSource(url);
      const game = createGame({canvas, ctx, width: canvas.width, height: canvas.height});
      if (typeof game?.update !== 'function' || typeof game?.draw !== 'function') {
        throw new Error('Invalid game functions');
      }
      listen('message', ({data}) => {
        try {
          const result = game.update(data.dt, data.input);
          if (typeof result?.then === 'function') throw new Error('Async update');
          const drawn = game.draw();
          if (typeof drawn?.then === 'function') throw new Error('Async draw');
          report('frame');
        } catch {
          report('error');
        }
      });
      begin();
    } catch {
      report('error');
    }
  }, {once: true});
}

const maxCodeLength = 24_000;
const width = 960;
const height = 540;
const frameLimit = 3_000;
const warmupFrames = 8;
const warmupMs = 150;
const canvas = document.querySelector('canvas');
canvas.tabIndex = 0;
let parentChannel;
let worker;
let workerChannel;
let workerUrl;
let sourceUrl;
let nextFrame;
let deadline;
let lastFrame;
let firstFrameAt;
let completedFrames = 0;
let ready = false;

const keys = new Set();
const pressed = new Set();
const pointer = {x: 0, y: 0, down: false, pressed: false};

function clearInput() {
  keys.clear();
  pressed.clear();
  pointer.down = false;
  pointer.pressed = false;
}

function focusCanvas() {
  canvas.focus({preventScroll: true});
  if (document.activeElement === canvas) parentChannel?.postMessage('canvas-focused');
}

addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.code === 'Tab') return;
  if (event.code === 'Escape') {
    event.preventDefault();
    clearInput();
    parentChannel?.postMessage('leave-focus');
    return;
  }
  if (!keys.has(event.code)) pressed.add(event.code);
  keys.add(event.code);
  event.preventDefault();
});
addEventListener('keyup', (event) => keys.delete(event.code));
addEventListener('focus', () => {
  if (document.activeElement === canvas) parentChannel?.postMessage('canvas-focused');
});
addEventListener('blur', () => {
  clearInput();
  parentChannel?.postMessage('canvas-blurred');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInput();
});
canvas.addEventListener('focus', () => parentChannel?.postMessage('canvas-focused'));
canvas.addEventListener('blur', () => {
  clearInput();
  parentChannel?.postMessage('canvas-blurred');
});

function movePointer(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = Math.min(width, Math.max(0, (event.clientX - bounds.left) * width / bounds.width));
  pointer.y = Math.min(height, Math.max(0, (event.clientY - bounds.top) * height / bounds.height));
}
canvas.addEventListener('pointermove', event => { if (event.isPrimary) movePointer(event); });
canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  focusCanvas();
  movePointer(event);
  pointer.down = true;
  pointer.pressed = true;
  canvas.setPointerCapture(event.pointerId);
});
for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(kind, event => {
    if (event.isPrimary) pointer.down = false;
  });
}

function releaseSource() {
  if (workerUrl) URL.revokeObjectURL(workerUrl);
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  workerUrl = sourceUrl = undefined;
}

function stop() {
  cancelAnimationFrame(nextFrame);
  clearTimeout(deadline);
  worker?.terminate();
  workerChannel?.close();
  releaseSource();
}

function fail() {
  stop();
  parentChannel?.postMessage('error');
  parentChannel?.close();
}

function step(now) {
  const dt = lastFrame === undefined ? 1 / 60 : Math.max(0, Math.min(0.05, (now - lastFrame) / 1000));
  lastFrame = now;
  deadline = setTimeout(fail, frameLimit);
  workerChannel.postMessage({dt, input: {keys: [...keys], pressed: [...pressed], pointer}});
  pressed.clear();
  pointer.pressed = false;
}

function receiveFrame({data}) {
  if (data !== 'frame') return fail();
  clearTimeout(deadline);
  if (!ready) {
    const now = performance.now();
    firstFrameAt ??= now;
    completedFrames += 1;
    if (completedFrames >= warmupFrames && now - firstFrameAt >= warmupMs) {
      ready = true;
      releaseSource();
      parentChannel.postMessage('ready');
    }
  }
  nextFrame = requestAnimationFrame(step);
}

function start(event) {
  if (event.source !== parent || event.data?.type !== 'hub-free:start' || event.ports.length !== 1) return;
  if (parentChannel) {
    event.ports[0].close();
    return;
  }
  [parentChannel] = event.ports;
  parentChannel.onmessage = ({data}) => {
    if (ready && data === 'focus-canvas') focusCanvas();
  };
  const {code} = event.data;
  if (typeof code !== 'string' || !code.trim() || code.length > maxCodeLength) return fail();
  try {
    const surface = canvas.transferControlToOffscreen();
    const workerCode = '(' + startWorker.toString() + ')();';
    workerUrl = URL.createObjectURL(new Blob([workerCode], {type: 'text/javascript'}));
    sourceUrl = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
    worker = new Worker(workerUrl);
    worker.addEventListener('error', fail);
    const channel = new MessageChannel();
    workerChannel = channel.port1;
    workerChannel.onmessage = receiveFrame;
    worker.postMessage({canvas: surface, url: sourceUrl}, [surface, channel.port2]);
    step(performance.now());
  } catch {
    fail();
  }
}

addEventListener('message', start);
addEventListener('pagehide', () => {
  stop();
  parentChannel?.close();
}, {once: true});
