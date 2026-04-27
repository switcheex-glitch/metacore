import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useT } from "@/hooks/use-t";
import {
  usePrompts,
  useUpsertPrompt,
  useRemovePrompt,
} from "@/hooks/use-prompts";
import { useConfirm } from "@/components/confirm-dialog";
import type { Prompt } from "@/db/schema";

type EditorState = {
  id?: number;
  title: string;
  body: string;
  tags: string;
};

const EMPTY_EDITOR: EditorState = { title: "", body: "", tags: "" };

export function LibraryPage() {
  const t = useT();
  const prompts = usePrompts();
  const upsert = useUpsertPrompt();
  const remove = useRemovePrompt();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const id = window.setTimeout(() => setCopied(null), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const filtered = useMemo(() => {
    const list = prompts.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      const hay = `${p.title}\n${p.body}\n${p.tags ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [prompts.data, query]);

  function startNew() {
    setEditor({ ...EMPTY_EDITOR });
  }

  function startEdit(p: Prompt) {
    setEditor({ id: p.id, title: p.title, body: p.body, tags: p.tags ?? "" });
  }

  async function handleSave() {
    if (!editor) return;
    const title = editor.title.trim();
    const body = editor.body.trim();
    if (!title || !body) return;
    await upsert.mutateAsync({
      id: editor.id,
      title,
      body,
      tags: editor.tags.trim() || null,
    });
    setEditor(null);
  }

  async function handleRemove(p: Prompt) {
    const ok = await confirm({
      title: "Удалить промпт",
      message: `Удалить «${p.title}»? Действие нельзя отменить.`,
      confirmLabel: "Удалить",
      destructive: true,
    });
    if (ok) await remove.mutateAsync(p.id);
  }

  async function handleCopy(p: Prompt) {
    try {
      await navigator.clipboard.writeText(p.body);
      setCopied(p.id);
    } catch {
      // ignore — browser may block in non-secure contexts
    }
  }

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

      <div className="mx-auto w-full max-w-5xl px-8 py-14">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
            <BookOpen className="h-5 w-5 text-white/80" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              {t("library.title")}
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Сохраняй промпты, которые часто переиспользуешь — копируй одним кликом в чат.
            </p>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию, тексту или тегам…"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex flex-none items-center gap-1.5 rounded-xl border border-white/20 bg-white/15 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/25"
          >
            <Plus className="h-4 w-4" />
            Новый промпт
          </button>
        </div>

        {prompts.isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаю…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasQuery={Boolean(query.trim())}
            onCreate={startNew}
            totalCount={prompts.data?.length ?? 0}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((p) => (
              <PromptCard
                key={p.id}
                prompt={p}
                copied={copied === p.id}
                onCopy={() => handleCopy(p)}
                onEdit={() => startEdit(p)}
                onRemove={() => handleRemove(p)}
              />
            ))}
          </div>
        )}
      </div>

      {editor ? (
        <PromptEditorModal
          state={editor}
          setState={setEditor}
          onClose={() => setEditor(null)}
          onSave={handleSave}
          saving={upsert.isPending}
        />
      ) : null}
    </div>
  );
}

function EmptyState({
  hasQuery,
  onCreate,
  totalCount,
}: {
  hasQuery: boolean;
  onCreate: () => void;
  totalCount: number;
}) {
  if (hasQuery) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-sm text-white/60">Ничего не нашлось по запросу.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      <Sparkles className="mx-auto h-8 w-8 text-white/40" />
      <h2 className="mt-3 text-lg font-medium text-white">
        {totalCount === 0 ? "Тут пока пусто" : "Ничего нет"}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/55">
        Сохраняй здесь промпты, которые регулярно используешь: «отрефакторь компонент»,
        «добавь dark mode», «напиши API-роут» — а потом копируй в чат одним кликом.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/25"
      >
        <Plus className="h-4 w-4" />
        Создать первый промпт
      </button>
    </div>
  );
}

function PromptCard({
  prompt,
  copied,
  onCopy,
  onEdit,
  onRemove,
}: {
  prompt: Prompt;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const tags = (prompt.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return (
    <div className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-base font-medium text-white">
          {prompt.title}
        </h3>
        <div className="flex flex-none items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <IconButton onClick={onEdit} title="Изменить">
            <Pencil className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton onClick={onRemove} title="Удалить" destructive>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-white/55">
        {prompt.body}
      </p>

      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/55"
            >
              {tag}
            </span>
          ))}
          {tags.length > 4 ? (
            <span className="text-[10px] text-white/40">+{tags.length - 4}</span>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onCopy}
        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            Скопировано
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Скопировать
          </>
        )}
      </button>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        destructive
          ? "rounded-md p-1.5 text-white/50 transition hover:bg-rose-500/15 hover:text-rose-300"
          : "rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
      }
    >
      {children}
    </button>
  );
}

function PromptEditorModal({
  state,
  setState,
  onClose,
  onSave,
  saving,
}: {
  state: EditorState;
  setState: (s: EditorState) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const isNew = !state.id;
  const canSave = state.title.trim().length > 0 && state.body.trim().length > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/15 bg-black/90 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-white">
            {isNew ? "Новый промпт" : "Изменить промпт"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Название">
            <input
              type="text"
              value={state.title}
              onChange={(e) => setState({ ...state, title: e.target.value })}
              placeholder="Например: «Отрефакторь компонент»"
              maxLength={120}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30"
              autoFocus
            />
          </Field>

          <Field label="Текст промпта">
            <textarea
              value={state.body}
              onChange={(e) => setState({ ...state, body: e.target.value })}
              placeholder="Полный текст инструкции, который ты обычно копируешь в чат…"
              rows={10}
              className="w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30"
            />
            <div className="mt-1 text-right text-[10px] text-white/40">
              {state.body.length}/20000
            </div>
          </Field>

          <Field label="Теги (через запятую)" hint="React, refactor, TypeScript…">
            <input
              type="text"
              value={state.tags}
              onChange={(e) => setState({ ...state, tags: e.target.value })}
              placeholder="React, UI, refactor"
              maxLength={200}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30"
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/10"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !canSave}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isNew ? "Создать" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-white/55">
        {label}
        {hint ? <span className="ml-2 text-white/35">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
