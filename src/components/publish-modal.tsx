import { useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, AlertCircle, Check, ChevronDown } from "lucide-react";
import { invoke } from "@/ipc/ipc_client";

function CategoryDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm outline-none transition hover:bg-muted focus:border-primary"
      >
        <span>{value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[60] max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl">
          {CATEGORIES.map((c) => {
            const active = value === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                  active ? "bg-primary/15 text-primary" : "hover:bg-muted"
                }`}
              >
                <Check className={`h-3 w-3 flex-none ${active ? "text-primary" : "opacity-0"}`} />
                {c}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const CATEGORIES = [
  "Landing",
  "SaaS",
  "E-commerce",
  "Dashboard",
  "Telegram Bot",
  "Chrome Ext",
  "AI",
  "Игры",
  "Утилиты",
  "Другое",
];

const LOCAL_PROFANITY = [
  "хуй","хуе","хуё","хуи","пизд","ебат","ебан","ёбан","ебал","ёбал","бляд","блядь",
  "сука","суки","мудак","долбоёб","долбоеб","хуев","пидор","пидар","нахуй","манда",
  "fuck","shit","bitch","asshole","cunt","dick","faggot","nigger","nigga",
];

function containsProfanity(text: string): string | null {
  const low = text.toLowerCase();
  for (const b of LOCAL_PROFANITY) {
    const re = new RegExp(`(^|[^a-zа-яё])${b}([^a-zа-яё]|$)`, "i");
    if (re.test(low)) return b;
  }
  return null;
}

export function PublishModal({
  appSlug,
  defaultName,
  onClose,
  onDone,
}: {
  appSlug: string;
  defaultName: string;
  onClose: () => void;
  onDone: (result: { filesCount: number }) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [priceRub, setPriceRub] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const combined = `${name} ${description}`;
    const hit = containsProfanity(combined);
    if (hit) {
      setError(`Нецензурная лексика ("${hit}") — замените формулировку.`);
      return;
    }
    if (!name.trim()) {
      setError("Название обязательно.");
      return;
    }
    if (priceRub < 0 || priceRub > 1_000_000) {
      setError("Некорректная цена.");
      return;
    }
    setBusy(true);
    setStatus("Публикуем…");
    try {
      const res = await invoke<{ ok: boolean; filesCount: number }>("gallery:publish", {
        appSlug,
        name: name.trim(),
        description: description.trim(),
        priceKopecks: Math.round(priceRub * 100),
        category,
      });
      if (res.ok) onDone(res);
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
          <h2 className="text-lg font-semibold">Опубликовать в галерее</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Проект выкладывается публично, любой может форкнуть. За платные товары вы получаете 70% с каждой продажи — автоматически на баланс кошелька.
        </p>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Коротко — что делает проект, для кого, что получит покупатель."
              className="mt-1 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {description.length}/500
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Категория</label>
              <CategoryDropdown value={category} onChange={setCategory} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Цена, ₽ (0 = бесплатно)</label>
              <input
                type="number"
                min={0}
                max={1000000}
                value={priceRub}
                onChange={(e) => setPriceRub(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {priceRub > 0 ? (
                <div className="mt-1 text-[11px] text-emerald-300">
                  Ваш доход с продажи: {Math.round(priceRub * 0.7)} ₽
                </div>
              ) : null}
            </div>
          </div>
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

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3 text-emerald-400" />
            Мат фильтруется автоматически
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm transition hover:bg-muted"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Опубликовать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
