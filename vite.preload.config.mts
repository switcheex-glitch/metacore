import { defineConfig } from "vite";
import path from "node:path";
import fs from "node:fs";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    lib: {
      entry: "src/preload.ts",
      formats: ["cjs"],
      fileName: () => "preload.cjs",
    },
    rollupOptions: {
      external: ["electron", /^node:/],
    },
    outDir: ".vite/build",
    emptyOutDir: false,
  },
  plugins: [
    {
      name: "force-preload-cjs-extension",
      writeBundle(options) {
        const dir = options.dir ?? path.resolve(__dirname, ".vite/build");
        const jsPath = path.join(dir, "preload.js");
        const cjsPath = path.join(dir, "preload.cjs");
        if (fs.existsSync(jsPath)) {
          fs.renameSync(jsPath, cjsPath);
        }
      },
    },
  ],
});
