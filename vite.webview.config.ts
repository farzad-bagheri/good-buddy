import { resolve } from "node:path";
import { defineConfig } from "vite";

const workspaceRoot = import.meta.dirname;

export default defineConfig({
  root: resolve(workspaceRoot, "webview/chat"),
  base: "./",
  build: {
    target: "es2022",
    outDir: resolve(workspaceRoot, "out/webview/chat"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        "chat-shell": resolve(workspaceRoot, "webview/chat/chat-shell.html"),
      },
      output: {
        entryFileNames: "assets/chat.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
