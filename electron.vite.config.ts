import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: 'src/electron/main.ts' },
        external: [
          'electron',
          'better-sqlite3',
          'fs',
          'path',
          'os',
          'crypto',
          'child_process',
          'readline',
          'stream',
          'util',
          'events',
          'net',
          'http',
          'https',
          'url',
          'querystring',
          'buffer',
          'assert',
          'zlib',
        ],
      },
    },
    resolve: {
      alias: {
        '@core': path.resolve(__dirname, 'src/core'),
        '@tools': path.resolve(__dirname, 'src/tools'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: 'src/electron/preload.ts' },
      },
    },
  },
  renderer: {
    root: 'src/desktop',
    build: {
      rollupOptions: {
        input: { index: 'src/desktop/index.html' },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/desktop'),
      },
    },
  },
})
