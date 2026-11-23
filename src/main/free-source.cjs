const {Script} = require('node:vm');

const freeSourceLimits = Object.freeze({title: 80, summary: 400, code: 24_000, prompt: 2_000});

function validateFreeSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const fields = ['title', 'summary', 'code'];
  if (fields.some(field => typeof source[field] !== 'string' || source[field].length > freeSourceLimits[field])) {
    return null;
  }
  const title = source.title.trim().normalize('NFC');
  const summary = source.summary.trim();
  const code = source.code.trim();
  if (!title || title.length > freeSourceLimits.title || /[\u0000-\u001f\u007f-\u009f]/u.test(title) ||
      !summary || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(summary) ||
      !/^function\s+createGame\s*\(/u.test(code)) return null;
  try {
    // Compile for syntax checking only. The main process never evaluates generated source.
    new Script('"use strict";\n' + code, {filename: 'generated-game.js'});
  } catch {
    return null;
  }
  return {title, summary, code};
}

module.exports = {freeSourceLimits, validateFreeSource};
