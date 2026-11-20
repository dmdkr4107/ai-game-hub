import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Vite's development-only React refresh injects an inline bootstrap script.
// The packaged app keeps the restrictive CSP declared in index.html.
export default defineConfig({
  plugins: [react(), {
    name: 'dev-only-react-refresh-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
    },
  }],
  base: './',
  server: {host: '127.0.0.1', port: 5173, strictPort: true},
});
