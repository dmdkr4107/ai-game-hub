import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const devUrl = 'http://127.0.0.1:5173/';

async function run() {
  let server;
  let electron;
  let interruptedExitCode;
  const stop = (signal) => {
    interruptedExitCode = signal === 'SIGINT' ? 130 : 143;
    electron?.kill(signal);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  const startupTimer = setTimeout(() => {
    console.error('[dev] Timed out starting the local Vite server.');
    process.exit(1);
  }, 30_000);

  try {
    server = await createServer({ root: projectRoot });
    await server.listen();

    // Only check our listener after Vite has successfully bound the strict port.
    const response = await fetch(devUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`The Vite page returned HTTP ${response.status}.`);
    }
    await response.text();
    clearTimeout(startupTimer);

    if (interruptedExitCode) return interruptedExitCode;

    const { default: electronPath } = await import('electron');
    if (interruptedExitCode) return interruptedExitCode;

    return await new Promise((resolve, reject) => {
      electron = spawn(electronPath, ['.'], {
        cwd: projectRoot,
        env: { ...process.env, AI_HUB_DEV_URL: devUrl },
        stdio: 'inherit',
      });
      electron.once('error', reject);
      electron.once('exit', (code, signal) => {
        if (signal && !interruptedExitCode) {
          reject(new Error(`Electron terminated with ${signal}.`));
        } else {
          resolve(interruptedExitCode ?? code);
        }
      });
    });
  } catch (error) {
    console.error('[dev] AI Game Hub could not start:', error.message);
    process.exitCode = 1;
    return 1;
  } finally {
    clearTimeout(startupTimer);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await server?.close();
  }
}

run().then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error('[dev] Failed to close the Vite server:', error.message);
    process.exitCode = 1;
  },
);
