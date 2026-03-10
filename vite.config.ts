import fs from 'fs';
import path from 'path';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Route dev-server requests to the correct SPA entry point based on URL path. */
function multiSpaPlugin(): PluginOption {
  return {
    name: 'multi-spa-fallback',
    configureServer(server) {
      // Returned function runs AFTER Vite's built-in static-file middleware
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = req.originalUrl || req.url || '';
          // Skip API calls, actual files, and Vite internals
          if (url.startsWith('/api/') || url.includes('.') || url.startsWith('/@')) return next();

          let htmlFile: string;
          if (url.startsWith('/admin')) {
            htmlFile = 'admin/index.html';
          } else if (url.startsWith('/provider') || url.startsWith('/driver') || url.startsWith('/join')) {
            htmlFile = 'team/index.html';
          } else {
            htmlFile = 'index.html';
          }

          const filePath = path.resolve(__dirname, htmlFile);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const html = await server.transformIndexHtml(url, raw, url);
          res.setHeader('Content-Type', 'text/html');
          res.statusCode = 200;
          res.end(html);
        });
      };
    },
  };
}

export default defineConfig(({ mode: _mode }) => {
    return {
      appType: 'mpa',
      server: {
        port: 5000,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:3001',
            changeOrigin: true,
          },
        },
      },
      plugins: [react(), tailwindcss(), multiSpaPlugin()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        dedupe: ['react', 'react-dom'],
      },
      build: {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            admin: path.resolve(__dirname, 'admin/index.html'),
            team: path.resolve(__dirname, 'team/index.html'),
          },
        },
      },
    };
});
