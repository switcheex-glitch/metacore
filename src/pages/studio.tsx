import { useEffect, useState } from "react";
import { Database, Play, TableIcon, FileCode, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { invoke } from "@/ipc/ipc_client";
import { useSettings, useUpdateSettings } from "@/hooks/use-providers";
import { useApps } from "@/hooks/use-apps";

type Tab = "tables" | "sql" | "migrations";
type TableRow = { table_schema: string; table_name: string };

export function StudioPage() {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const apps = useApps();

  const ref = settings.data?.supabaseProjectRef ?? "";
  const token = settings.data?.supabaseAccessToken ?? "";
  const [tokenInput, setTokenInput] = useState("");
  const [refInput, setRefInput] = useState("");

  const [tab, setTab] = useState<Tab>("tables");
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableRows, setTableRows] = useState<unknown[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const [sql, setSql] = useState("select now() as server_time;");
  const [sqlBusy, setSqlBusy] = useState(false);
  const [sqlResult, setSqlResult] = useState<unknown>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [migrations, setMigrations] = useState<string[]>([]);
  const [applyBusy, setApplyBusy] = useState<string | null>(null);
  const [applyStatus, setApplyStatus] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const configured = Boolean(token && ref);

  async function loadTables() {
    setLoadingTables(true);
    try {
      const res = await invoke<{ ok: boolean; tables?: TableRow[]; error?: string }>(
        "supabase:listTables",
      );
      if (res.ok) setTables(res.tables ?? []);
    } finally {
      setLoadingTables(false);
    }
  }

  useEffect(() => {
    if (configured && tab === "tables") void loadTables();
  }, [configured, tab]);

  useEffect(() => {
    if (!selectedSlug || apps.data?.length) {
      if (!selectedSlug && apps.data && apps.data.length > 0) {
        setSelectedSlug(apps.data[0]!.slug);
      }
    }
  }, [apps.data, selectedSlug]);

  useEffect(() => {
    if (tab === "migrations" && selectedSlug) {
      invoke<string[]>("supabase:listMigrations", { appSlug: selectedSlug })
        .then(setMigrations)
        .catch(() => setMigrations([]));
    }
  }, [tab, selectedSlug]);

  async function openTable(t: TableRow) {
    setSelectedTable(`${t.table_schema}.${t.table_name}`);
    setSqlBusy(true);
    try {
      const q = `select * from "${t.table_schema}"."${t.table_name}" limit 100`;
      const res = await invoke<{ ok: boolean; data?: unknown; error?: string }>(
        "supabase:query",
        { query: q },
      );
      setTableRows(Array.isArray(res.data) ? (res.data as unknown[]) : []);
    } finally {
      setSqlBusy(false);
    }
  }

  async function runSql() {
    if (!sql.trim()) return;
    setSqlBusy(true);
    setSqlError(null);
    setSqlResult(null);
    try {
      const res = await invoke<{ ok: boolean; data?: unknown; error?: string }>(
        "supabase:query",
        { query: sql },
      );
      if (res.ok) setSqlResult(res.data);
      else setSqlError(res.error ?? "error");
    } finally {
      setSqlBusy(false);
    }
  }

  async function applyMigration(fileName: string) {
    setApplyBusy(fileName);
    try {
      const res = await invoke<{ ok: boolean; error?: string }>("supabase:applyMigration", {
        appSlug: selectedSlug,
        fileName,
      });
      setApplyStatus((s) => ({
        ...s,
        [fileName]: { ok: res.ok, msg: res.ok ? "Применено" : res.error ?? "ошибка" },
      }));
    } finally {
      setApplyBusy(null);
    }
  }

  if (!configured) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 py-10">
        <div className="flex items-center gap-3">
          <Database className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Studio</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Встроенный SQL-редактор, таблицы, миграции через Supabase Management API.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Подключение к Supabase</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Нужен персональный токен (PAT) из{" "}
            <a
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              supabase.com/dashboard/account/tokens <ExternalLink className="h-3 w-3" />
            </a>{" "}
            и project ref (строка в URL проекта).
          </p>
          <div className="mt-4 grid gap-3">
            <input
              type="text"
              placeholder="Project ref (например nsrilzwmclsiwtrsomer)"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              placeholder="Personal Access Token (sbp_…)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() =>
                updateSettings.mutate({
                  supabaseAccessToken: tokenInput.trim(),
                  supabaseProjectRef: refInput.trim(),
                })
              }
              disabled={updateSettings.isPending || !tokenInput.trim() || !refInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Подключить
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
            <p className="text-xs text-muted-foreground">
              Подключено: <code className="font-mono">{ref}</code>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            updateSettings.mutate({ supabaseAccessToken: null, supabaseProjectRef: null })
          }
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"
        >
          Отключить
        </button>
      </div>

      <div className="mt-6 flex gap-2 border-b border-border/60">
        {(
          [
            { id: "tables", label: "Таблицы", icon: TableIcon },
            { id: "sql", label: "SQL", icon: Play },
            { id: "migrations", label: "Миграции", icon: FileCode },
          ] as const
        ).map((t) => {
          const Ic = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm transition ${
                active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Ic className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "tables" ? (
        <div className="mt-4 grid grid-cols-[220px_1fr] gap-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
              Таблицы ({tables.length})
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loadingTables ? (
                <div className="p-4 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </div>
              ) : (
                tables.map((t) => {
                  const id = `${t.table_schema}.${t.table_name}`;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => openTable(t)}
                      className={`block w-full truncate px-3 py-1.5 text-left text-xs transition ${
                        selectedTable === id ? "bg-primary/15 text-primary" : "hover:bg-muted"
                      }`}
                      title={id}
                    >
                      <span className="text-muted-foreground">{t.table_schema}.</span>
                      {t.table_name}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="overflow-auto rounded-xl border border-border bg-card">
            {!selectedTable ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Выберите таблицу слева
              </div>
            ) : sqlBusy ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tableRows.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Пустая таблица
              </div>
            ) : (
              <ResultTable rows={tableRows as Record<string, unknown>[]} />
            )}
          </div>
        </div>
      ) : null}

      {tab === "sql" ? (
        <div className="mt-4">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={8}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            placeholder="SELECT * FROM public.metacore_keys LIMIT 10"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={runSql}
              disabled={sqlBusy || !sql.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {sqlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run
            </button>
            <span className="text-xs text-muted-foreground">⌘+Enter поддержит позже</span>
          </div>
          <div className="mt-4 overflow-auto rounded-xl border border-border bg-card">
            {sqlError ? (
              <div className="flex items-start gap-2 p-4 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                <pre className="whitespace-pre-wrap break-words">{sqlError}</pre>
              </div>
            ) : sqlResult == null ? (
              <div className="p-4 text-sm text-muted-foreground">Нажмите Run чтобы выполнить запрос.</div>
            ) : Array.isArray(sqlResult) ? (
              <ResultTable rows={sqlResult as Record<string, unknown>[]} />
            ) : (
              <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-xs">
                {JSON.stringify(sqlResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ) : null}

      {tab === "migrations" ? (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Проект:</label>
            <select
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {(apps.data ?? []).map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {migrations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
              В папке supabase/migrations/ этого проекта миграций не найдено.
            </div>
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {migrations.map((m) => {
                const s = applyStatus[m];
                return (
                  <li key={m} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-mono">{m}</div>
                      {s ? (
                        <div
                          className={`mt-0.5 inline-flex items-center gap-1 text-xs ${
                            s.ok ? "text-emerald-300" : "text-red-300"
                          }`}
                        >
                          {s.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                          {s.msg}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => applyMigration(m)}
                      disabled={applyBusy === m}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
                    >
                      {applyBusy === m ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Применить
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Пусто
      </div>
    );
  }
  const cols = Array.from(
    rows.reduce((s, r) => {
      Object.keys(r).forEach((k) => s.add(k));
      return s;
    }, new Set<string>()),
  );
  return (
    <table className="w-full text-xs">
      <thead className="border-b border-border/60 bg-muted/30">
        <tr>
          {cols.map((c) => (
            <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 500).map((r, i) => (
          <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
            {cols.map((c) => (
              <td key={c} className="px-3 py-1.5 font-mono">
                {renderValue(r[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return String(v).slice(0, 120);
}
