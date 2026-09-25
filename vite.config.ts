import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

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
      output: {
        codeSplitting: false,
      },
    },
    outDir: "out",
  },
  ssr: {
    // Vite externalizes node_modules deps for SSR builds by default; bundle
    // them all (except "vscode", excluded above) since we package without
    // dependencies.
    noExternal: true,
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/extension.ts"],
    },
  },
});
