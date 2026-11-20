const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('double-click Windows launcher checks prerequisites, installs, builds and runs', () => {
  const bat = fs.readFileSync(path.join(root, 'START_AI_GAME_HUB.bat'), 'utf8');
  for (const command of ['cd /d "%~dp0"', 'where node', 'where npm.cmd', 'node scripts\\prepare-windows.cjs', 'call npm.cmd run build', 'call npm.cmd start', 'if errorlevel 1', 'pause']) {
    assert.ok(bat.includes(command), `missing: ${command}`);
  }
  assert.ok(bat.indexOf('call npm.cmd run build') < bat.indexOf('call npm.cmd start'));
});

test('optional installer-builder does not claim EXE is bundled', () => {
  const bat = fs.readFileSync(path.join(root, 'BUILD_WINDOWS_INSTALLER.bat'), 'utf8');
  assert.match(bat, /node scripts\\prepare-windows\.cjs/);
  assert.match(bat, /call npm\.cmd run package:win/);
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /이 EXE는 ZIP에 포함되어 있지 않으며/);
});
