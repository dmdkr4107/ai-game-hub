const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const {isTrustedDevUrl}=require('../src/main/security.cjs');

test('one-click launcher builds and opens the compiled UI',()=>{
 const bat=read('START_AI_GAME_HUB.bat');
 const build=bat.indexOf('call npm.cmd run build');
 const start=bat.indexOf('call npm.cmd start');
 assert.ok(build!==-1 && start>build);
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts.start,'electron .');
});

test('compiled UI URL encodes literal percent signs in an extraction path',()=>{
 const {pathToFileURL, fileURLToPath}=require('node:url');
 const indexPath=path.join(root,'AI%20Game Hub','dist','index.html');
 const fileUrl=pathToFileURL(indexPath);
 assert.match(fileUrl.href,/AI%2520Game%20Hub/);
 assert.equal(fileURLToPath(fileUrl),indexPath);
 assert.match(read('src/main/main.cjs'),/pathToFileURL\(indexPath\)\.href/);
});
test('loopback dev server is restricted and Electron accepts exactly same address',()=>{
 const vite=read('vite.config.ts');
 assert.match(vite,/host: '127\.0\.0\.1', port: 5173, strictPort: true/);
 assert.equal(isTrustedDevUrl('http://127.0.0.1:5173/'),true);
 assert.equal(isTrustedDevUrl('http://0.0.0.0:5173/'),false);
 assert.equal(isTrustedDevUrl('http://localhost:5173/'),false);
});
test('npm dev owns the strict-port Vite listener before starting Electron',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts.dev,'node scripts/dev.mjs');
 const runner=read('scripts/dev.mjs');
 assert.match(runner,/http:\/\/127\.0\.0\.1:5173\//);
 assert.match(runner,/await server\.listen\(\);[\s\S]*?await fetch\(devUrl,[\s\S]*?electron = spawn\(/);
 assert.match(runner,/AI_HUB_DEV_URL: devUrl/);
 assert.match(runner,/await server\?\.close\(\)/);
});

test('Vite transforms the development entry page in a root with a literal percent escape', async ()=>{
 const os=require('node:os');
 const {createServer}=await import('vite');
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ai-hub-%EA-'));
 fs.writeFileSync(path.join(fixture,'index.html'), '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
 let server;
 try {
   server=await createServer({
     root: fixture,
     configFile: path.join(root,'vite.config.ts'),
     logLevel: 'silent',
     optimizeDeps: {noDiscovery:true},
     server: {port:0, hmr:false, watch:null},
   });
   await server.listen();
   const {port}=server.httpServer.address();
   const response=await fetch(`http://127.0.0.1:${port}/`, {signal:AbortSignal.timeout(5000)});
   assert.equal(response.status,200);
   const html=await response.text();
   assert.match(html, /<div id="root"><\/div>/);
   assert.match(html, /\/@vite\/client/);
 } finally {
   await server?.close();
   fs.rmSync(fixture,{recursive:true,force:true});
 }
});
