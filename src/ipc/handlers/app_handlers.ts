import { z } from "zod";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";
import { registerInvokeHandler } from "../ipc_host";
import {
  createAppFromScaffold,
  importExistingApp,
  listApps,
  getAppBySlug,
  renameApp,
  deleteApp,
} from "@/main/app_manager";
import {
  startApp,
  stopApp,
  restartApp,
  getAppStatus,
  getRecentLogs,
} from "@/main/app_runner";
import type { AppStatus, AppLogEntry } from "../ipc_types";

export type FileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size?: number;
  children?: FileNode[];
};

const createSchema = z.object({ name: z.string().trim().max(80).optional() }).strict();
const importSchema = z
  .object({
    sourceDir: z.string().trim().min(1),
    name: z.string().trim().max(80).optional(),
  })
  .strict();
const slugSchema = z.object({ slug: z.string().min(1).max(128) }).strict();
const deleteSchema = z
  .object({ slug: z.string().min(1).max(128), removeFiles: z.boolean().default(true) })
  .strict();
const renameSchema = z
  .object({ slug: z.string().min(1).max(128), name: z.string().trim().min(1).max(80) })
  .strict();
const logsSchema = z
  .object({ slug: z.string().min(1).max(128), limit: z.number().int().min(1).max(1000).optional() })
  .strict();
const listFilesSchema = z.object({ slug: z.string().min(1).max(128) }).strict();
const readFileSchema = z
  .object({ slug: z.string().min(1).max(128), path: z.string().min(1).max(1024) })
  .strict();

const FILES_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".vite",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".DS_Store",
]);

const MAX_TREE_ENTRIES = 1500;
const MAX_READ_BYTES = 500_000;

function buildTree(absRoot: string): FileNode {
  let budget = MAX_TREE_ENTRIES;
  function walk(dir: string, rel: string): FileNode {
    const children: FileNode[] = [];
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (budget <= 0) break;
      if (FILES_SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      budget -= 1;
      if (entry.isDirectory()) {
        children.push(walk(abs, nextRel));
      } else if (entry.isFile()) {
        let size: number | undefined;
        try {
          size = fs.statSync(abs).size;
        } catch {
          size = undefined;
        }
        children.push({ name: entry.name, path: nextRel, kind: "file", size });
      }
    }
    const name = rel ? rel.split("/").pop()! : path.basename(absRoot);
    return { name, path: rel, kind: "dir", children };
  }
  return walk(absRoot, "");
}

function resolveInsideProject(root: string, rel: string): string {
  const normalized = rel.replace(/^[\\/]+/, "").replace(/\\/g, "/");
  const abs = path.resolve(root, normalized);
  const base = path.resolve(root);
  if (!abs.startsWith(base + path.sep) && abs !== base) {
    throw new Error(`Path escapes project directory: ${rel}`);
  }
  return abs;
}

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tif", ".tiff",
  ".mp3", ".mp4", ".mov", ".webm", ".wav", ".ogg",
  ".zip", ".tar", ".gz", ".7z", ".rar",
  ".pdf", ".exe", ".dll", ".so", ".dylib",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
]);

export function registerAppHandlers() {
  registerInvokeHandler("app:list", async () => {
    return listApps();
  });

  registerInvokeHandler("app:create", async (_event, payload) => {
    const input = createSchema.parse(payload ?? {});
    const { app } = await createAppFromScaffold(input);
    return app;
  });

  registerInvokeHandler("app:import", async (_event, payload) => {
    const input = importSchema.parse(payload);
    const { app } = await importExistingApp(input);
    return app;
  });

  registerInvokeHandler("app:pickFolder", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, {
          title: "Import existing app",
          properties: ["openDirectory"],
        })
      : await dialog.showOpenDialog({
          title: "Import existing app",
          properties: ["openDirectory"],
        });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true as const };
    }
    return { canceled: false as const, path: result.filePaths[0]! };
  });

  registerInvokeHandler("app:delete", async (_event, payload) => {
    const { slug, removeFiles } = deleteSchema.parse(payload);
    await stopApp(slug);
    await deleteApp(slug, removeFiles);
    return { ok: true };
  });

  registerInvokeHandler("app:rename", async (_event, payload) => {
    const { slug, name } = renameSchema.parse(payload);
    await renameApp(slug, name);
    return { ok: true };
  });

  registerInvokeHandler("app:start", async (_event, payload) => {
    const { slug } = slugSchema.parse(payload);
    const row = await getAppBySlug(slug);
    if (!row) throw new Error(`App not found: ${slug}`);
    return startApp(slug, row.path);
  });

  registerInvokeHandler("app:stop", async (_event, payload) => {
    const { slug } = slugSchema.parse(payload);
    await stopApp(slug);
    return { ok: true };
  });

  registerInvokeHandler("app:restart", async (_event, payload) => {
    const { slug } = slugSchema.parse(payload);
    const row = await getAppBySlug(slug);
    if (!row) throw new Error(`App not found: ${slug}`);
    return restartApp(slug, row.path);
  });

  registerInvokeHandler("app:status", (_event, payload): AppStatus => {
    const { slug } = slugSchema.parse(payload);
    return getAppStatus(slug);
  });

  registerInvokeHandler("app:logs", (_event, payload): AppLogEntry[] => {
    const { slug, limit } = logsSchema.parse(payload);
    return getRecentLogs(slug, limit);
  });

  registerInvokeHandler("app:listFiles", async (_event, payload): Promise<FileNode> => {
    const { slug } = listFilesSchema.parse(payload);
    const row = await getAppBySlug(slug);
    if (!row) throw new Error(`App not found: ${slug}`);
    if (!fs.existsSync(row.path)) {
      return { name: row.name, path: "", kind: "dir", children: [] };
    }
    const tree = buildTree(row.path);
    return { ...tree, name: row.name };
  });

  registerInvokeHandler(
    "app:readFile",
    async (
      _event,
      payload,
    ): Promise<{ path: string; content: string; truncated: boolean; binary: boolean; size: number }> => {
      const { slug, path: relPath } = readFileSchema.parse(payload);
      const row = await getAppBySlug(slug);
      if (!row) throw new Error(`App not found: ${slug}`);
      const abs = resolveInsideProject(row.path, relPath);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        throw new Error(`File not found: ${relPath}`);
      }
      const ext = path.extname(abs).toLowerCase();
      const size = fs.statSync(abs).size;
      if (BINARY_EXT.has(ext)) {
        return { path: relPath, content: "", truncated: false, binary: true, size };
      }
      const buf = await fsp.readFile(abs);
      const truncated = buf.length > MAX_READ_BYTES;
      const slice = truncated ? buf.slice(0, MAX_READ_BYTES) : buf;
      return {
        path: relPath,
        content: slice.toString("utf8"),
        truncated,
        binary: false,
        size,
      };
    },
  );

  const genSchema = z
    .object({
      prompt: z.string().trim().min(3).max(1000),
      mode: z.enum(["preview", "refine"]),
    })
    .strict();
  const sceneSchema = z
    .object({
      prompt: z.string().trim().min(3).max(1000),
      modelId: z.string().optional(),
    })
    .strict();
  registerInvokeHandler("threed:genScene", async (_event, payload) => {
    const { prompt, modelId } = sceneSchema.parse(payload);
    const { getModelClient } = await import("@/ai/get_model_client");
    const { generateText } = await import("ai");
    const { getPublicSettings } = await import("@/main/settings");
    let chosen = modelId ?? "";
    if (!chosen) {
      const s = getPublicSettings();
      chosen = s.defaultChatMode === "agent" ? "anthropic:claude-sonnet-4-6" : "anthropic:claude-sonnet-4-6";
    }
    const model = await getModelClient(chosen).catch(() => null);
    if (!model) {
      return {
        scene: null,
        error: "Не удалось получить AI-модель. Подключите API-ключ в Настройках.",
      };
    }
    const system = `You design 3D scenes as JSON built from primitives. Output ONLY a single JSON object, no prose, no markdown fences.
Schema:
{
  "name": string,
  "background": "#rrggbb",
  "meshes": [
    {
      "geometry": "box"|"sphere"|"cylinder"|"cone"|"torus"|"plane"|"tetrahedron"|"octahedron"|"icosahedron"|"torusKnot",
      "params": { "width"?: number, "height"?: number, "depth"?: number, "radius"?: number, "radiusTop"?: number, "radiusBottom"?: number, "tube"?: number, "detail"?: number },
      "color": "#rrggbb",
      "metalness": 0..1,
      "roughness": 0..1,
      "emissive"?: "#rrggbb",
      "emissiveIntensity"?: 0..2,
      "position": [x,y,z],
      "rotation": [x,y,z]  // radians
    }
  ]
}
Rules:
- Use 3-60 meshes.
- Compose a recognisable object from the prompt. Use transformations and colours to create a visually appealing shape.
- Coordinates roughly within -3..3, scene fits in a 6x6x6 box.
- Use soft realistic colours. Metalness 0-0.4 unless metallic object requested. Roughness 0.3-0.8.
- Always include at least one ground plane at y=-1 with matte colour unless the scene is floating (space/underwater).
- Be creative: for "character" compose head+body+limbs from spheres+cylinders. For "building" stack boxes with details.`;
    const userPrompt = `Create a 3D scene: ${prompt}`;
    try {
      const result = await generateText({
        model,
        system,
        prompt: userPrompt,
        temperature: 0.7,
        maxTokens: 4000,
      });
      const text = result.text.trim();
      // Strip common markdown fence leftovers
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart < 0 || jsonEnd < 0) {
        return { scene: null, error: "AI вернул ответ без JSON" };
      }
      const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      return { scene: parsed };
    } catch (e) {
      return { scene: null, error: `AI не смог сгенерировать сцену: ${(e as Error).message}` };
    }
  });

  registerInvokeHandler("threed:generate", async (_event, payload) => {
    const { prompt } = genSchema.parse(payload);
    const OVERALL_DEADLINE = Date.now() + 3 * 60 * 1000;
    const withTimeout = <T>(p: Promise<T>, ms: number, label: string) =>
      Promise.race<T>([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(label + " timeout")), ms)),
      ]);

    // Text → image (Pollinations Flux, free, no key).
    const imageSeed = Math.floor(Math.random() * 10_000_000);
    const imageUrl =
      "https://image.pollinations.ai/prompt/" +
      encodeURIComponent(
        `${prompt}, single object on plain white background, centered, product photography, 3d render`,
      ) +
      `?width=768&height=768&seed=${imageSeed}&nologo=true&model=flux`;

    const imgCtrl = new AbortController();
    const imgTimer = setTimeout(() => imgCtrl.abort(), 45_000);
    let imageBuf: Buffer;
    try {
      const imageRes = await fetch(imageUrl, { signal: imgCtrl.signal });
      clearTimeout(imgTimer);
      if (!imageRes.ok) {
        return { url: "", name: "", error: `Pollinations вернул ${imageRes.status}. Попробуйте ещё раз.` };
      }
      imageBuf = Buffer.from(await imageRes.arrayBuffer());
    } catch (e) {
      clearTimeout(imgTimer);
      return {
        url: "",
        name: "",
        error: `Не удалось сгенерировать картинку: ${(e as Error).message}. Попробуйте ещё раз.`,
      };
    }

    const { Client } = await import("@gradio/client");
    const spaces = [
      "tencent/Hunyuan3D-2",
      "stabilityai/stable-fast-3d",
      "TencentARC/InstantMesh",
      "stabilityai/TripoSR",
      "dylanebert/LGM-tiny",
    ];
    const errors: string[] = [];
    for (const space of spaces) {
      if (Date.now() > OVERALL_DEADLINE) break;
      try {
        const client = await withTimeout(Client.connect(space), 30_000, `connect ${space}`);
        const imgBlob = new Blob([imageBuf], { type: "image/png" });
        type PredictResult = { data?: unknown };
        let result: PredictResult | null = null;
        const tries: Array<() => Promise<unknown>> = [
          () => client.predict("/run", { image: imgBlob, mc_resolution: 256 }),
          () => client.predict("/generate_mesh", [imgBlob]),
          () => client.predict("/predict", [imgBlob]),
          () => client.predict(0, [imgBlob]),
        ];
        for (const run of tries) {
          if (Date.now() > OVERALL_DEADLINE) break;
          try {
            result = (await withTimeout(run(), 60_000, `predict ${space}`)) as PredictResult;
            break;
          } catch {
            // try next signature
          }
        }
        if (!result) {
          errors.push(`${space}: нет подходящего endpoint`);
          continue;
        }
        const data = Array.isArray(result.data) ? result.data : [];
        const pickByExt = (ext: RegExp) => {
          for (const item of data) {
            if (!item || typeof item !== "object") continue;
            const o = item as { url?: string };
            if (o.url && ext.test(o.url)) return o.url;
          }
          return null;
        };
        const glb = pickByExt(/\.glb(\?|$)/i);
        if (glb) return { url: glb, name: `${sanitizeFileStem(prompt)}.glb` };
        const obj = pickByExt(/\.(obj|ply|fbx)(\?|$)/i);
        if (obj) return { url: obj, name: `${sanitizeFileStem(prompt)}.obj` };
        errors.push(`${space}: результат без .glb/.obj`);
      } catch (e) {
        errors.push(`${space}: ${(e as Error).message}`);
      }
    }
    return {
      url: "",
      name: "",
      error:
        "Все бесплатные 3D-сервисы сейчас в sleep или очереди. Попробуйте через 1–2 минуты.\n" +
        "Либо в браузере: https://huggingface.co/spaces/tencent/Hunyuan3D-2\n\n" +
        errors.slice(0, 3).join("\n"),
    };
  });

  function sanitizeFileStem(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "model";
  }

  const SB_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
  const SB_ANON = "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";
  async function callPublicRpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_ANON,
        Authorization: `Bearer ${SB_ANON}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  const liveCreateSchema = z.object({ title: z.string().trim().max(120).optional() }).strict();
  registerInvokeHandler("live:create", async (_event, payload) => {
    const { title } = liveCreateSchema.parse(payload ?? {});
    const { getPublicSettings } = await import("@/main/settings");
    const key = getPublicSettings().metacoreKey;
    if (!key) throw new Error("no_key");
    const rows = await callPublicRpc<Array<{ id: string }>>("live_create_session", {
      p_key: key,
      p_title: title ?? null,
    });
    return { id: rows[0]?.id ?? null };
  });

  const livePushSchema = z
    .object({
      sessionId: z.string().uuid(),
      kind: z.string().min(1).max(40),
      data: z.record(z.unknown()).optional(),
    })
    .strict();
  registerInvokeHandler("live:push", async (_event, payload) => {
    const { sessionId, kind, data } = livePushSchema.parse(payload);
    const { getPublicSettings } = await import("@/main/settings");
    const key = getPublicSettings().metacoreKey ?? null;
    await callPublicRpc("live_push_event", {
      p_session_id: sessionId,
      p_actor_key: key,
      p_kind: kind,
      p_data: data ?? {},
    });
    return { ok: true };
  });

  const livePollSchema = z
    .object({ sessionId: z.string().uuid(), afterId: z.number().int().nonnegative().optional() })
    .strict();
  registerInvokeHandler("live:poll", async (_event, payload) => {
    const { sessionId, afterId } = livePollSchema.parse(payload);
    return await callPublicRpc("live_poll", {
      p_session_id: sessionId,
      p_after_id: afterId ?? 0,
    });
  });

  async function supabaseFetch(path: string, init?: RequestInit) {
    const { getSettings } = await import("@/main/settings");
    const s = getSettings();
    const token = s.supabaseAccessToken;
    const ref = s.supabaseProjectRef;
    if (!token || !ref) throw new Error("no_supabase_config");
    return fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  registerInvokeHandler("supabase:query", async (_event, payload) => {
    const sql = z.object({ query: z.string().min(1).max(100_000) }).strict().parse(payload).query;
    try {
      const res = await supabaseFetch("/database/query", {
        method: "POST",
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 400)}` };
      let data: unknown = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  registerInvokeHandler("supabase:listTables", async () => {
    const sql = `select table_schema, table_name
      from information_schema.tables
      where table_schema not in ('pg_catalog','information_schema','pg_toast','extensions','graphql','graphql_public','pgsodium','pgsodium_masks','vault','storage','realtime','net','supabase_functions','supabase_migrations')
      order by table_schema, table_name`;
    try {
      const res = await supabaseFetch("/database/query", {
        method: "POST",
        body: JSON.stringify({ query: sql }),
      });
      if (!res.ok) return { ok: false, error: `${res.status}` };
      return { ok: true, tables: (await res.json()) as Array<{ table_schema: string; table_name: string }> };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  const migSchema = z.object({ appSlug: z.string().min(1) }).strict();
  registerInvokeHandler("supabase:listMigrations", async (_event, payload) => {
    const { appSlug } = migSchema.parse(payload);
    const row = await getAppBySlug(appSlug);
    if (!row) return [];
    const dir = path.join(row.path, "supabase", "migrations");
    try {
      const files = await fsp.readdir(dir);
      return files.filter((f) => f.endsWith(".sql")).sort();
    } catch {
      return [];
    }
  });

  const applySchema = z
    .object({ appSlug: z.string().min(1), fileName: z.string().min(1).max(120) })
    .strict();
  registerInvokeHandler("supabase:applyMigration", async (_event, payload) => {
    const { appSlug, fileName } = applySchema.parse(payload);
    const row = await getAppBySlug(appSlug);
    if (!row) throw new Error("app not found");
    const filePath = path.join(row.path, "supabase", "migrations", fileName);
    const sql = await fsp.readFile(filePath, "utf8");
    try {
      const res = await supabaseFetch("/database/query", {
        method: "POST",
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 400)}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  const videoSchema = z
    .object({ url: z.string().url().max(500) })
    .strict();
  registerInvokeHandler("video:getTranscript", async (_event, payload) => {
    const { url } = videoSchema.parse(payload);
    try {
      const { YoutubeTranscript } = await import("youtube-transcript");
      const items = await YoutubeTranscript.fetchTranscript(url);
      const text = items.map((i) => i.text).join(" ");
      return { ok: true, text: text.slice(0, 20_000), count: items.length };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  const publishSchema = z
    .object({
      appSlug: z.string().min(1),
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(500).optional(),
      priceKopecks: z.number().int().min(0).max(100000000).optional(),
      category: z.string().trim().max(40).optional(),
    })
    .strict();
  registerInvokeHandler("gallery:publish", async (_event, payload) => {
    const { appSlug, name, description, priceKopecks, category } = publishSchema.parse(payload);
    const row = await getAppBySlug(appSlug);
    if (!row) throw new Error("app not found");
    const { getPublicSettings } = await import("@/main/settings");
    const key = getPublicSettings().metacoreKey;
    if (!key) throw new Error("no_key");

    // Collect source files (skip heavy dirs)
    const SKIP = new Set([
      "node_modules", ".git", "dist", ".vite", ".next", ".turbo", "build", "coverage",
    ]);
    const MAX_BYTES = 300_000;
    const MAX_FILES = 400;
    const files: Record<string, string> = {};
    let count = 0;
    async function walk(base: string, rel: string) {
      if (count >= MAX_FILES) return;
      const entries = await fsp.readdir(base, { withFileTypes: true });
      for (const e of entries) {
        if (count >= MAX_FILES) return;
        if (SKIP.has(e.name)) continue;
        const abs = path.join(base, e.name);
        const rp = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(abs, rp);
        else if (e.isFile()) {
          try {
            const stat = await fsp.stat(abs);
            if (stat.size > MAX_BYTES) continue;
            const buf = await fsp.readFile(abs);
            if (buf.includes(0)) continue;
            files[rp] = buf.toString("utf8");
            count += 1;
          } catch {
            // skip
          }
        }
      }
    }
    await walk(row.path, "");

    const SUPABASE_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
    const SUPABASE_ANON = "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/publish_app`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({
        p_key: key,
        p_slug: row.slug,
        p_name: name,
        p_description: description ?? "",
        p_files: files,
        p_price_kopecks: priceKopecks ?? 0,
        p_category: category ?? null,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (body.includes("profanity")) {
        const word = body.match(/profanity_(\w+)/)?.[1] ?? "";
        throw new Error(`Нецензурная лексика в описании или названии (${word}). Исправьте и попробуйте снова.`);
      }
      throw new Error(`publish rpc ${res.status}: ${body}`);
    }
    const data = (await res.json()) as Array<{ id: string }>;
    return { ok: true, id: data[0]?.id ?? null, filesCount: count };
  });

  registerInvokeHandler("gallery:list", async () => {
    const SUPABASE_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
    const SUPABASE_ANON = "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/public_apps?select=id,slug,name,description,forks,likes,created_at,price_kopecks,category,author_key&order=created_at.desc&limit=100`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } },
    );
    if (!res.ok) return [];
    return (await res.json()) as Array<{
      id: string;
      slug: string;
      name: string;
      description: string | null;
      forks: number;
      likes: number;
      created_at: string;
      price_kopecks?: number;
      category?: string | null;
      author_key?: string | null;
    }>;
  });

  const forkSchema = z.object({ id: z.string().uuid() }).strict();
  registerInvokeHandler("gallery:fork", async (_event, payload) => {
    const { id } = forkSchema.parse(payload);
    const SUPABASE_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
    const SUPABASE_ANON = "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";
    const { getPublicSettings } = await import("@/main/settings");
    const buyerKey = getPublicSettings().metacoreKey;
    if (!buyerKey) {
      return { ok: false, reason: "no_license", priceKopecks: 0 };
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fork_public_app`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ p_app_id: id, p_buyer_key: buyerKey }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      console.error("[gallery:fork] HTTP", res.status, rawText);
      throw new Error(`fork rpc ${res.status}: ${rawText.slice(0, 200)}`);
    }
    let rows: Array<{
      files: Record<string, string> | null;
      name: string | null;
      ok?: boolean;
      reason?: string;
      price_kopecks?: number;
    }>;
    try {
      rows = JSON.parse(rawText);
    } catch {
      console.error("[gallery:fork] non-JSON response:", rawText);
      throw new Error(`fork rpc returned non-JSON: ${rawText.slice(0, 200)}`);
    }
    console.log("[gallery:fork] response:", rows);
    const row = rows[0];
    if (!row) throw new Error("empty_response");
    if (row.ok === false) {
      return {
        ok: false,
        reason: row.reason ?? "unknown_reason",
        priceKopecks: row.price_kopecks ?? 0,
      };
    }
    if (!row.files || !row.name) {
      console.error("[gallery:fork] missing files/name:", row);
      throw new Error("malformed response: missing files or name");
    }
    const { createAppFromFiles } = await import("@/main/app_manager");
    const result = await createAppFromFiles(row.name, row.files);
    return { ok: true, appSlug: result.app.slug };
  });

  const unpublishSchema = z.object({ id: z.string().uuid() }).strict();
  registerInvokeHandler("gallery:unpublish", async (_event, payload) => {
    const { id } = unpublishSchema.parse(payload);
    const SUPABASE_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
    const SUPABASE_ANON = "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";
    const { getPublicSettings } = await import("@/main/settings");
    const licenseKey = getPublicSettings().metacoreKey;
    if (!licenseKey) {
      return { ok: false, reason: "no_license" };
    }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gallery-unpublish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${licenseKey}`,
      },
      body: JSON.stringify({ appId: id }),
    });
    const text = await res.text();
    if (res.ok) return { ok: true };
    try {
      const err = JSON.parse(text) as { error?: string };
      return { ok: false, reason: err.error ?? `http_${res.status}` };
    } catch {
      return { ok: false, reason: `http_${res.status}` };
    }
  });

  registerInvokeHandler("earnings:list", async () => {
    const { getPublicSettings } = await import("@/main/settings");
    const key = getPublicSettings().metacoreKey;
    if (!key) return [];
    const SUPABASE_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
    const SUPABASE_ANON = "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_my_earnings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ p_key: key }),
    });
    if (!res.ok) return [];
    return (await res.json()) as Array<{
      id: string;
      item_id: string;
      gross_kopecks: number;
      author_kopecks: number;
      status: string;
      created_at: string;
    }>;
  });

  async function callRpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    const SUPABASE_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
    const SUPABASE_ANON = "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`rpc ${fn} ${res.status}`);
    return (await res.json()) as T;
  }

  registerInvokeHandler("payout:balance", async () => {
    const { getPublicSettings } = await import("@/main/settings");
    const key = getPublicSettings().metacoreKey;
    if (!key) {
      return {
        availableKopecks: 0,
        totalEarnedKopecks: 0,
        pendingKopecks: 0,
        paidKopecks: 0,
      };
    }
    const rows = await callRpc<
      Array<{
        available_kopecks: number;
        total_earned_kopecks: number;
        pending_kopecks: number;
        paid_kopecks: number;
      }>
    >("get_payout_balance", { p_key: key });
    const r = rows[0] ?? {
      available_kopecks: 0,
      total_earned_kopecks: 0,
      pending_kopecks: 0,
      paid_kopecks: 0,
    };
    return {
      availableKopecks: Number(r.available_kopecks) || 0,
      totalEarnedKopecks: Number(r.total_earned_kopecks) || 0,
      pendingKopecks: Number(r.pending_kopecks) || 0,
      paidKopecks: Number(r.paid_kopecks) || 0,
    };
  });

  registerInvokeHandler("payout:list", async () => {
    const { getPublicSettings } = await import("@/main/settings");
    const key = getPublicSettings().metacoreKey;
    if (!key) return [];
    return callRpc<
      Array<{
        id: string;
        amount_kopecks: number;
        method: string;
        details: string;
        status: string;
        admin_note: string | null;
        created_at: string;
        processed_at: string | null;
      }>
    >("list_my_payouts", { p_key: key });
  });

  const payoutRequestSchema = z
    .object({
      amountKopecks: z.number().int().min(50000).max(100000000),
      method: z.enum(["usdt_trc20", "usdt_erc20"]),
      details: z.string().trim().min(4).max(200),
    })
    .strict();
  registerInvokeHandler("payout:request", async (_event, payload) => {
    const input = payoutRequestSchema.parse(payload);
    const { getPublicSettings } = await import("@/main/settings");
    const key = getPublicSettings().metacoreKey;
    if (!key) return { ok: false, reason: "no_license" };
    const rows = await callRpc<
      Array<{ ok: boolean; reason: string; request_id: string | null }>
    >("request_payout", {
      p_key: key,
      p_amount: input.amountKopecks,
      p_method: input.method,
      p_details: input.details,
    });
    const r = rows[0];
    if (!r) return { ok: false, reason: "no_response" };
    return { ok: r.ok, reason: r.reason, requestId: r.request_id };
  });

  const exportSchema = z.object({ appSlug: z.string().min(1) }).strict();
  registerInvokeHandler("app:exportZip", async (_event, payload) => {
    const { appSlug } = exportSchema.parse(payload);
    const row = await getAppBySlug(appSlug);
    if (!row) throw new Error("app not found");
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    const SKIP = new Set(["node_modules", ".git", "dist", ".vite", ".next", ".turbo", "build", "coverage"]);
    async function walk(base: string, rel: string) {
      const entries = await fsp.readdir(base, { withFileTypes: true });
      for (const e of entries) {
        if (SKIP.has(e.name)) continue;
        const abs = path.join(base, e.name);
        const zipPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await walk(abs, zipPath);
        } else if (e.isFile()) {
          try {
            zip.addFile(zipPath, await fsp.readFile(abs));
          } catch {
            // skip unreadable
          }
        }
      }
    }
    await walk(row.path, "");
    const buf = zip.toBuffer();
    return { name: `${row.slug}.zip`, dataBase64: buf.toString("base64"), size: buf.length };
  });

  registerInvokeHandler("app:saveMemory", async (_event, payload) => {
    const p = z
      .object({ appSlug: z.string().min(1), summary: z.string().trim().min(1).max(400) })
      .strict()
      .parse(payload);
    const row = await getAppBySlug(p.appSlug);
    if (!row) return { ok: false };
    const memDir = path.join(row.path, ".metacore");
    await fsp.mkdir(memDir, { recursive: true });
    const memFile = path.join(memDir, "memory.md");
    const line = `- ${new Date().toISOString().slice(0, 10)} · ${p.summary}`;
    let prev = "";
    try {
      prev = await fsp.readFile(memFile, "utf8");
    } catch {
      // new file
    }
    await fsp.writeFile(memFile, (prev ? prev.trim() + "\n" : "") + line + "\n", "utf8");
    return { ok: true };
  });

  const saveSchema = z
    .object({
      appSlug: z.string().min(1),
      fileName: z.string().trim().min(1).max(120).regex(/\.(glb|gltf)$/i),
      dataBase64: z.string().min(1),
    })
    .strict();
  registerInvokeHandler("threed:saveToProject", async (_event, payload) => {
    const { appSlug, fileName, dataBase64 } = saveSchema.parse(payload);
    const row = await getAppBySlug(appSlug);
    if (!row) throw new Error("app not found");
    const assetsDir = path.join(row.path, "public", "models");
    await fsp.mkdir(assetsDir, { recursive: true });
    const safe = fileName.replace(/[\\/:*?"<>|]/g, "");
    await fsp.writeFile(path.join(assetsDir, safe), Buffer.from(dataBase64, "base64"));
    return { ok: true, path: `public/models/${safe}` };
  });
}
