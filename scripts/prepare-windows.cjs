const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { engines } = require('../package.json');

const root = path.join(__dirname, '..');
const minimumNode = engines.node.match(/^>=(\d+)\.(\d+)\.(\d+)$/);

function hasSupportedNode() {
  const current = process.versions.node.split('.').map(Number);
  const minimum = minimumNode.slice(1).map(Number);
  const firstDifference = current.findIndex((part, index) => part !== minimum[index]);
  return firstDifference === -1 || current[firstDifference] > minimum[firstDifference];
}

function prepareDependencies() {
  if (!hasSupportedNode()) {
    throw new Error(`Node.js ${minimumNode[0].slice(2)} or newer is required. Install Node.js LTS from https://nodejs.org/.`);
  }

  const modules = path.join(root, 'node_modules');
  const stamp = path.join(modules, '.ai-game-hub-lock-sha256');
  const lock = readFileSync(path.join(root, 'package-lock.json'));
  const checksum = createHash('sha256').update(lock).digest('hex');
  const commands = ['electron', 'vite', 'tsc', 'electron-builder'];
  const hasCommands = () => commands.every(name => existsSync(path.join(modules, '.bin', name + '.cmd')));

  if (hasCommands() && existsSync(stamp) && readFileSync(stamp, 'utf8') === checksum) {
    return;
  }

  console.log('Installing dependencies from package-lock.json...');
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm.cmd ci --no-audit --no-fund'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !hasCommands()) {
    throw new Error('Dependency installation did not complete. Review the npm messages above.');
  }

  writeFileSync(stamp, checksum);
}

try {
  prepareDependencies();
} catch (error) {
  console.error('[ERROR]', error.message);
  process.exitCode = 1;
}
