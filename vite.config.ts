import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'electron-dev-html',
    apply: 'serve',
    configureServer(server) {
      if (!server.config.root.includes('%')) return;

      // The normal Vite HTML transform decodes the root and URL together.
      // Its /@fs/ form can instead decode an explicitly encoded file path.
      const indexPath = `${server.config.root}/index.html`;
      const htmlPath = `/@fs/${encodeURI(indexPath).replaceAll('#', '%23').replaceAll('?', '%3F')}`;
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if ((req.method !== 'GET' && req.method !== 'HEAD') ||
              req.url !== '/index.html' || req.headers['sec-fetch-dest'] === 'script') {
            return next();
          }

          try {
            const source = await readFile(indexPath, 'utf8');
            const html = await server.transformIndexHtml(htmlPath, source, req.originalUrl);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(html);
          } catch (error) {
            next(error);
          }
        });
      };
    },
    transformIndexHtml(html) {
      // React refresh injects an inline bootstrap and uses a loopback socket.
      return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
        .replace("connect-src 'none';", "connect-src 'self' ws://127.0.0.1:5173;");
    },
  }],
  base: './',
  server: {host: '127.0.0.1', port: 5173, strictPort: true},
});
