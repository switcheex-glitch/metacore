import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import {
  Send,
  StopCircle,
  Bot,
  User,
  GitCommit,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Wrench,
  Loader2,
  CheckCircle2,
  XCircle,
  Check,
  Cpu,
  Paperclip,
  X,
  FileText,
  LayoutGrid,
  Users,
} from "lucide-react";
import type { ChatAttachment } from "@/ipc/ipc_types";
import { useDefaultChat, useMessages, useChatStream, type StreamedTool } from "@/hooks/use-chat";
import { useModels, useProviders, useSettings } from "@/hooks/use-providers";
import type { ChatMode } from "@/ipc/ipc_types";
import type { Message } from "@/db/schema";
import { parseMetacoreResponse } from "@/ai/response_processor";
import { useT } from "@/hooks/use-t";
import logoUrl from "@/assets/logo.svg";
import { invoke } from "@/ipc/ipc_client";
import { TEMPLATES, SECTIONS, UI_KITS, INTEGRATIONS, TOOLS, type HubItem } from "@/pages/hub";

function BrandLogo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="" className={className} />;
}

const SECTION_GALLERY: Array<{ id: string; title: string; desc: string; prompt: string }> = [
  {
    id: "hero",
    title: "Hero секция",
    desc: "Крупный заголовок, подзаголовок, 2 CTA-кнопки, иллюстрация справа",
    prompt:
      "Добавь в проект Hero-секцию: большой h1-заголовок, подзаголовок под ним, две CTA-кнопки (primary и outline), и справа иллюстрация с placeholder из Unsplash. Адаптивная вёрстка через Tailwind.",
  },
  {
    id: "pricing",
    title: "Прайсинг",
    desc: "3 тарифа (Starter / Pro / Enterprise) с чекпоинтами",
    prompt:
      "Добавь в проект секцию прайсинга: три карточки (Starter, Pro, Enterprise) с ценой, списком преимуществ и кнопкой. Pro выделить как популярный. Tailwind + shadcn/ui Card.",
  },
  {
    id: "testimonials",
    title: "Отзывы",
    desc: "Карусель из 3 отзывов с аватарами",
    prompt:
      "Добавь секцию отзывов: 3 карточки с текстом отзыва, аватаром, именем и должностью клиента. Карусель или grid на десктопе. Tailwind.",
  },
  {
    id: "features",
    title: "Фичи 3×2",
    desc: "6 фич с иконками lucide-react",
    prompt:
      "Добавь секцию с 6 фичами (grid 3×2 на десктопе, 1 колонка на мобильном). Каждая фича: иконка из lucide-react, заголовок, короткое описание.",
  },
  {
    id: "faq",
    title: "FAQ",
    desc: "Аккордеон вопросов",
    prompt:
      "Добавь FAQ-секцию: 6 вопросов в аккордеоне. Используй shadcn/ui Accordion если установлен, иначе собственный <details>. Tailwind.",
  },
  {
    id: "cta",
    title: "CTA блок",
    desc: "Большой баннер «Начать сейчас» с кнопкой",
    prompt:
      "Добавь секцию-баннер: крупный призыв к действию, подзаголовок, большая CTA-кнопка. Фон — градиент. Tailwind.",
  },
  {
    id: "footer",
    title: "Футер",
    desc: "Логотип, 3 колонки ссылок, копирайт",
    prompt:
      "Добавь footer: слева логотип и слоган, справа 3 колонки ссылок (Продукт / Компания / Соцсети). Внизу — копирайт. Tailwind, адаптивный.",
  },
  {
    id: "contact",
    title: "Контакт-форма",
    desc: "Имя, email, сообщение + submit",
    prompt:
      "Добавь секцию с контакт-формой: имя, email, сообщение, кнопка «Отправить». Валидация через react-hook-form + zod если установлены, иначе — HTML5. Tailwind + shadcn/ui Input, Textarea, Button.",
  },
];

function buildPencilContext(p: PencilPickCtx): string {
  return `\n\n[Карандаш] Пользователь указал на элемент: ${p.selector}\nТэг: ${p.tag}\nТекст: ${p.text.slice(0, 200) || "(нет)"}\nHTML: ${p.html.slice(0, 400)}\nИзмени ТОЛЬКО этот элемент.`;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove: () => void;
}) {
  if (attachment.kind === "image") {
    const url = `data:${attachment.mediaType};base64,${attachment.dataBase64}`;
    return (
      <div className="group relative h-14 w-14 flex-none overflow-hidden rounded-md border border-border bg-muted">
        <img src={url} alt={attachment.name} className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
          title="Удалить"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
      <FileText className="h-3 w-3 text-muted-foreground" />
      <span className="max-w-[140px] truncate">{attachment.name}</span>
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

const MODES: Array<{ id: ChatMode; labelKey: "mode.build" | "mode.ask" | "mode.agent" | "mode.plan" }> = [
  { id: "agent", labelKey: "mode.agent" },
  { id: "planning", labelKey: "mode.plan" },
];

export type PencilPickCtx = {
  selector: string;
  tag: string;
  text: string;
  html: string;
};

export function ChatPanel({
  appSlug,
  pendingErrorPrompt,
  clearPendingErrorPrompt,
  pencilPick,
  clearPencilPick,
}: {
  appSlug: string;
  pendingErrorPrompt?: string | null;
  clearPendingErrorPrompt?: () => void;
  pencilPick?: PencilPickCtx | null;
  clearPencilPick?: () => void;
}) {
  const t = useT();
  const chatQuery = useDefaultChat(appSlug);
  const chatId = chatQuery.data?.id;
  const messagesQuery = useMessages(chatId);
  const stream = useChatStream(chatId);

  const settings = useSettings();
  const providers = useProviders();
  const models = useModels();

  const [mode, setMode] = useState<ChatMode>("agent");
  const [modelId, setModelId] = useState<string>("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [hubItemId, setHubItemId] = useState<string | null>(null);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());

  const ALL_HUB_ITEMS = useMemo<HubItem[]>(
    () => [...TEMPLATES, ...SECTIONS, ...UI_KITS, ...INTEGRATIONS, ...TOOLS],
    [],
  );
  const ownedHubItems = useMemo(
    () => ALL_HUB_ITEMS.filter((i) => ownedIds.has(i.id)),
    [ALL_HUB_ITEMS, ownedIds],
  );
  const selectedHub = useMemo(
    () => ownedHubItems.find((i) => i.id === hubItemId) ?? null,
    [ownedHubItems, hubItemId],
  );

  useEffect(() => {
    invoke<Array<{ itemId: string }>>("hub:purchases")
      .then((list) => setOwnedIds(new Set(list.map((p) => p.itemId))))
      .catch(() => setOwnedIds(new Set()));
  }, []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const m = settings.data?.defaultChatMode;
    if (m === "agent" || m === "planning") setMode(m);
  }, [settings.data?.defaultChatMode]);

  const availableModels = useMemo(() => {
    const list = models.data ?? [];
    const provs = providers.data ?? [];
    const byId = new Map(provs.map((p) => [p.id, p]));
    return list
      .map((m) => ({ ...m, provider: byId.get(m.providerId) }))
      .filter((m) => m.provider && (m.provider.authMode === "local" || m.provider.hasKey));
  }, [models.data, providers.data]);

  useEffect(() => {
    if (!modelId && availableModels.length > 0) {
      setModelId(availableModels[0]!.id);
    }
  }, [availableModels, modelId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messagesQuery.data?.length, stream.draft]);

  useEffect(() => {
    if (pendingErrorPrompt) {
      setInput(pendingErrorPrompt);
      clearPendingErrorPrompt?.();
    }
  }, [pendingErrorPrompt, clearPendingErrorPrompt]);

  useEffect(() => {
    try {
      const k = `pendingPromptForApp:${appSlug}`;
      const saved = localStorage.getItem(k);
      if (saved) {
        setInput(saved);
        localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
  }, [appSlug]);

  const tokensUsed = settings.data?.tokensUsed ?? 0;
  const tokensLimit = settings.data?.tokensLimit ?? 200;
  const quotaExceeded = tokensUsed >= tokensLimit;

  async function handleTeam() {
    const text = input.trim();
    if (!text || !chatId || stream.streaming || !modelId) return;
    setInput("");
    const roles: Array<{ role: string; prompt: string }> = [
      {
        role: "Designer",
        prompt: `Ты UI/UX-дизайнер в команде. Составь короткий план дизайна для: "${text}". Опиши layout, цвета, компоненты, иконки — не более 8 пунктов. Не пиши код, только план.`,
      },
      {
        role: "Backend",
        prompt: `Ты бекенд-разработчик. Запиши схему API и БД для задачи: "${text}". Таблицы, endpoints, валидация — тезисами.`,
      },
      {
        role: "Frontend",
        prompt: `Ты фронт-разработчик. Реализуй клиент на React+Tailwind согласно плану выше. Используй теги <metacore-write>. Сделай всё целиком, не заглушки.`,
      },
      {
        role: "QA",
        prompt: `Ты QA-инженер. Напиши тесты vitest для всего что реализовал фронт выше. Покрой happy-path и граничные случаи.`,
      },
    ];
    for (const r of roles) {
      try {
        await stream.send({
          prompt: `[${r.role}] ${r.prompt}`,
          modelId,
          mode,
          attachments: [],
        });
      } catch {
        break;
      }
    }
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || !chatId || stream.streaming) return;
    if (!modelId) {
      alert(t("chat.connectFirst"));
      return;
    }
    const toSend = attachments;
    const userText = text || "(см. вложения)";
    const pickContext = pencilPick ? buildPencilContext(pencilPick) : "";
    const finalPrompt = userText + pickContext;
    setInput("");
    setAttachments([]);
    clearPencilPick?.();
    try {
      await stream.send({
        prompt: finalPrompt,
        modelId,
        mode,
        attachments: toSend,
        extraSystemPrompt: selectedHub?.prompt,
      });
      setHubItemId(null);
    } catch (err) {
      alert(`${t("chat.startFailed")}: ${(err as Error).message}`);
    }
  }

  async function ingestFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const next: ChatAttachment[] = [];
    for (const f of arr) {
      if (attachments.length + next.length >= 10) break;
      if (f.size > 20 * 1024 * 1024) {
        alert(`${f.name}: слишком большой (макс 20 МБ)`);
        continue;
      }
      if (f.type.startsWith("image/")) {
        const buf = await f.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        next.push({ kind: "image", name: f.name, mediaType: f.type, dataBase64: b64 });
      } else {
        const content = await f.text();
        next.push({ kind: "text", name: f.name, content });
      }
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files);
    }
  }

  const messages = messagesQuery.data ?? [];

  const sendLabel =
    mode === "build"
      ? t("chat.send.build")
      : mode === "ask"
        ? t("chat.send.ask")
        : mode === "agent"
          ? t("chat.send.agent")
          : t("chat.send.plan");

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{chatQuery.data?.title ?? t("chat.newChat")}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{appSlug}</div>
          </div>
          <TokensBadge used={tokensUsed} limit={tokensLimit} />
        </div>
        <span className="flex-none text-xs text-muted-foreground">
          {t(messages.length === 1 ? "chat.msg" : "chat.msgs", { n: String(messages.length) })}
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {chatQuery.isLoading || messagesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">{t("chat.loading")}</div>
        ) : messages.length === 0 && !stream.streaming ? (
          <EmptyChatHint />
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <li key={m.id}>
                <MessageBubble message={m} />
              </li>
            ))}
            {stream.streaming ? (
              <li>
                <StreamingBubble
                  text={stream.draft}
                  reasoning={stream.reasoning}
                  tools={stream.tools}
                />
              </li>
            ) : null}
          </ul>
        )}
        {stream.error ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <span className="font-mono text-xs">{stream.error}</span>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-border/60 p-3">
        {quotaExceeded ? (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            <div className="min-w-0">
              <div className="font-medium">{t("chat.quotaReached")}</div>
              <div className="text-destructive/80">{t("chat.quotaReachedHint")}</div>
            </div>
          </div>
        ) : null}
        <div className="rounded-xl border border-border bg-card p-3">
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {attachments.map((a, i) => (
                <AttachmentChip
                  key={i}
                  attachment={a}
                  onRemove={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
              {attachments.some((a) => a.kind === "image") ? (
                <button
                  type="button"
                  onClick={() =>
                    setInput(
                      "Воссоздай пиксель-в-пиксель дизайн со скриншота на React + TypeScript + Tailwind. Структурируй по компонентам в src/components/. Подбери близкие шрифты, цвета, отступы и размеры. Используй плейсхолдерные изображения с Unsplash где нужно.",
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 transition hover:bg-cyan-500/20"
                  title="Заполнить промпт шаблоном для воссоздания дизайна"
                >
                  С нуля по скриншоту
                </button>
              ) : null}
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.json,.ts,.tsx,.js,.jsx,.css,.html,.yml,.yaml,.csv,.log,.py,.rs,.go,.java,.rb,.php,.sh"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void ingestFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {pencilPick ? (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-xs">
              <span className="font-medium text-purple-300">Выбрано карандашом:</span>
              <span className="min-w-0 flex-1 truncate font-mono text-purple-200" title={pencilPick.selector}>
                {pencilPick.selector}
                {pencilPick.text ? ` — "${pencilPick.text.slice(0, 60)}${pencilPick.text.length > 60 ? "…" : ""}"` : ""}
              </span>
              <button
                type="button"
                onClick={() => clearPencilPick?.()}
                className="text-purple-300/70 hover:text-purple-200"
                title="Сбросить"
              >
                ✕
              </button>
            </div>
          ) : null}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              quotaExceeded
                ? t("chat.quotaReached")
                : mode === "ask"
                  ? t("chat.placeholderAsk")
                  : t("chat.placeholder")
            }
            rows={3}
            disabled={quotaExceeded}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="mt-2 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Прикрепить файл или изображение"
              className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setGalleryOpen((v) => !v)}
                title="Галерея готовых секций"
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              {galleryOpen ? (
                <div className="absolute bottom-9 left-0 z-50 w-80 rounded-lg border border-border bg-popover p-2 shadow-xl">
                  <div className="mb-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Готовые секции
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {SECTION_GALLERY.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setInput(s.prompt);
                          setGalleryOpen(false);
                        }}
                        className="block w-full rounded-md px-2 py-2 text-left transition hover:bg-muted"
                      >
                        <div className="text-sm font-medium text-foreground">{s.title}</div>
                        <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <ModeSelect mode={mode} onChange={setMode} />
            <ModelSelect
              modelId={modelId}
              onChange={setModelId}
              availableModels={availableModels}
            />
            <HubSelect
              items={ownedHubItems}
              selectedId={hubItemId}
              onChange={setHubItemId}
            />
            {availableModels.length === 0 ? (
              <span className="truncate text-destructive">{t("chat.noProvider")}</span>
            ) : null}
            <div className="ml-auto flex flex-none items-center gap-2">
              {stream.streaming ? (
                <button
                  type="button"
                  onClick={() => stream.abort()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition hover:opacity-90"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  {t("chat.stop")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleTeam}
                    disabled={!input.trim() || !modelId || quotaExceeded}
                    title="Команда: Designer → Backend → Frontend → QA"
                    aria-label="Команда агентов"
                    className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary transition hover:bg-primary/20 disabled:opacity-50"
                  >
                    <Users className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || !modelId || quotaExceeded}
                    title={quotaExceeded ? t("chat.quotaReached") : undefined}
                    className="inline-flex h-7 flex-none items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {quotaExceeded ? t("chat.quotaReached") : sendLabel}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}

function TokensBadge({ used, limit }: { used: number; limit: number }) {
  const t = useT();
  const safeLimit = limit > 0 ? limit : 1;
  const ratio = Math.min(used / safeLimit, 1);
  const exceeded = used >= limit;
  const tone = exceeded
    ? "border-destructive/50 bg-destructive/10 text-destructive"
    : ratio >= 0.9
      ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
      : ratio >= 0.5
        ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
  return (
    <span
      title={t("chat.tokensTooltip", { used: String(used), limit: String(limit) })}
      className={`flex-none rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${tone}`}
    >
      {t("chat.tokensValue", { used: String(used), limit: String(limit) })} {t("chat.tokensLabel")}
    </span>
  );
}

function EmptyChatHint() {
  const t = useT();
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
      <BrandLogo className="mx-auto mb-2 h-8 w-8" />
      <div className="font-medium text-foreground">{t("chat.emptyTitle")}</div>
      <div className="mt-1">{t("chat.emptyBody")}</div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const t = useT();
  if (message.role === "user") {
    return (
      <div className="flex items-start justify-end gap-3">
        <div className="min-w-0 max-w-[80%] rounded-xl bg-primary/90 px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
        <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-muted text-foreground">
          <User className="h-3.5 w-3.5" />
        </div>
      </div>
    );
  }
  const parsed = parseMetacoreResponse(message.content);
  const persistedTools = mergePersistedTools(message.toolCalls, message.toolResults);
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/15 text-primary">
        <BrandLogo className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {persistedTools.length > 0 ? <ToolLog tools={persistedTools} /> : null}
        {parsed.textWithoutTags ? (
          <div className="rounded-xl bg-card px-3 py-2 text-sm">
            <pre className="whitespace-pre-wrap break-words font-sans">
              {parsed.textWithoutTags}
            </pre>
          </div>
        ) : null}
        {parsed.tags.length > 0 ? (
          <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-xs">
            <div className="mb-1 font-medium text-muted-foreground">{t("chat.changes")}</div>
            <ul className="space-y-0.5">
              {parsed.tags.map((tag, i) => (
                <li key={i} className="font-mono">
                  {tag.kind === "write" && `✏️ ${tag.path}${tag.description ? ` — ${tag.description}` : ""}`}
                  {tag.kind === "rename" && `↪️ ${tag.from} → ${tag.to}`}
                  {tag.kind === "delete" && `🗑 ${tag.path}`}
                  {tag.kind === "add-dependency" && `📦 ${tag.packages.join(" ")}`}
                  {tag.kind === "execute-sql" && `🗄 SQL: ${tag.description ?? "(migration)"}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {message.commitHash ? (
          <div className="inline-flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
            <GitCommit className="h-3 w-3" /> {message.commitHash.slice(0, 7)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StreamingBubble({
  text,
  reasoning,
  tools,
}: {
  text: string;
  reasoning: string;
  tools: StreamedTool[];
}) {
  const t = useT();
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/15 text-primary">
        <BrandLogo className="h-4 w-4 animate-pulse" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {reasoning ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">{t("chat.thinking")}</div>
            <pre className="whitespace-pre-wrap break-words font-sans">{reasoning}</pre>
          </div>
        ) : null}
        {tools.length > 0 ? <ToolLog tools={tools} live /> : null}
        {text || !tools.length ? (
          <div className="rounded-xl bg-card px-3 py-2 text-sm">
            <pre className="whitespace-pre-wrap break-words font-sans">{text || "…"}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function mergePersistedTools(callsJson: string | null, resultsJson: string | null): StreamedTool[] {
  if (!callsJson) return [];
  let calls: Array<{ name: string; args: unknown }> = [];
  let results: Array<{ name: string; result?: unknown; error?: string }> = [];
  try {
    const parsed = JSON.parse(callsJson);
    if (Array.isArray(parsed)) calls = parsed;
  } catch {
    return [];
  }
  if (resultsJson) {
    try {
      const parsed = JSON.parse(resultsJson);
      if (Array.isArray(parsed)) results = parsed;
    } catch {
      // ignore
    }
  }
  const resultsByName = new Map<string, Array<{ result?: unknown; error?: string }>>();
  for (const r of results) {
    const bucket = resultsByName.get(r.name) ?? [];
    bucket.push({ result: r.result, error: r.error });
    resultsByName.set(r.name, bucket);
  }
  return calls.map((c) => {
    const bucket = resultsByName.get(c.name);
    const r = bucket?.shift();
    return { name: c.name, args: c.args, result: r?.result, error: r?.error };
  });
}

function ToolLog({ tools, live }: { tools: StreamedTool[]; live?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const completed = tools.filter((x) => x.result !== undefined || x.error).length;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-muted-foreground transition hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5" />
        <span>
          {t("chat.toolCalls", { done: String(completed), total: String(tools.length) })}
        </span>
        {live && completed < tools.length ? (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-primary" />
        ) : null}
      </button>
      {open ? (
        <ul className="space-y-1 border-t border-border/60 px-3 py-2">
          {tools.map((tool, i) => (
            <li key={i}>
              <ToolChip tool={tool} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ToolChip({ tool }: { tool: StreamedTool }) {
  const [open, setOpen] = useState(false);
  const done = tool.result !== undefined || tool.error !== undefined;
  const failed = Boolean(tool.error);
  return (
    <div className="rounded-md bg-muted/30 px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        {!done ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        ) : failed ? (
          <XCircle className="h-3 w-3 text-destructive" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
        <span className="font-mono text-[11px] text-foreground">{tool.name}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {formatToolArgs(tool.args)}
        </span>
        {open ? (
          <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <div className="mt-1 space-y-1">
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded bg-background/60 p-1.5 font-mono text-[10px] text-muted-foreground">
            {safeStringify(tool.args)}
          </pre>
          {tool.error ? (
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded bg-destructive/10 p-1.5 font-mono text-[10px] text-destructive">
              {tool.error}
            </pre>
          ) : tool.result !== undefined ? (
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded bg-background/60 p-1.5 font-mono text-[10px] text-foreground">
              {safeStringify(tool.result)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function shortenModelName(name: string): string {
  return name
    .replace(/\s*\((local|preview|beta|experimental)\)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatToolArgs(args: unknown): string {
  if (args === null || args === undefined) return "";
  if (typeof args === "string") return args.length > 60 ? args.slice(0, 60) + "…" : args;
  try {
    const s = JSON.stringify(args);
    return s.length > 60 ? s.slice(0, 60) + "…" : s;
  } catch {
    return "";
  }
}

function safeStringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function ModeSelect({ mode, onChange }: { mode: ChatMode; onChange: (m: ChatMode) => void }) {
  const t = useT();
  return (
    <div className="flex h-7 flex-none items-center rounded-md border border-border bg-background p-0.5">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`rounded-sm px-2 text-xs font-medium leading-6 transition ${
            mode === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(m.labelKey)}
        </button>
      ))}
    </div>
  );
}

type ModelOption = {
  id: string;
  providerId: string;
  name: string;
  displayName: string;
  contextWindow: number;
  pricingTier: string | null;
  provider?: { id: string; name: string };
};

const VENDOR_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  moonshotai: "Moonshot AI",
  "z-ai": "Z.AI",
  minimax: "MiniMax",
  openrouter: "OpenRouter",
  mistralai: "Mistral",
  meta: "Meta",
  "meta-llama": "Meta",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  cohere: "Cohere",
  xai: "xAI",
  perplexity: "Perplexity",
};

function vendorFromModel(m: ModelOption): { id: string; label: string } {
  if (m.providerId !== "openrouter") {
    return { id: m.provider?.id ?? m.providerId, label: m.provider?.name ?? m.providerId };
  }
  const slash = m.name.indexOf("/");
  const vendor = slash === -1 ? m.name : m.name.slice(0, slash);
  return { id: vendor, label: VENDOR_LABELS[vendor] ?? vendor };
}

function pricingPillClasses(tier: string | null): string {
  const base =
    "flex-none whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold leading-none";
  if (!tier) return `${base} bg-muted text-muted-foreground`;
  const t = tier.toLowerCase();
  if (t === "free") return `${base} bg-emerald-500/15 text-emerald-500`;
  if (t === "local") return `${base} bg-sky-500/15 text-sky-400`;
  if (tier.startsWith("$")) {
    const dollars = tier.length;
    if (dollars <= 2) return `${base} bg-emerald-500/15 text-emerald-500`;
    if (dollars === 3) return `${base} bg-amber-500/15 text-amber-400`;
    return `${base} bg-rose-500/15 text-rose-400`;
  }
  return `${base} bg-muted text-muted-foreground`;
}

function renderPricingTier(tier: string | null): string {
  if (!tier) return "";
  if (tier.startsWith("$")) {
    const n = Math.min(tier.length, 4);
    return "$".repeat(n);
  }
  return tier;
}

function ModelSelect({
  modelId,
  onChange,
  availableModels,
}: {
  modelId: string;
  onChange: (id: string) => void;
  availableModels: ModelOption[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = availableModels.find((m) => m.id === modelId);
  const selectedShort = selected ? shortenModelName(selected.displayName) : "";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  const grouped = useMemo(() => {
    const order: string[] = [];
    const byVendor = new Map<string, { name: string; items: ModelOption[] }>();
    for (const m of availableModels) {
      const { id, label } = vendorFromModel(m);
      if (!byVendor.has(id)) {
        byVendor.set(id, { name: label, items: [] });
        order.push(id);
      }
      byVendor.get(id)!.items.push(m);
    }
    return order.map((key) => ({ id: key, ...byVendor.get(key)! }));
  }, [availableModels]);

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-shrink">
      <button
        type="button"
        disabled={availableModels.length === 0}
        onClick={() => setOpen((v) => !v)}
        title={selected ? `${selected.displayName} · ${selected.provider?.name}` : undefined}
        className="inline-flex h-7 max-w-[150px] flex-none items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
      >
        <Cpu className="h-3.5 w-3.5 flex-none text-muted-foreground" />
        {selected ? (
          <span className="truncate">{selectedShort}</span>
        ) : (
          <span className="truncate text-muted-foreground">{t("chat.noModels")}</span>
        )}
        <ChevronDown className={`h-3 w-3 flex-none text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && availableModels.length > 0 ? (
        <div className="absolute bottom-full left-0 z-30 mb-1 max-h-80 w-[min(320px,70vw)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
          {grouped.map((group, gi) => (
            <div key={group.id} className={gi > 0 ? "mt-1" : ""}>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </div>
              {group.items.map((m) => {
                const active = m.id === modelId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                      active ? "bg-primary/15 text-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <Check className={`h-3.5 w-3.5 flex-none ${active ? "text-primary" : "opacity-0"}`} />
                    <span className="min-w-0 flex-1 truncate font-medium">{m.displayName}</span>
                    {m.pricingTier ? (
                      <span className={pricingPillClasses(m.pricingTier)}>
                        {renderPricingTier(m.pricingTier)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HubSelect({
  items,
  selectedId,
  onChange,
}: {
  items: HubItem[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
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

  if (items.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={selected ? `Активирован товар: ${selected.name}` : "Применить купленный товар"}
        className={`inline-flex h-7 max-w-[120px] flex-none items-center gap-1 rounded-md border px-2 text-xs font-medium transition ${
          selected
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
            : "border-border bg-background hover:bg-muted"
        }`}
      >
        <Check className={`h-3 w-3 flex-none ${selected ? "text-emerald-400" : "opacity-40"}`} />
        <span className="truncate">{selected ? selected.name : "HUB APP"}</span>
      </button>
      {open ? (
        <div className="absolute bottom-9 left-0 z-50 w-72 rounded-lg border border-border bg-popover p-1 shadow-xl">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-muted"
          >
            <span className={`h-3 w-3 flex-none rounded-sm border ${!selected ? "bg-primary" : ""}`} />
            <span className="flex-1">Без товара</span>
          </button>
          <div className="my-1 border-t border-border/60" />
          <div className="max-h-64 overflow-y-auto">
            {items.map((it) => {
              const active = selectedId === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onChange(it.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                    active ? "bg-emerald-500/10" : "hover:bg-muted"
                  }`}
                >
                  <Check className={`mt-0.5 h-3 w-3 flex-none ${active ? "text-emerald-400" : "opacity-0"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{it.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{it.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
