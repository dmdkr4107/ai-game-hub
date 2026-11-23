// Match direct genre requests. Detailed and mixed ideas keep their original rules.
const genres = [
  {
    name: 'racing',
    match: /^(?:레이싱|레이스|자동차\s*(?:경주|레이싱)|경주|racing|car\s*rac(?:e|ing)|race)$/u,
    goals: [
      'Draw a closed road. Use held WASD to drive and Space to handbrake while steering.',
      'Move rivals along the road. Require ordered checkpoints before counting each lap. Show progress and finish after two laps.',
    ],
  },
  {
    name: 'collection',
    match: /^(?:(?:별|아이템)\s*(?:수집|모으기|줍기)|별(?:을)?\s*모으는|star\s*collect(?:ion|ing)|collect(?:ing)?\s*stars|item\s*collection|collectathon)$/u,
    goals: [
      'Use held keys to move within the play area. On overlap, remove each item once and update the count.',
      'Place reachable pickups and show the target. Keep the win screen visible until replay.',
    ],
  },
  {
    name: 'platformer',
    match: /^(?:플랫포머|플랫폼\s*점프|발판\s*점프|횡스크롤\s*발판|platformer|platform\s*jumping)$/u,
    goals: [
      'Use left/right movement and Space to jump. Land on platforms and reset on falls.',
      'Start on safe ground, keep gaps reachable, and show a win at the finish.',
    ],
  },
  {
    name: 'puzzle',
    match: /^(?:퍼즐|두뇌\s*퍼즐|puzzle)$/u,
    goals: [
      'Start with one solvable puzzle and show its objective.',
      'Use clicks or keys for legal moves. Show feedback, check the solution and allow reset.',
    ],
  },
];

function enhanceFreeGamePrompt(request) {
  if (typeof request !== 'string' || request.length > 100) return null;
  const genreText = request.normalize('NFC').toLowerCase().trim()
    .replace(/[.!?。！？]+$/u, '').trim()
    .replace(/^(?:(?:(?:please\s+)?(?:make|create|build)(?:\s+me)?\s+(?:an?\s+)?)|(?:(?:간단한|작은|재밌는)\s+))+/u, '')
    .replace(/(?:\s*게임(?:을)?\s*)?(?:만들어\s*(?:줘|주세요)|제작해\s*(?:줘|주세요))$/u, '').trim()
    .replace(/\s+(?:game|게임)(?:을)?(?:\s+please)?$/u, '').trim();
  const found = genres.find(genre => genre.match.test(genreText));
  return found ? {genre: found.name, goals: found.goals.slice()} : null;
}

function findMissingGenreLogic(genre, code) {
  if (genre === 'collection') {
    const problems = [];
    const usesTapForMovement = /\binput\s*\.\s*pressed\s*\.\s*includes\s*\(\s*['"](?:Arrow(?:Up|Down|Left|Right)|Key[WASD])['"]/u;
    if (usesTapForMovement.test(code) && !/\binput\s*\.\s*keys\b/u.test(code)) {
      problems.push('Read held directional keys using input.keys for continuous movement.');
    }
    if (/\b(?:collectedCount|score)\s*(?:===|>=)\s*(?:targetCount|goal)\s*\)\s*\{?\s*(?:init|reset|resetGame)\s*\(/u.test(code)) {
      problems.push('Do not reset immediately at the collection goal. Show a win and wait for a restart action.');
    }
    return problems.join(' ') || null;
  }
  if (genre !== 'racing') return null;
  // Diagnose explicit empty state, without requiring a particular game structure.
  const source = code.replace(/^[\t ]*\/\/[^\r\n]*/gm, '');
  const emptyCars = /\b(?:let|const|var)\s+(opponents|rivals)\s*=\s*\[\s*\]\s*(?=;|$)/i.exec(source);
  if (emptyCars) {
    const name = emptyCars[1];
    const body = source.slice(emptyCars.index + emptyCars[0].length);
    const references = [...body.matchAll(new RegExp('\\b' + name + '\\b', 'g'))];
    if (references.every(reference => /^\s*\.\s*(?:forEach|map|length)\b/u.test(body.slice(reference.index + name.length)))) {
      return 'Start with at least one rival car and move it along the road.';
    }
  }
  const unusedLap = /\b(?:let|const|var)\s+(laps|lapCount|completedLaps)\s*=\s*0\s*(?=;|$)/i.exec(source);
  if (unusedLap && source.match(new RegExp('\\b' + unusedLap[1] + '\\b', 'g'))?.length === 1) {
    return 'Use the lap counter and advance it only after ordered checkpoints and finish-line crossing.';
  }
  return null;
}

module.exports = {enhanceFreeGamePrompt, findMissingGenreLogic};
