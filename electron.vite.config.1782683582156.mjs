// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";
var __electron_vite_injected_dirname = "/sessions/amazing-quirky-galileo/mnt/co-wrangler";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: "src/electron/main.ts" },
        external: [
          "electron",
          "better-sqlite3",
          "fs",
          "path",
          "os",
          "crypto",
          "child_process",
          "readline",
          "stream",
          "util",
          "events",
          "net",
          "http",
          "https",
          "url",
          "querystring",
          "buffer",
          "assert",
          "zlib"
        ]
      }
    },
    resolve: {
      alias: {
        "@core": path.resolve(__electron_vite_injected_dirname, "src/core"),
        "@tools": path.resolve(__electron_vite_injected_dirname, "src/tools")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: "src/electron/preload.ts" }
      }
    }
  },
  renderer: {
    root: "src/desktop",
    build: {
      rollupOptions: {
        input: { index: "src/desktop/index.html" }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__electron_vite_injected_dirname, "src/desktop")
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
