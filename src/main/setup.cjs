const path = require('node:path');
const {mkdir, stat} = require('node:fs/promises');

const downloadPages = new Map([
  ['ollama', 'https://ollama.com/download/windows'],
  ['godot', 'https://godotengine.org/download/archive/4.7.2-stable/'],
]);

/** @param {{shell: Pick<typeof import('electron').shell, 'openExternal' | 'openPath'>, userData: string, enginePath?: string}} options */
function createSetupActions({shell, userData, enginePath}) {
  /** @param {unknown} kind */
  return async function openSetupResource(kind) {
    if (typeof kind !== 'string') return false;
    try {
      if (kind === 'godot-folder') {
        const folder = enginePath ? path.dirname(enginePath) : path.join(userData, 'runtime');
        if (!enginePath) await mkdir(folder, {recursive: true});
        if (!(await stat(folder)).isDirectory()) return false;
        return (await shell.openPath(folder)) === '';
      }

      const url = downloadPages.get(kind);
      if (!url) return false;
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  };
}

module.exports = {createSetupActions};
