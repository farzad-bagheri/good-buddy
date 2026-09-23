import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "node22",
    ssr: true,
    lib: {
      entry: "src/extension.ts",
      formats: ["cjs"],
      fileName: "extension",
    },
    rollupOptions: {
      external: ["vscode"],
    },
    outDir: "out",
  },
  resolve: {
    tsconfigPaths: true,
  },
});
