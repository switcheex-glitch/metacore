import { useEffect, useMemo, useState } from "react";
import "@google/model-viewer";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { Loader2, Upload, Sparkles, Box, Download, AlertCircle } from "lucide-react";
import { invoke } from "@/ipc/ipc_client";
import { useModels, useProviders } from "@/hooks/use-providers";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          "camera-controls"?: boolean | "";
          "auto-rotate"?: boolean | "";
          "shadow-intensity"?: string | number;
          exposure?: string | number;
          "environment-image"?: string;
          "skybox-image"?: string;
          "disable-zoom"?: boolean | "";
        },
        HTMLElement
      >;
    }
  }
}

type ModelSource = { url: string; name: string } | null;

type SceneMesh = {
  geometry: string;
  params?: Record<string, number>;
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
};

type SceneSpec = {
  name?: string;
  background?: string;
  meshes: SceneMesh[];
};

function buildGeometry(m: SceneMesh): THREE.BufferGeometry {
  const p = m.params ?? {};
  switch (m.geometry) {
    case "box":
      return new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1);
    case "sphere":
      return new THREE.SphereGeometry(p.radius ?? 0.5, 32, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(
        p.radiusTop ?? p.radius ?? 0.5,
        p.radiusBottom ?? p.radius ?? 0.5,
        p.height ?? 1,
        32,
      );
    case "cone":
      return new THREE.ConeGeometry(p.radius ?? 0.5, p.height ?? 1, 32);
    case "torus":
      return new THREE.TorusGeometry(p.radius ?? 0.5, p.tube ?? 0.15, 16, 64);
    case "plane":
      return new THREE.PlaneGeometry(p.width ?? 6, p.height ?? 6);
    case "tetrahedron":
      return new THREE.TetrahedronGeometry(p.radius ?? 0.7, p.detail ?? 0);
    case "octahedron":
      return new THREE.OctahedronGeometry(p.radius ?? 0.7, p.detail ?? 0);
    case "icosahedron":
      return new THREE.IcosahedronGeometry(p.radius ?? 0.7, p.detail ?? 0);
    case "torusKnot":
      return new THREE.TorusKnotGeometry(p.radius ?? 0.5, p.tube ?? 0.15, 128, 16);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function buildScene(spec: SceneSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = spec.name ?? "generated";
  for (const m of spec.meshes ?? []) {
    const geo = buildGeometry(m);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(m.color ?? "#888888"),
      metalness: Math.min(1, Math.max(0, m.metalness ?? 0.2)),
      roughness: Math.min(1, Math.max(0, m.roughness ?? 0.6)),
      emissive: m.emissive ? new THREE.Color(m.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: m.emissiveIntensity ?? 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    if (m.position) mesh.position.fromArray(m.position);
    if (m.rotation) mesh.rotation.fromArray(m.rotation);
    group.add(mesh);
  }
  return group;
}

function exportToGlbBlob(scene: THREE.Object3D): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: "model/gltf-binary" }));
        } else {
          const json = JSON.stringify(result);
          resolve(new Blob([json], { type: "model/gltf+json" }));
        }
      },
      (err) => reject(err),
      { binary: true },
    );
  });
}

function EmptyState({ onPick, onGenerate }: { onPick: () => void; onGenerate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <Box className="h-12 w-12 text-muted-foreground" />
      <div>
        <div className="text-lg font-semibold">3D-просмотр</div>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Откройте .glb / .gltf файл или сгенерируйте свою 3D-сцену — AI соберёт её из примитивов прямо тут.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPick}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm transition hover:bg-muted"
        >
          <Upload className="h-4 w-4" />
          Открыть файл
        </button>
        <button
          type="button"
          onClick={onGenerate}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <Sparkles className="h-4 w-4" />
          Сгенерировать через AI
        </button>
      </div>
    </div>
  );
}

function GenerateModal({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  onGenerated: (url: string, name: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string>("");

  const providers = useProviders();
  const models = useModels();
  const availableModels = useMemo(() => {
    const list = models.data ?? [];
    const provs = providers.data ?? [];
    const byId = new Map(provs.map((p) => [p.id, p]));
    return list
      .map((m) => ({ ...m, provider: byId.get(m.providerId) }))
      .filter((m) => m.provider && (m.provider.authMode === "local" || m.provider.hasKey));
  }, [models.data, providers.data]);

  useEffect(() => {
    if (!modelId && availableModels.length > 0) setModelId(availableModels[0]!.id);
  }, [availableModels, modelId]);

  if (!open) return null;

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setStatus("AI проектирует сцену…");
    try {
      const res = await invoke<{ scene: SceneSpec | null; error?: string }>("threed:genScene", {
        prompt,
        modelId,
      });
      if (res.error || !res.scene) {
        setError(res.error ?? "Не удалось получить сцену");
        return;
      }
      setStatus("Собираю 3D-меши и экспортирую GLB…");
      const group = buildScene(res.scene);
      const blob = await exportToGlbBlob(group);
      const url = URL.createObjectURL(blob);
      onGenerated(url, `${(res.scene.name ?? "scene").replace(/[^a-z0-9-_]/gi, "_")}.glb`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-popover p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Сгенерировать 3D-сцену</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Наш собственный генератор. AI собирает сцену из примитивов (box/sphere/cylinder/cone/torus/…) по вашему описанию — без внешних 3D-сервисов и ожиданий.
        </p>

        <div className="mt-4">
          <label className="text-xs text-muted-foreground">Описание сцены</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='"робот на красной платформе" / "космический корабль" / "замок с башнями"'
            rows={4}
            className="mt-1 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="mt-3">
          <label className="text-xs text-muted-foreground">AI-модель</label>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={availableModels.length === 0}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
          >
            {availableModels.length === 0 ? (
              <option value="">Нет подключённых моделей — добавьте ключ в Настройках</option>
            ) : (
              availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))
            )}
          </select>
        </div>

        {status && !error ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {status}
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm transition hover:bg-muted"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !prompt.trim() || !modelId}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}

export function ThreeDViewer({ appSlug }: { appSlug: string }) {
  const [source, setSource] = useState<ModelSource>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (source?.url.startsWith("blob:")) URL.revokeObjectURL(source.url);
    };
  }, [source]);

  function pickFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".glb,.gltf";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (source?.url.startsWith("blob:")) URL.revokeObjectURL(source.url);
      const url = URL.createObjectURL(f);
      setSource({ url, name: f.name });
      setError(null);
    };
    input.click();
  }

  async function downloadToProject() {
    if (!source) return;
    try {
      const res = await fetch(source.url);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      await invoke("threed:saveToProject", {
        appSlug,
        fileName: source.name,
        dataBase64: btoa(bin),
      });
      setError(null);
    } catch (e) {
      setError("Не удалось сохранить: " + (e as Error).message);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0b0f]">
      <div className="flex items-center gap-2 border-b border-border/60 bg-card/40 px-4 py-2 text-sm">
        <Box className="h-4 w-4 text-primary" />
        <span className="font-medium">{source?.name ?? "3D-просмотр"}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={pickFile}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs transition hover:bg-muted"
          >
            <Upload className="h-3 w-3" />
            Открыть
          </button>
          <button
            type="button"
            onClick={() => setGenOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary transition hover:bg-primary/20"
          >
            <Sparkles className="h-3 w-3" />
            AI
          </button>
          {source ? (
            <button
              type="button"
              onClick={downloadToProject}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <Download className="h-3 w-3" />В проект
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="flex items-start gap-2 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {source ? (
          <model-viewer
            key={source.url}
            src={source.url}
            alt={source.name}
            camera-controls
            auto-rotate
            shadow-intensity="0.9"
            exposure="1.1"
            style={{ width: "100%", height: "100%", backgroundColor: "#0b0b0f" }}
          />
        ) : (
          <EmptyState onPick={pickFile} onGenerate={() => setGenOpen(true)} />
        )}
      </div>
      <GenerateModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onGenerated={(url, name) => setSource({ url, name })}
      />
    </div>
  );
}
