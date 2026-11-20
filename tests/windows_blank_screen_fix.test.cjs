const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const {isTrustedDevUrl}=require('../src/main/security.cjs');

test('one-click launcher builds and opens the compiled UI',()=>{
 const bat=read('START_AI_GAME_HUB.bat');
 assert.ok(bat.indexOf('call npm start')>bat.indexOf('call npm run build'));
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts.start,'electron .');
});

test('compiled UI URL encodes literal percent signs in an extraction path',()=>{
 const {pathToFileURL, fileURLToPath}=require('node:url');
 const indexPath=path.join(root,'AI%20Game Hub','dist','index.html');
 const fileUrl=pathToFileURL(indexPath);
 assert.match(fileUrl.href,/AI%2520Game%20Hub/);
 assert.equal(fileURLToPath(fileUrl),indexPath);
 assert.match(read('src/main/main.cjs'),/win\.loadURL\(pathToFileURL\(indexPath\)\.href\)/);
});
test('loopback dev server is restricted and Electron accepts exactly same address',()=>{
 const vite=read('vite.config.ts');
 assert.match(vite,/host: '127\.0\.0\.1', port: 5173, strictPort: true/);
 assert.equal(isTrustedDevUrl('http://127.0.0.1:5173/'),true);
 assert.equal(isTrustedDevUrl('http://0.0.0.0:5173/'),false);
 assert.equal(isTrustedDevUrl('http://localhost:5173/'),false);
});
test('npm dev command actually connects local dev server and Electron',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts.dev,/vite --host 127\.0\.0\.1/);
 assert.match(pkg.scripts.dev,/wait-on http:\/\/127\.0\.0\.1:5173/);
 assert.match(pkg.scripts.dev,/AI_HUB_DEV_URL=http:\/\/127\.0\.0\.1:5173 electron \./);
 assert.match(read('src/main/main.cjs'),/win\.loadURL\(devUrl\)/);
});
