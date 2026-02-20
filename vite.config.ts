import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode: _mode }) => {
    return {
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
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
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
