import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
  build: {
    sourcemap: false,
    minify: "esbuild",
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "main.cjs",
    },
    rollupOptions: {
      external: [
        "electron",
        "@libsql/client",
        "isomorphic-git",
        "update-electron-app",
        "ai",
        /^@ai-sdk\//,
        /^node:/,
      ],
    },
    outDir: ".vite/build",
    emptyOutDir: false,
  },
});
