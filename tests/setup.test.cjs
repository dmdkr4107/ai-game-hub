const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const {createSetupActions} = require('../src/main/setup.cjs');

test('setup opens only the fixed download pages', async () => {
  const opened = [];
  const open = createSetupActions({shell: {openExternal: async url => { opened.push(url); }}});
  assert.equal(await open('file:///C:/Windows/explorer.exe'), false);
  assert.equal(await open({toString: () => 'ollama'}), false);
  assert.equal(await open('ollama'), true);
  assert.equal(await open('godot'), true);
  assert.deepEqual(opened, [
    'https://ollama.com/download/windows',
    'https://godotengine.org/download/archive/4.7.2-stable/',
  ]);
});

test('setup opens the managed runtime or the existing engine folder', async t => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'hub setup % '));
  const runtime = path.join(userData, 'runtime');
  const custom = path.join(userData, 'Custom Godot');
  t.after(async () => {
    await fs.rmdir(runtime).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.rmdir(custom);
    await fs.rmdir(userData);
  });
  await fs.mkdir(custom);
  const opened = [];
  const shell = {async openPath(folder) {
    assert.equal((await fs.stat(folder)).isDirectory(), true);
    opened.push(folder);
    return '';
  }};

  assert.equal(await createSetupActions({shell, userData})('godot-folder'), true);
  assert.equal(await createSetupActions({
    shell, userData, enginePath: path.join(custom, 'Godot.exe'),
  })('godot-folder'), true);
  assert.deepEqual(opened, [runtime, custom]);
});

test('setup reports failures to open a page or folder', async () => {
  const open = createSetupActions({
    enginePath: path.join(os.tmpdir(), 'Godot.exe'),
    shell: {
      openExternal: async () => { throw new Error('no default browser'); },
      openPath: async () => 'no file explorer',
    },
  });
  assert.equal(await open('godot'), false);
  assert.equal(await open('godot-folder'), false);
});
