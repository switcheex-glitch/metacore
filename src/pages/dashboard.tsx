import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck, ShoppingBag, Sparkles, Unlock } from "lucide-react";
import { useSettings, useUpdateSettings } from "@/hooks/use-providers";
import { useT } from "@/hooks/use-t";
import { BuyKeyModal } from "@/components/buy-key-modal";
import { invoke } from "@/ipc/ipc_client";

const KEYFRAMES = `
@keyframes metacore-spin {
  from { transform: rotateX(-22deg) rotateY(0deg); }
  to   { transform: rotateX(-22deg) rotateY(360deg); }
}
@keyframes metacore-float {
  0%, 100% { transform: translateY(0px); }
  50%      { transform: translateY(-14px); }
}
@keyframes metacore-pulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.08); }
}
@keyframes metacore-sheen {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes metacore-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

export function DashboardPage() {
  const t = useT();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [keyInput, setKeyInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const storedKey = settings.data?.metacoreKey ?? null;
  const unlocked = Boolean(storedKey) && !editing;

  async function handleUnlock() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setChecking(true);
    setKeyError(null);
    try {
      const result = await invoke<{
        valid: boolean;
        reason: string;
      }>("license:check", { key: trimmed });
      if (!result.valid) {
        const msg =
          result.reason === "not_found"
            ? "Ключ не найден"
            : result.reason === "revoked"
              ? "Ключ отозван"
              : result.reason === "rate_limited"
                ? "Слишком много попыток, подождите минуту"
                : result.reason === "bad_key"
                  ? "Неверный формат ключа"
                  : "Ключ недействителен";
        setKeyError(msg);
        return;
      }
      await updateSettings.mutateAsync({ metacoreKey: trimmed });
      setKeyInput("");
      setEditing(false);
    } catch (e) {
      setKeyError("Не удалось проверить ключ. Проверьте соединение.");
    } finally {
      setChecking(false);
    }
  }

  async function handleReset() {
    await updateSettings.mutateAsync({ metacoreKey: null });
    setKeyInput("");
    setEditing(true);
  }

  return (
    <div className="relative flex h-full w-full overflow-y-auto overflow-x-hidden pb-36">
      <style>{KEYFRAMES}</style>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 55%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.05), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse at center, black 45%, transparent 80%)",
        }}
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-12 px-8 py-16">
        <MetacoreCube />

        <div
          className="flex flex-col items-center gap-4 text-center"
          style={{ animation: "metacore-fade-up 700ms ease-out 120ms both" }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Metacore</span>
          </div>
          <h1 className="text-5xl font-semibold tracking-tight text-white">
            {t("dashboard.welcome")}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("dashboard.subtitle")}
          </p>
        </div>

        <div
          className="w-full max-w-md"
          style={{ animation: "metacore-fade-up 700ms ease-out 260ms both" }}
        >
          {unlocked ? (
            <UnlockedCard
              maskedKey={maskKey(storedKey!)}
              onChange={() => setEditing(true)}
              onReset={handleReset}
            />
          ) : (
            <div className="space-y-3">
              <LockedCard
                keyInput={keyInput}
                setKeyInput={(v) => {
                  setKeyInput(v);
                  if (keyError) setKeyError(null);
                }}
                onUnlock={handleUnlock}
                pending={updateSettings.isPending || checking}
                error={keyError}
                canCancel={Boolean(storedKey)}
                onCancel={() => {
                  setEditing(false);
                  setKeyInput("");
                  setKeyError(null);
                }}
              />
              <button
                type="button"
                onClick={() => setBuyOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-rose-500/15 px-4 py-2.5 text-sm font-medium text-amber-200 transition hover:from-amber-500/25 hover:to-rose-500/25"
              >
                <ShoppingBag className="h-4 w-4" />
                Купить ключ — 1999 ₽/мес
              </button>
            </div>
          )}
        </div>
      </div>
      <BuyKeyModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </div>
  );
}

function MetacoreCube() {
  const size = 420;
  const a = 170;

  const loops: Array<Array<{ x: number; y: number; z: number }>> = [];
  const NUM_LOOPS = 5;
  const POINTS = 60;
  for (let l = 0; l < NUM_LOOPS; l++) {
    const loop: Array<{ x: number; y: number; z: number }> = [];
    const phase = (l / NUM_LOOPS) * Math.PI * 2;
    for (let i = 0; i < POINTS; i++) {
      const t = (i / POINTS) * Math.PI * 2;
      const denom = 1 + Math.sin(t) ** 2;
      const bx = (a * Math.cos(t)) / denom;
      const by = (a * Math.sin(t) * Math.cos(t)) / denom;
      const tubeR = 28;
      const nx = Math.cos(t) + 0.0001;
      const ny = Math.sin(t) * 2;
      const mag = Math.hypot(nx, ny) || 1;
      const perpX = -ny / mag;
      const perpY = nx / mag;
      const ox = Math.cos(phase + t * 3) * tubeR * perpX;
      const oy = Math.cos(phase + t * 3) * tubeR * perpY * 0.5;
      const oz = Math.sin(phase + t * 3) * tubeR;
      loop.push({ x: bx + ox, y: by + oy, z: oz });
    }
    loops.push(loop);
  }

  const nodes: Array<{ x: number; y: number; z: number; bright: boolean }> = [];
  for (let l = 0; l < loops.length; l++) {
    const loop = loops[l]!;
    for (let i = 0; i < loop.length; i += 3) {
      const p = loop[i]!;
      nodes.push({ ...p, bright: (i + l) % 4 === 0 });
    }
  }

  const edges: Array<{ x1: number; y1: number; x2: number; y2: number; o: number }> = [];
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i]!;
      const q = loop[(i + 1) % loop.length]!;
      edges.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, o: 0.55 });
    }
  }
  for (let l = 0; l < loops.length - 1; l++) {
    const la = loops[l]!;
    const lb = loops[l + 1]!;
    for (let i = 0; i < POINTS; i += 2) {
      const p = la[i]!;
      const q = lb[i]!;
      edges.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, o: 0.22 });
    }
  }

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        animation: "metacore-float 7s ease-in-out infinite",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 35% at 50% 50%, rgba(255,255,255,0.22), rgba(255,255,255,0) 70%)",
          animation: "metacore-pulse 5s ease-in-out infinite",
        }}
      />
      <div style={{ width: size, height: size, perspective: 1200 }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            animation: "metacore-spin 6s linear infinite",
          }}
        >
          <svg
            viewBox={`-${size / 2} -${size / 2} ${size} ${size}`}
            className="absolute inset-0 h-full w-full"
          >
            <defs>
              <filter id="metacore-glow">
                <feGaussianBlur stdDeviation="1.3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#metacore-glow)">
              {edges.map((e, i) => (
                <line
                  key={i}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke={`rgba(255,255,255,${e.o})`}
                  strokeWidth={0.6}
                />
              ))}
            </g>
          </svg>
          {nodes.map((n, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 rounded-full bg-white"
              style={{
                width: n.bright ? 4 : 2,
                height: n.bright ? 4 : 2,
                marginLeft: n.bright ? -2 : -1,
                marginTop: n.bright ? -2 : -1,
                transform: `translate3d(${n.x}px, ${n.y}px, ${n.z}px)`,
                boxShadow: n.bright
                  ? "0 0 10px rgba(255,255,255,0.95), 0 0 22px rgba(255,255,255,0.55)"
                  : "0 0 4px rgba(255,255,255,0.7)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LockedCard({
  keyInput,
  setKeyInput,
  onUnlock,
  pending,
  error,
  canCancel,
  onCancel,
}: {
  keyInput: string;
  setKeyInput: (v: string) => void;
  onUnlock: () => void;
  pending: boolean;
  error: string | null;
  canCancel: boolean;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-md">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white/90">
        <KeyRound className="h-4 w-4 text-white/80" />
        <span>{t("dashboard.keyTitle")}</span>
      </div>
      <label className="block">
        <span className="mb-2 block text-xs text-muted-foreground">
          {t("dashboard.keyHint")}
        </span>
        <div className="relative">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && keyInput.trim() && !pending) onUnlock();
            }}
            placeholder={t("dashboard.keyPlaceholder")}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 font-mono text-sm text-white placeholder:text-white/30 outline-none transition focus:border-primary/60 focus:shadow-[0_0_0_4px_rgba(139,92,246,0.15)]"
            autoFocus
          />
        </div>
      </label>
      {error ? (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onUnlock}
          disabled={pending || !keyInput.trim()}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
          {pending ? t("dashboard.unlocking") : t("dashboard.unlock")}
        </button>
        {canCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.08]"
          >
            {t("dashboard.cancel")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function UnlockedCard({
  maskedKey,
  onChange,
  onReset,
}: {
  maskedKey: string;
  onChange: () => void;
  onReset: () => void;
}) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white">
            {t("dashboard.unlockedTitle")}
          </div>
          <div className="truncate font-mono text-xs text-white/60">
            {maskedKey}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onChange}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80 transition hover:bg-white/[0.08]"
        >
          {t("dashboard.changeKey")}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.08]"
        >
          {t("dashboard.removeKey")}
        </button>
      </div>
    </div>
  );
}

function maskKey(v: string): string {
  if (v.length <= 4) return "•".repeat(v.length);
  return v.slice(0, 2) + "•".repeat(Math.max(4, v.length - 4)) + v.slice(-2);
}
