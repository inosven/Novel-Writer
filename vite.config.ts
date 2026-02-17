import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { resolve } from 'path';

const __dirname = import.meta.dirname;

export default defineConfig({
  root: './app',
  plugins: [
    react(),
    electron({
      main: {
        entry: resolve(__dirname, 'electron/main.ts'),
        onstart(args) {
          // Start electron without restarting on every file change
          args.startup();
        },
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: [
                'electron',
                'electron-store',
                'better-sqlite3',
                '@anthropic-ai/sdk',
                'openai',
                'ollama',
                'vectordb',
                '@lancedb/lancedb',
                'apache-arrow',
              ],
            },
          },
        },
      },
      preload: {
        input: resolve(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './app/src'),
      '@components': resolve(__dirname, './app/src/components'),
      '@pages': resolve(__dirname, './app/src/pages'),
      '@stores': resolve(__dirname, './app/src/stores'),
      '@hooks': resolve(__dirname, './app/src/hooks'),
      '@styles': resolve(__dirname, './app/src/styles'),
      '@types': resolve(__dirname, './app/src/types'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, './app/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Ignore directories that might be modified during runtime
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/.state/**',
        '**/.claude/**',
        '**/characters/**',
        '**/chapters/**',
        '**/memory/**',
        '**/outline.md',
        '**/*.sqlite*',
        '**/*.lance/**',
      ],
    },
  },
  css: {
    postcss: resolve(__dirname, 'postcss.config.js'),
  },
});
