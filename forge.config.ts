import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { PublisherGithub } from "@electron-forge/publisher-github";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import fs from "node:fs";
import path from "node:path";

// Runtime dependencies that are kept external in the Vite bundle and therefore
// need their node_modules shipped alongside the app.
const RUNTIME_EXTERNALS = [
  "@libsql/client",
  "@libsql/core",
  "@libsql/isomorphic-fetch",
  "@libsql/isomorphic-ws",
  "@libsql/win32-x64-msvc",
  "@libsql/linux-x64-gnu",
  "@libsql/linux-x64-musl",
  "@libsql/darwin-x64",
  "@libsql/darwin-arm64",
  "isomorphic-git",
  "electron-squirrel-startup",
  "zod",
  "ai",
  "@ai-sdk/anthropic",
  "@ai-sdk/google",
  "@ai-sdk/openai",
  "@ai-sdk/provider",
  "@ai-sdk/provider-utils",
  "@ai-sdk/ui-utils",
  "typescript",
];

function copyDirRec(src: string, dst: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRec(s, d);
    else if (entry.isSymbolicLink()) {
      try {
        const target = fs.readlinkSync(s);
        fs.symlinkSync(target, d);
      } catch {
        fs.copyFileSync(s, d);
      }
    } else fs.copyFileSync(s, d);
  }
}

// Resolve the installed directory of a package relative to a starting dir,
// walking up through node_modules like Node's resolver. Returns null if absent.
function findPkgDir(pkgName: string, fromDir: string): string | null {
  let dir = fromDir;
  while (true) {
    const candidate = path.join(dir, "node_modules", pkgName);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Collect a package and all its transitive runtime dependencies (including
// present optionalDependencies). Returns a map from pkgName -> installed dir.
function collectDepTree(roots: string[], projectDir: string): Map<string, string> {
  const resolved = new Map<string, string>();
  const stack: Array<{ name: string; from: string }> = roots.map((n) => ({
    name: n,
    from: projectDir,
  }));
  while (stack.length > 0) {
    const { name, from } = stack.pop()!;
    if (resolved.has(name)) continue;
    const dir = findPkgDir(name, from);
    if (!dir) continue;
    resolved.set(name, dir);
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.optionalDependencies ?? {}),
      };
      for (const depName of Object.keys(deps)) {
        if (!resolved.has(depName)) stack.push({ name: depName, from: dir });
      }
    } catch {
      // ignore bad package.json
    }
  }
  return resolved;
}

const config: ForgeConfig = {
  packagerConfig: {
    name: "Metacore",
    executableName: "metacore",
    asar: false,
    icon: "./assets/icon",
    appBundleId: "app.metacore",
    extraResource: ["./scaffold", "./drizzle", "./assets"],
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      // Vite externals aren't copied into the packaged app by default.
      // Walk the full dependency tree of each runtime external and copy
      // every package into the app's node_modules so requires resolve.
      const targetNodeModules = path.join(buildPath, "node_modules");
      const tree = collectDepTree(RUNTIME_EXTERNALS, __dirname);
      for (const [name, src] of tree) {
        const dst = path.join(targetNodeModules, name);
        if (!fs.existsSync(dst)) copyDirRec(src, dst);
      }
      // Minimal package.json so Node resolves subpath exports inside asar.
      const appPkgPath = path.join(buildPath, "package.json");
      if (fs.existsSync(appPkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(appPkgPath, "utf8"));
        pkg.dependencies = pkg.dependencies ?? {};
        for (const p of tree.keys()) pkg.dependencies[p] = "*";
        fs.writeFileSync(appPkgPath, JSON.stringify(pkg, null, 2));
      }
    },
  },
  makers: [
    new MakerSquirrel({ name: "Metacore", setupExe: "Metacore-Setup.exe" }),
    new MakerZIP({}, ["darwin"]),
    new MakerDMG({ name: "Metacore" }, ["darwin"]),
    new MakerDeb({ options: { name: "metacore", productName: "Metacore" } }),
  ],
  publishers: [
    new PublisherGithub({
      repository: { owner: "metacore-ltd", name: "metacore" },
      prerelease: false,
      draft: false,
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.mts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.mts", target: "preload" },
        { entry: "src/workers/tsc_worker.ts", config: "vite.worker.config.mts", target: "main" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.mts" }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
    }),
  ],
};

export default config;
