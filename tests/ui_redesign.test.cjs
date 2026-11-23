const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('renderer source uses the preload boundary and bundled styling', () => {
  const root = path.join(__dirname, '..', 'src', 'renderer');
  for (const entry of fs.readdirSync(root, {recursive: true, withFileTypes: true})) {
    if (!entry.isFile() || !/\.(tsx?|css)$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|@import\s+url\(['"]?https?:/, file);
  }
});
