const {Script} = require('node:vm');
const {freeSourceLimits, validateFreeSource} = require('./free-source.cjs');

const maxReplyLength = 6 * (freeSourceLimits.code + freeSourceLimits.title + freeSourceLimits.summary) + 128;
const maxEndCandidates = 48;
const supportedFenceLabels = new Set(['', 'javascript', 'js', 'json', 'text', 'plaintext', 'txt']);
const jsonFields = new Set(['title', 'summary', 'code']);
const invalidSource = 'Return a complete JavaScript function createGame({canvas,ctx,width,height}) with valid syntax.';

function readFences(text) {
  const blocks = [];
  let current;
  let sawFence = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    const fence = /^[ \t]{0,3}(`{3,}|~{3,})([^\r\n]*)/u.exec(line);
    if (fence) {
      const [, marker, tail] = fence;
      if (!current) {
        const label = tail.trim().toLowerCase().split(/\s/u, 1)[0];
        current = {marker, label, offset: offset + line.length + 1};
        sawFence = true;
      } else if (marker[0] === current.marker[0] && marker.length >= current.marker.length && !tail.trim()) {
        if (supportedFenceLabels.has(current.label)) {
          blocks.push(text.slice(current.offset, offset).trim());
        }
        current = undefined;
      }
    }
    offset += line.length + 1;
  }
  return {blocks, sawFence, partial: supportedFenceLabels.has(current?.label)};
}

function readJsonReply(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !jsonFields.has(key))) {
    return {issue: 'Return only title, summary, and code in the game JSON.'};
  }
  const source = validateFreeSource(value);
  if (source) return {source};
  if (typeof value.code === 'string' && value.code.length <= freeSourceLimits.code) {
    const {blocks, partial} = readFences(value.code);
    if (!partial && blocks.length === 1) {
      const source = validateFreeSource({...value, code: blocks[0]});
      if (source) return {source};
    }
  }
  return {issue: invalidSource};
}

function readPlainFunction(text, metadata, fenced = false) {
  const starts = text.matchAll(/(?:^|[\r\n]|:[ \t]+)[ \t]*(?:["']code["'][ \t]*:[ \t]*["']?)?(function\s+createGame\s*\()/gu);
  const {value: match} = starts.next();
  if (!match) return {issue: invalidSource};
  if (!starts.next().done) return {issue: 'Return one complete createGame function.'};

  const start = match.index + match[0].indexOf(match[1]);
  if (fenced || (start === 0 && /[};]$/u.test(text))) {
    const source = validateFreeSource({...metadata, code: text});
    if (source) return {source};
  }
  const snippet = text.slice(start, start + freeSourceLimits.code);
  const candidateEnds = [];
  for (let end = snippet.lastIndexOf('}'); end > 0 && candidateEnds.length < maxEndCandidates;
    end = snippet.lastIndexOf('}', end - 1)) {
    candidateEnds.push(end + 1);
  }
  for (const end of candidateEnds.reverse()) {
    const code = snippet.slice(0, end);
    try {
      // An expression wrapper rules out unrelated statements after the function.
      // Parsing through V8 handles braces in strings, regexes, templates and comments.
      new Script('"use strict";\n(\n' + code + '\n);', {filename: 'generated-game-snippet.js'});
    } catch {
      continue;
    }
    const source = validateFreeSource({...metadata, code});
    if (source) return {source};
  }
  return {issue: invalidSource};
}

function extractFreeGameReply(text, metadata) {
  if (typeof text !== 'string') return {issue: 'Ollama returned no game source.'};
  if (text.length > maxReplyLength) return {issue: 'The game response exceeds the size limit.'};
  const response = text.trim();
  if (!response) return {issue: 'Ollama returned no game source.'};
  const json = readJsonReply(response);
  if (json) return json;

  const {blocks, sawFence, partial} = readFences(response);
  if (partial) return {issue: 'The Markdown code fence did not close. Return a complete game.'};
  if (!sawFence) return readPlainFunction(response, metadata);

  const valid = [];
  let issue = invalidSource;
  for (const body of blocks) {
    const json = readJsonReply(body);
    const parsed = json ?? readPlainFunction(body, metadata, true);
    if (parsed.source) valid.push(parsed.source);
    else issue = parsed.issue;
    if (valid.length > 1) return {issue: 'Return one game rather than multiple code blocks.'};
  }
  return valid.length === 1 ? {source: valid[0]} : {issue};
}

module.exports = {extractFreeGameReply};
