const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {randomUUID} = require('node:crypto');
const {createFreeGameStore} = require('../src/main/free-games.cjs');

const original = {
  title: 'First circuit', summary: 'Rotate tiles to connect the circuit.',
  code: 'function createGame({ctx}) { return {update() {}, draw() {ctx.fillRect(0, 0, 40, 40);}}; }',
};
const revised = {...original, title:'Second circuit', summary:'A new circuit layout.'};

async function fixture(t, now) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-free-game-test-'));
  t.after(() => fs.rm(workspace, {recursive:true, force:true}));
  const root = path.join(workspace, 'free-games');
  return {root, store: createFreeGameStore(root, now)};
}

test('free projects persist after a staged commit and can restore their last working conversation and code', async t => {
  const {root, store} = await fixture(t);
  const candidate = store.stage({source:original,prompt:'Make a circuit game'});
  assert.deepEqual(await store.list(), []);
  const saving = store.commit(candidate.token);
  assert.deepEqual(await store.commit(candidate.token), {status:'error',code:'busy'});
  await store.waitForWrites();
  const first = await saving;
  assert.equal(first.status, 'done');
  assert.equal(first.project.title, original.title);
  const {id} = first.project;
  const {current} = await store.read(id);
  const second = store.stage({source:revised,prompt:'Change the layout',projectId:id,baseRevision:current.revision});
  assert.equal((await store.load(id)).project.title, original.title);
  assert.equal((await store.commit(second.token)).project.canRestore, true);
  const reopened = createFreeGameStore(root);
  const loaded = await reopened.load(id);
  assert.equal(loaded.project.title, revised.title);
  assert.deepEqual(loaded.project.turns, [
    {prompt:'Make a circuit game',summary:original.summary},
    {prompt:'Change the layout',summary:revised.summary},
  ]);
  assert.deepEqual((await reopened.list()).map(game => game.id), [id]);
  const restored = await reopened.restore(id);
  assert.equal(restored.status, 'done');
  assert.deepEqual(restored.project.turns, first.project.turns);
  assert.equal(restored.project.code, original.code);
  assert.equal(restored.project.canRestore, false);
  assert.deepEqual(await fs.readdir(root), [id + '.json']);
});

test('invalid, discarded, expired and stale candidates cannot replace a free project', async t => {
  let time = 1000;
  const {store,root} = await fixture(t, () => time);
  assert.equal(store.stage({source:{...original,code:'invalid'},prompt:'test'}), null);
  assert.deepEqual(await store.load('../project'), {status:'error',code:'invalid-request'});
  const abandoned = store.stage({source:original,prompt:'discard'});
  assert.equal(store.discard(abandoned.token), true);
  assert.deepEqual(await store.commit(abandoned.token), {status:'error',code:'expired'});
  const old = store.stage({source:original,prompt:'expire'});
  time += 301_000;
  assert.deepEqual(await store.commit(old.token), {status:'error',code:'expired'});
  const one = store.stage({source:original,prompt:'original'});
  const {project:{id}} = await store.commit(one.token);
  const baseline = (await store.read(id)).current.revision;
  const two = store.stage({source:revised,prompt:'revision',projectId:id,baseRevision:baseline});
  await store.commit(two.token);
  const stale = store.stage({source:original,prompt:'stale',projectId:id,baseRevision:baseline});
  assert.deepEqual(await store.commit(stale.token), {status:'error',code:'conflict'});
  assert.equal((await store.load(id)).project.title, revised.title);
  await fs.writeFile(path.join(root, randomUUID() + '.json'), '{invalid JSON}');
  assert.equal((await store.list()).length, 1);
});

test('a failed-start draft can be reused once for the same request and revision', async t => {
  const {store} = await fixture(t);
  const first = store.stage({source:original,prompt:'New game'});
  const {project:{id}} = await store.commit(first.token);
  const {current} = await store.read(id);
  const request = {prompt:'Repair the race', projectId:id, baseRevision:current.revision};
  const candidate = store.stage({source:revised,...request});
  assert.equal(store.takeFailedDraft({...request,token:candidate.token,prompt:'Different request'}), null);
  assert.equal(store.takeFailedDraft({...request,token:candidate.token,baseRevision:randomUUID()}), null);
  assert.deepEqual(store.takeFailedDraft({...request,token:candidate.token}), revised);
  assert.equal(store.takeFailedDraft({...request,token:candidate.token}), null);
  assert.deepEqual(await store.commit(candidate.token), {status:'error',code:'expired'});
  assert.equal((await store.load(id)).project.title, original.title);
});

test('long edit histories retain their first game request and the latest changes', async t => {
  const {store} = await fixture(t);
  const first = store.stage({source:original,prompt:'Original rules and controls'});
  const {project:{id}} = await store.commit(first.token);
  for (let edit = 1; edit <= 13; edit += 1) {
    const {current} = await store.read(id);
    const candidate = store.stage({source:revised, prompt:'Edit ' + edit, projectId:id, baseRevision:current.revision});
    assert.equal((await store.commit(candidate.token)).status, 'done');
  }
  const {current} = await store.read(id);
  assert.equal(current.turns.length, 12);
  assert.equal(current.turns[0].prompt, 'Original rules and controls');
  assert.equal(current.turns[1].prompt, 'Edit 3');
  assert.equal(current.turns.at(-1).prompt, 'Edit 13');
});
