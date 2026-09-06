import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const rootPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'))
const desktopPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))
const workspaceDeps = [
  '@cowrangler/core',
  '@cowrangler/adapter-design',
  '@cowrangler/adapter-code'
]
// electron-vite only externalizes the dependencies it can see from the config
// package by default. This config lives in apps/desktop while the repo package
// lives two levels above it, so dependencies declared only by the desktop app
// (notably @remotion/bundler and @remotion/renderer) used to be rolled into the
// Electron main bundle. Remotion then tried to webpack that transformed bundle
// and failed on Rollup's generated `node:module` shim with UnhandledSchemeError.
// Keep all third-party runtime packages as real Node dependencies; only bundle
// our workspace packages so their TypeScript sources remain available to Vite.
const externalDeps = Array.from(new Set([
  ...Object.keys(rootPkg.dependencies || {}),
  ...Object.keys(desktopPkg.dependencies || {}),
])).filter(dep => !workspaceDeps.includes(dep))

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
