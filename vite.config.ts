import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';
import path from 'node:path';

const apiTarget = process.env.VITE_API_ORIGIN ?? 'http://localhost:8787';

function createBackendProxy(): ProxyOptions {
  return {
    target: apiTarget,
    changeOrigin: false,
    xfwd: true,
    configure: (proxy) => {
      proxy.on('error', (_err, _req, res) => {
        if ('writeHead' in res && typeof res.writeHead === 'function' && !res.headersSent) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Server unreachable',
              code: 'SERVER_UNREACHABLE',
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': createBackendProxy(),
      '/oauth2': createBackendProxy(),
      '/login/oauth2': createBackendProxy(),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
