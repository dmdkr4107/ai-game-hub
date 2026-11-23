const { execFile } = require('node:child_process');
const { statfs } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { promisify } = require('node:util');

const query = promisify(execFile);
const MIB = 1024 ** 2;

async function gpuMemory() {
  if (process.platform !== 'win32') return null;
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const tool = path.join(systemRoot, 'System32', 'nvidia-smi.exe');
  try {
    const { stdout } = await query(tool, ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], {
      cwd: path.dirname(tool),
      timeout: 2_000,
      maxBuffer: 4_096,
      windowsHide: true,
    });
    const values = stdout.trim().split(/\r?\n/).map(line => Number(line.trim()))
      .filter(value => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000);
    return values.length ? Math.max(...values) * MIB : null;
  } catch {
    return null;
  }
}

function modelDirectory() {
  const configured = process.env.OLLAMA_MODELS;
  if (configured && path.isAbsolute(configured)) return path.normalize(configured);
  return path.join(os.homedir(), '.ollama', 'models');
}

async function queryDiskFree(directory, signal) {
  // Omit UNC storage from the read-only probe to avoid opening a network share.
  if (process.platform === 'win32' && directory.startsWith('\\\\')) return null;
  let current = directory;
  while (!signal.aborted) {
    try {
      const { bavail, bsize } = await statfs(current);
      const bytes = bavail * bsize;
      return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
    } catch (error) {
      const parent = path.dirname(current);
      if (error.code !== 'ENOENT' || parent === current) return null;
      current = parent;
    }
  }
  return null;
}

let diskRequest;

function diskFree(directory) {
  if (diskRequest?.directory === directory) return diskRequest.result;
  const deadline = new AbortController();
  const operation = queryDiskFree(directory, deadline.signal);
  const wait = delay(1_500, null, { signal: deadline.signal, ref: false });
  const result = Promise.race([operation, wait]).finally(() => deadline.abort());
  const current = { directory, result };
  diskRequest = current;
  // A timed-out native statfs may still be running. Share its fallback until it settles.
  void operation.then(clearRequest, clearRequest);
  return result;

  function clearRequest() {
    if (diskRequest === current) diskRequest = undefined;
  }
}

let vramQuery;

async function inspectHardware() {
  vramQuery ??= gpuMemory();
  const directory = modelDirectory();
  const [vramBytes, freeDiskBytes] = await Promise.all([vramQuery, diskFree(directory)]);
  const cpus = os.cpus();
  return {
    cpu: cpus[0]?.model?.trim() || '',
    logicalCores: os.availableParallelism(),
    ramBytes: os.totalmem(),
    vramBytes,
    freeDiskBytes,
    modelDirectory: directory,
  };
}

module.exports = { inspectHardware };
