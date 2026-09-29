import { resolve } from "node:path";
import { defineConfig } from "vite";

const appRoot = import.meta.dirname;
const workspaceRoot = resolve(appRoot, "../..");

export default defineConfig({
  root: appRoot,
  base: "./",
  build: {
    target: "es2022",
    outDir: resolve(workspaceRoot, "out/webview/chat"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        index: resolve(appRoot, "index.html"),
      },
      output: {
        entryFileNames: "assets/chat.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});