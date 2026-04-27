import { useEffect, useRef, useState } from "react";
import { Users2, Copy, X, Send, LogIn, Loader2, Check } from "lucide-react";
import { invoke } from "@/ipc/ipc_client";

type LiveEvent = {
  id: number;
  actor_key: string | null;
  kind: string;
  data: Record<string, unknown>;
  created_at: string;
};

type Mode = "idle" | "host" | "guest";

export function LiveShareButton({ appSlug }: { appSlug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Live session — поделиться с коллегой"
        className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Users2 className="h-3.5 w-3.5" />
      </button>
      {open ? <LiveSharePanel appSlug={appSlug} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LiveSharePanel({ appSlug, onClose }: { appSlug: string; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [sessionId, setSessionId] = useState<string>("");
  const [joinInput, setJoinInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const cursorRef = useRef(0);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function host() {
    setBusy(true);
    try {
      const res = await invoke<{ id: string | null }>("live:create", { title: appSlug });
      if (res.id) {
        setSessionId(res.id);
        setMode("host");
        await invoke("live:push", { sessionId: res.id, kind: "system", data: { text: "Хост подключился" } });
        startPolling(res.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const id = joinInput.trim();
    if (!id) return;
    setSessionId(id);
    setMode("guest");
    try {
      await invoke("live:push", { sessionId: id, kind: "system", data: { text: "Гость подключился" } });
    } catch {
      // ignore
    }
    startPolling(id);
  }

  function startPolling(id: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const list = await invoke<LiveEvent[]>("live:poll", {
          sessionId: id,
          afterId: cursorRef.current,
        });
        if (list.length > 0) {
          cursorRef.current = list[list.length - 1]!.id;
          setEvents((prev) => [...prev, ...list]);
        }
      } catch {
        // swallow
      }
    };
    void tick();
    pollRef.current = window.setInterval(tick, 1500);
  }

  async function sendMsg() {
    if (!msg.trim() || !sessionId) return;
    const text = msg;
    setMsg("");
    try {
      await invoke("live:push", { sessionId, kind: "message", data: { text } });
    } catch {
      // ignore
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex h-[600px] w-full max-w-xl flex-col rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Live session</h2>
              <p className="text-xs text-muted-foreground">
                {mode === "idle"
                  ? "Общий чат с коллегой через Supabase."
                  : mode === "host"
                    ? "Вы хост. Передайте ID коллеге."
                    : "Вы гость. Подключено."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
            <button
              type="button"
              onClick={host}
              disabled={busy}
              className="w-full max-w-xs rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Создать сессию (хост)"}
            </button>
            <div className="w-full max-w-xs space-y-2">
              <label className="text-xs text-muted-foreground">Подключиться к сессии по ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  placeholder="uuid…"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={join}
                  disabled={!joinInput.trim()}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 text-xs text-primary transition hover:bg-primary/20 disabled:opacity-50"
                >
                  <LogIn className="h-3 w-3" />
                  Войти
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 text-xs">
              <span className="text-muted-foreground">Session:</span>
              <code className="flex-1 truncate font-mono">{sessionId}</code>
              <button
                type="button"
                onClick={copyId}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] transition hover:bg-muted"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copied ? "Скопировано" : "Копировать ID"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {events.length === 0 ? (
                <div className="mt-8 text-center text-xs text-muted-foreground">
                  Ожидание событий…
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {events.map((e) => (
                    <li key={e.id} className="rounded-md border border-border/60 bg-card px-3 py-2">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>
                          {e.actor_key ? e.actor_key.slice(0, 10) + "…" : "system"} · {e.kind}
                        </span>
                        <span>{new Date(e.created_at).toLocaleTimeString("ru-RU")}</span>
                      </div>
                      <div className="mt-1 break-words">
                        {typeof (e.data as { text?: string }).text === "string"
                          ? (e.data as { text: string }).text
                          : JSON.stringify(e.data)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2 border-t border-border/60 p-3">
              <input
                type="text"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && msg.trim()) sendMsg();
                }}
                placeholder="Сообщение…"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={sendMsg}
                disabled={!msg.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Отправить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
