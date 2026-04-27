import { useMemo, useState } from "react";
import { useAtom } from "jotai";
import {
  Check,
  Loader2,
  Plug,
  Plus,
  Trash2,
  Server,
  Globe,
  Github,
  ExternalLink,
  Database,
  MessageSquare,
  Settings as SettingsIcon,
  Boxes,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings, useUpdateSettings } from "@/hooks/use-providers";
import { useConfirm } from "@/components/confirm-dialog";
import { useT } from "@/hooks/use-t";
import { languageAtom, type Language } from "@/atoms/language";
import {
  useMcpServers,
  useUpsertMcpServer,
  useRemoveMcpServer,
  type McpServerView,
  type McpUpsertPayload,
} from "@/hooks/use-mcp";

export function SettingsPage() {
  const t = useT();

  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 15% 10%, rgba(139,92,246,0.10), transparent 55%), radial-gradient(circle at 85% 90%, rgba(244,114,182,0.07), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />

      <div className="mx-auto w-full max-w-3xl px-8 py-14">
        <div className="mb-12 flex items-start gap-4">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
            <SettingsIcon className="h-5 w-5 text-white/80" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              {t("settings.title")}
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Подстрой Metacore под себя — язык, режим чата, обновления и интеграции.
            </p>
          </div>
        </div>

        <SettingsGroup
          icon={<MessageSquare className="h-4 w-4" />}
          title="Чат"
          hint="Как Metacore общается с тобой по умолчанию."
        >
          <LanguageToggle />
          <DefaultChatModeToggle />
        </SettingsGroup>

        <SettingsGroup
          icon={<Sparkles className="h-4 w-4" />}
          title="Приложение"
          hint="Канал обновлений и анонимная телеметрия."
        >
          <ReleaseChannelToggle />
          <TelemetryToggle />
        </SettingsGroup>

        <SettingsGroup
          icon={<Plug className="h-4 w-4" />}
          title="Подключения"
          hint="GitHub для one-click Connect и Supabase для бекенда твоих приложений."
        >
          <GithubOAuthClientIdCard />
          <SupabaseConnectCard />
        </SettingsGroup>

        <SettingsGroup
          icon={<Boxes className="h-4 w-4" />}
          title={t("settings.mcpServers")}
          hint={t("settings.mcpHint")}
        >
          <McpServerList />
        </SettingsGroup>
      </div>
    </div>
  );
}

function SettingsGroup({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-md">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-medium text-white">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-white/50">{hint}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function LanguageToggle() {
  const t = useT();
  const [lang, setLang] = useAtom(languageAtom);
  const options: { id: Language; label: string }[] = [
    { id: "ru", label: "Русский" },
    { id: "en", label: "English" },
  ];
  return (
    <ToggleRow title={t("settings.language")} hint={t("settings.languageHint")}>
      <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5 text-sm">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setLang(opt.id)}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition",
              lang === opt.id
                ? "bg-white/15 text-white shadow-sm"
                : "text-white/60 hover:text-white",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </ToggleRow>
  );
}

function DefaultChatModeToggle() {
  const t = useT();
  const { data } = useSettings();
  const { mutate, isPending } = useUpdateSettings();
  const modes = ["build", "ask", "agent", "planning"] as const;
  const current = data?.defaultChatMode ?? "build";
  return (
    <ToggleRow title={t("settings.defaultMode")} hint={t("settings.defaultModeHint")}>
      <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5 text-sm">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            disabled={isPending}
            onClick={() => mutate({ defaultChatMode: m })}
            className={cn(
              "rounded-md px-3 py-1 font-medium capitalize transition",
              current === m ? "bg-white/15 text-white shadow-sm" : "text-white/60 hover:text-white",
            )}
          >
            {m}
          </button>
        ))}
      </div>
    </ToggleRow>
  );
}

function ReleaseChannelToggle() {
  const t = useT();
  const { data } = useSettings();
  const { mutate, isPending } = useUpdateSettings();
  const current = data?.releaseChannel ?? "stable";
  return (
    <ToggleRow title={t("settings.releaseChannel")} hint={t("settings.releaseChannelHint")}>
      <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5 text-sm">
        {(["stable", "beta"] as const).map((c) => (
          <button
            key={c}
            type="button"
            disabled={isPending}
            onClick={() => mutate({ releaseChannel: c })}
            className={cn(
              "rounded-md px-3 py-1 font-medium capitalize transition",
              current === c ? "bg-white/15 text-white shadow-sm" : "text-white/60 hover:text-white",
            )}
          >
            {c}
          </button>
        ))}
      </div>
    </ToggleRow>
  );
}

function TelemetryToggle() {
  const t = useT();
  const { data } = useSettings();
  const { mutate, isPending } = useUpdateSettings();
  const enabled = data?.telemetryOptIn ?? false;
  return (
    <ToggleRow title={t("settings.telemetry")} hint={t("settings.telemetryHint")}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => mutate({ telemetryOptIn: !enabled })}
        className={cn(
          "relative h-6 w-11 rounded-full border transition",
          enabled
            ? "border-emerald-400/40 bg-emerald-500/40"
            : "border-white/15 bg-white/[0.06]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            enabled ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </ToggleRow>
  );
}

function ToggleRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <div className="mr-4 min-w-0">
        <h3 className="text-sm font-medium text-white">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-white/50">{hint}</p>
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

function GithubOAuthClientIdCard() {
  const t = useT();
  const { data } = useSettings();
  const { mutate, isPending } = useUpdateSettings();
  const saved = data?.githubOAuthClientId ?? null;
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);

  const registerUrl =
    "https://github.com/settings/applications/new?" +
    new URLSearchParams({
      "oauth_application[name]": "Metacore",
      "oauth_application[url]": "https://github.com",
      "oauth_application[callback_url]": "http://127.0.0.1",
    }).toString();

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <Github className="h-4 w-4 text-white/70" />
        <h3 className="text-sm font-medium text-white">{t("settings.githubOAuth")}</h3>
        {saved ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <Check className="h-3 w-3" /> {t("settings.connected")}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/50">
        {t("settings.githubOAuthHint")}{" "}
        <a
          href={registerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-white/80 underline underline-offset-2 hover:text-white"
        >
          {t("settings.githubRegisterApp")} <ExternalLink className="h-3 w-3" />
        </a>
        . {t("settings.githubEnableDeviceFlow")}
      </p>

      {!editing && saved ? (
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-xs text-white/70">
            {saved}
          </code>
          <button
            type="button"
            onClick={() => {
              setValue(saved);
              setEditing(true);
            }}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
          >
            {t("settings.edit")}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => mutate({ githubOAuthClientId: null })}
            className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15"
          >
            {t("settings.remove")}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ov23li…"
            className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30"
          />
          <button
            type="button"
            disabled={isPending || value.trim().length === 0}
            onClick={() =>
              mutate(
                { githubOAuthClientId: value.trim() },
                { onSuccess: () => setEditing(false) },
              )
            }
            className="rounded-lg border border-white/20 bg-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-50"
          >
            {isPending ? t("settings.saving") : t("settings.save")}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10"
            >
              {t("settings.cancel")}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SupabaseConnectCard() {
  const { data } = useSettings();
  const { mutate, isPending } = useUpdateSettings();
  const savedUrl = data?.supabaseUrl ?? null;
  const savedKey = data?.supabaseAnonKey ?? null;
  const connected = Boolean(savedUrl && savedKey);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");

  function parseCombined(input: string): { url?: string; key?: string } {
    const s = input.trim();
    if (!s) return {};
    const urlMatch = s.match(/https?:\/\/[^\s,;|]+\.supabase\.co[^\s,;|]*/i);
    const keyMatch = s.match(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/);
    return {
      url: urlMatch?.[0],
      key: keyMatch?.[0],
    };
  }

  function handleUrlChange(v: string) {
    const parsed = parseCombined(v);
    if (parsed.url && parsed.key && (parsed.url !== v || parsed.key !== v)) {
      setUrl(parsed.url);
      setKey(parsed.key);
      return;
    }
    setUrl(v);
  }

  function handleSave() {
    const finalUrl = url.trim();
    const finalKey = key.trim();
    if (!finalUrl || !finalKey) return;
    mutate(
      { supabaseUrl: finalUrl, supabaseAnonKey: finalKey },
      {
        onSuccess: () => {
          setEditing(false);
          setUrl("");
          setKey("");
        },
      },
    );
  }

  function handleDisconnect() {
    mutate({ supabaseUrl: null, supabaseAnonKey: null });
    setEditing(false);
    setUrl("");
    setKey("");
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-medium text-white">Supabase</h3>
        {connected && !editing ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <Check className="h-3 w-3" /> Подключено
          </span>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-white/50">
        Подключи проект одним кликом: вставь Project URL + anon/publishable key, либо целиком строку из панели{" "}
        <a
          href="https://supabase.com/dashboard/project/_/settings/api"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-white/80 underline underline-offset-2 hover:text-white"
        >
          Supabase → Settings → API <ExternalLink className="h-3 w-3" />
        </a>
        .
      </p>

      {connected && !editing ? (
        <div className="mt-4 space-y-2">
          <div className="truncate rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-xs text-white/70">{savedUrl}</div>
          <div className="truncate rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-xs text-white/70">
            {savedKey ? savedKey.slice(0, 12) + "…" + savedKey.slice(-6) : ""}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUrl(savedUrl ?? "");
                setKey(savedKey ?? "");
                setEditing(true);
              }}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
            >
              Изменить
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isPending}
              className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15"
            >
              Отключить
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <input
            type="text"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://xxxx.supabase.co или вставь URL+key целиком"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-mono text-white outline-none placeholder:text-white/30 transition focus:border-white/30"
          />
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="eyJhbGciOi… (anon / publishable key)"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-mono text-white outline-none placeholder:text-white/30 transition focus:border-white/30"
          />
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !url.trim() || !key.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              Подключить
            </button>
            {editing ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10"
              >
                Отмена
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function McpServerList() {
  const t = useT();
  const servers = useMcpServers();
  const [draft, setDraft] = useState<McpUpsertPayload | null>(null);

  return (
    <div className="space-y-3">
      {servers.isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("settings.loadingMcp")}
        </div>
      ) : null}
      {servers.error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {t("settings.loadMcpFailed")}: {(servers.error as Error).message}
        </div>
      ) : null}
      {servers.data?.map((s) => <McpServerCard key={s.id} server={s} />)}
      {servers.data && servers.data.length === 0 && !draft ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-white/55">
          {t("settings.noMcp")}
        </div>
      ) : null}

      {draft ? (
        <McpServerEditor
          initial={draft}
          onCancel={() => setDraft(null)}
          onSaved={() => setDraft(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() =>
            setDraft({
              name: "",
              transport: "stdio",
              command: "",
              args: [],
              env: {},
              url: "",
              enabled: true,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" /> {t("settings.addMcp")}
        </button>
      )}
    </div>
  );
}

function McpServerCard({ server }: { server: McpServerView }) {
  const t = useT();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const upsert = useUpsertMcpServer();
  const remove = useRemoveMcpServer();

  if (editing) {
    return (
      <McpServerEditor
        initial={{
          id: server.id,
          name: server.name,
          transport: server.transport,
          command: server.command ?? "",
          args: server.args,
          env: server.env,
          url: server.url ?? "",
          enabled: server.enabled,
        }}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {server.transport === "stdio" ? (
              <Server className="h-4 w-4 text-white/70" />
            ) : (
              <Globe className="h-4 w-4 text-white/70" />
            )}
            <h3 className="truncate text-sm font-medium text-white">{server.name}</h3>
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/60">
              {server.transport}
            </span>
            {server.enabled ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                <Plug className="h-3 w-3" /> {t("settings.enabled")}
              </span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/50">
                {t("settings.disabled")}
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate font-mono text-xs text-white/45">
            {server.transport === "stdio"
              ? `${server.command ?? ""} ${server.args.join(" ")}`.trim() || "(no command)"
              : server.url || "(no URL)"}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            disabled={upsert.isPending}
            onClick={() =>
              upsert.mutate({
                id: server.id,
                name: server.name,
                transport: server.transport,
                command: server.command,
                args: server.args,
                env: server.env,
                url: server.url,
                enabled: !server.enabled,
              })
            }
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
          >
            {server.enabled ? t("settings.disable") : t("settings.enable")}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
          >
            {t("settings.edit")}
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Удалить MCP-сервер",
                message: t("settings.removeMcpConfirm", { name: server.name }),
                confirmLabel: "Удалить",
                destructive: true,
              });
              if (ok) remove.mutate(server.id);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-400/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function McpServerEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: McpUpsertPayload;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const upsert = useUpsertMcpServer();
  const [name, setName] = useState(initial.name);
  const [transport, setTransport] = useState<"stdio" | "http">(initial.transport);
  const [command, setCommand] = useState(initial.command ?? "");
  const [argsText, setArgsText] = useState((initial.args ?? []).join(" "));
  const [envText, setEnvText] = useState(
    Object.entries(initial.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );
  const [url, setUrl] = useState(initial.url ?? "");
  const [enabled, setEnabled] = useState(initial.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  const parsedArgs = useMemo(
    () =>
      argsText
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [argsText],
  );
  const parsedEnv = useMemo(() => {
    const out: Record<string, string> = {};
    for (const raw of envText.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return out;
  }, [envText]);

  function save() {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("settings.nameRequired"));
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      setError(t("settings.commandRequired"));
      return;
    }
    if (transport === "http" && !url.trim()) {
      setError(t("settings.urlRequired"));
      return;
    }
    upsert.mutate(
      {
        id: initial.id,
        name: trimmedName,
        transport,
        command: transport === "stdio" ? command.trim() : null,
        args: transport === "stdio" ? parsedArgs : null,
        env: transport === "stdio" ? parsedEnv : null,
        url: transport === "http" ? url.trim() : null,
        enabled,
      },
      {
        onSuccess: () => onSaved(),
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  const labelClass = "mb-1 block text-xs font-medium text-white/55";
  const inputClass =
    "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-white/30";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="space-y-3">
        <div>
          <label className={labelClass}>{t("settings.name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="filesystem"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t("settings.transport")}</label>
          <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5 text-sm">
            {(["stdio", "http"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTransport(t)}
                className={cn(
                  "rounded-md px-3 py-1 font-medium capitalize transition",
                  transport === t
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-white/60 hover:text-white",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {transport === "stdio" ? (
          <>
            <div>
              <label className={labelClass}>{t("settings.command")}</label>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>{t("settings.arguments")}</label>
              <input
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder="-y @modelcontextprotocol/server-filesystem /path"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>{t("settings.environment")}</label>
              <textarea
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                rows={3}
                placeholder="TOKEN=abc"
                className={`${inputClass} resize-y font-mono text-xs`}
              />
            </div>
          </>
        ) : (
          <div>
            <label className={labelClass}>{t("settings.url")}</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className={`${inputClass} font-mono`}
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-xs font-medium text-white/70">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-3.5 w-3.5 accent-white"
          />
          {t("settings.enabled")}
        </label>

        {error ? <div className="text-xs text-rose-300">{error}</div> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10"
          >
            {t("settings.cancel")}
          </button>
          <button
            type="button"
            disabled={upsert.isPending}
            onClick={save}
            className="rounded-lg border border-white/20 bg-white/15 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/25 disabled:opacity-50"
          >
            {upsert.isPending ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

