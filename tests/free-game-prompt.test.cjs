const assert = require('node:assert/strict');
const test = require('node:test');
const {enhanceFreeGamePrompt, findMissingGenreLogic} = require('../src/main/free-game-prompt.cjs');

test('short Korean and English game requests get concrete genre defaults', () => {
  for (const prompt of ['레이싱 게임 만들어줘', '자동차 경주 게임을 만들어 주세요!', 'Make me a racing game', 'car racing']) {
    const brief = enhanceFreeGamePrompt(prompt);
    assert.equal(brief.genre, 'racing', prompt);
    assert.match(brief.goals.join(' '), /ordered checkpoints.*lap/);
  }
  const brief = enhanceFreeGamePrompt('별 수집 게임 만들어줘');
  assert.equal(brief.genre, 'collection');
  assert.match(brief.goals.join(' '), /overlap.*each item once/);
  assert.equal(enhanceFreeGamePrompt('별을 모으는 게임').genre, 'collection');
  assert.equal(enhanceFreeGamePrompt('build a platformer').genre, 'platformer');
  assert.equal(enhanceFreeGamePrompt('퍼즐 게임 제작해 줘').genre, 'puzzle');
});

test('detailed and mixed requests do not receive mutually exclusive genre defaults', () => {
  for (const prompt of [
    '별을 수집해 터널을 여는 레이싱 게임 만들어줘', '레이싱 게임 대신 기차역을 운영하고 싶어.',
    '레이싱 게임 만들어줘. 상대 없이 딱 한 바퀴만', '회로를 돌려 연결하면 이기는 퍼즐을 만들어줘.',
    '음악에 맞춰 타이핑하는 게임', '3D 레이싱 게임', 'do not add racing to the game', '',
  ]) assert.equal(enhanceFreeGamePrompt(prompt), null, prompt);
});

test('racing advice flags explicit empty state and permits different game state designs', () => {
  assert.match(findMissingGenreLogic('racing', 'const opponents = [];\n// Draw opponents\nopponents.forEach(drawCar);'), /at least one rival/);
  assert.match(findMissingGenreLogic('racing', 'const lapCount = 0;\nreturn {update() {}, draw() {}};'), /advance it/);
  assert.equal(findMissingGenreLogic('racing', 'let circuits = 0; const pack = spawnCars(3); if (passedGate) circuits++;'), null);
  assert.equal(findMissingGenreLogic('racing', 'const rivals = []; const pack = rivals; pack.push(spawnCar());'), null);
  assert.equal(findMissingGenreLogic('racing', 'const rivals = []; rivals.forEach(drawCar); rivals.push(spawnCar());'), null);
});

test('the collection check identifies taps used for movement and early resets at the goal', () => {
  const broken = `if (input.pressed.includes('KeyW')) player.y -= speed * dt;
    if (collectedCount === targetCount) { init(); }`;
  assert.match(findMissingGenreLogic('collection', broken), /continuous movement.*Show a win/s);
  assert.equal(findMissingGenreLogic('collection', `if (input.keys.includes('KeyW')) player.y -= speed * dt;
    if (collectedCount >= targetCount) won = true;
    if (won && input.pressed.includes('KeyR')) reset();`), null);
  assert.equal(findMissingGenreLogic(undefined, broken), null);
});
