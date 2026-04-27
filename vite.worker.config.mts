import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    sourcemap: false,
    minify: "esbuild",
    lib: {
      entry: "src/workers/tsc_worker.ts",
      formats: ["es"],
      fileName: () => "tsc_worker.js",
    },
    rollupOptions: {
      external: ["electron", "typescript", /^node:/],
    },
    outDir: ".vite/build",
    emptyOutDir: false,
  },
});
