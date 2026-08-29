import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const rootPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'))
const rootDeps = Object.keys(rootPkg.dependencies || {})
const workspaceDeps = [
  '@cowrangler/core',
  '@cowrangler/adapter-design',
  '@cowrangler/adapter-code'
]
const externalDeps = rootDeps.filter(dep => !workspaceDeps.includes(dep))

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        include: externalDeps,
        exclude: workspaceDeps
      })
    ],
    build: {
      rollupOptions: {
        input: { index: 'src/electron/main.ts' },
      },
    },
    resolve: {
      alias: {
        '@core': path.resolve(__dirname, '../../packages/core/src'),
        '@tools': path.resolve(__dirname, '../../packages/core/src/tools'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: 'src/electron/preload.ts' },
        // CommonJS'e sabitlenmiş çıktı — Electron'un sandbox'lı preload
        // yükleyicisi ESM `import` sözdizimini desteklemiyor (sandbox: true
        // ile "Cannot use import statement outside a module" hatası verir).
        output: { format: 'cjs', entryFileNames: '[name].js' },
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
