import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    mainFields: ["module", "jsnext:main", "jsnext"],
  },
  build: {
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
        "ai",
        /^@ai-sdk\//,
        /^node:/,
      ],
    },
    outDir: ".vite/build",
    emptyOutDir: false,
  },
});
