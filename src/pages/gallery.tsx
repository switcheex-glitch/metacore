import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Store, Users, GitFork, Loader2, Share2, Trash2 } from "lucide-react";
import { invoke } from "@/ipc/ipc_client";
import { useConfirm } from "@/components/confirm-dialog";
import { useSettings } from "@/hooks/use-providers";

type GalleryItem = {
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
};

function formatRub(kopecks: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
}

export function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState<string | null>(null);
  const [unpublishing, setUnpublishing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const settings = useSettings();
  const myKey = settings.data?.metacoreKey ?? null;

  async function reload() {
    try {
      const list = await invoke<GalleryItem[]>("gallery:list");
      setItems(list);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function handleFork(it: GalleryItem) {
    const price = it.price_kopecks ?? 0;
    if (price > 0) {
      const ok = await confirm({
        title: "Платный товар",
        message: `Сумма ${formatRub(price)} будет списана с вашего кошелька. 70% отправится автору. Продолжить?`,
        confirmLabel: `Купить за ${formatRub(price)}`,
      });
      if (!ok) return;
    }
    setForking(it.id);
    try {
      const res = await invoke<{
        ok: boolean;
        appSlug?: string;
        reason?: string;
        priceKopecks?: number;
      }>("gallery:fork", { id: it.id });
      if (res.ok && res.appSlug) {
        await navigate({ to: "/apps/$slug", params: { slug: res.appSlug } });
        return;
      }
      const messages: Record<string, string> = {
        insufficient_funds: "Недостаточно средств. Пополни кошелёк в Hub.",
        bad_key: "Ключ Metacore не найден на сервере. Перевыпусти его в Dashboard.",
        no_license: "Сначала активируй ключ Metacore в Dashboard.",
        not_found: "Этот товар больше недоступен в галерее.",
        owner: "Это твой проект — нечего покупать. Открой через «Мои проекты».",
      };
      setToast(
        messages[res.reason ?? ""] ?? `Не удалось: ${res.reason ?? "неизвестная ошибка"}`,
      );
    } catch (e) {
      setToast(`Ошибка: ${(e as Error).message}`);
    } finally {
      setForking(null);
    }
  }

  async function handleUnpublish(it: GalleryItem) {
    const ok = await confirm({
      title: "Снять с публикации",
      message: `Удалить «${it.name}» из галереи? Покупатели больше не увидят проект, но локальные форки останутся у тех, кто уже скачал.`,
      confirmLabel: "Удалить",
      destructive: true,
    });
    if (!ok) return;
    setUnpublishing(it.id);
    try {
      const res = await invoke<{ ok: boolean; reason?: string }>(
        "gallery:unpublish",
        { id: it.id },
      );
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.id !== it.id));
        setToast("Снято с публикации.");
      } else {
        const messages: Record<string, string> = {
          no_license: "Сначала активируй ключ Metacore в Dashboard.",
          "license key not found": "Ключ Metacore не найден на сервере.",
          "license key revoked": "Ключ Metacore отозван.",
          "you are not the author of this app": "Это не твой проект — удалить нельзя.",
          "app not found": "Проект уже удалён.",
        };
        setToast(messages[res.reason ?? ""] ?? `Не удалось снять: ${res.reason ?? "ошибка"}`);
      }
    } catch (e) {
      setToast(`Ошибка: ${(e as Error).message}`);
    } finally {
      setUnpublishing(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <div className="flex items-center gap-3">
        <Store className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Публичная галерея</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Открытые проекты сообщества Metacore. Форкните в один клик и развивайте.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Галерея пока пустая. Будь первым — опубликуй свой проект из окна проекта.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => {
            const price = it.price_kopecks ?? 0;
            const isOwner = Boolean(myKey && it.author_key && it.author_key === myKey);
            return (
              <div
                key={it.id}
                className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate font-medium">{it.name}</h2>
                    {isOwner ? (
                      <span className="flex-none rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        ваш проект
                      </span>
                    ) : null}
                  </div>
                  <span className="flex flex-none items-center gap-1 text-xs text-muted-foreground">
                    <GitFork className="h-3 w-3" />
                    {it.forks}
                  </span>
                </div>
                {it.category ? (
                  <span className="mt-1 inline-block self-start rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {it.category}
                  </span>
                ) : null}
                <p className="mt-1 flex-1 text-sm text-muted-foreground">
                  {it.description || "Без описания"}
                </p>
                <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {new Date(it.created_at).toLocaleDateString("ru-RU")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${price > 0 ? "text-foreground" : "text-emerald-300"}`}>
                      {price > 0 ? formatRub(price) : "Бесплатно"}
                    </span>
                    {isOwner ? (
                      <button
                        type="button"
                        onClick={() => handleUnpublish(it)}
                        disabled={unpublishing === it.id}
                        title="Снять с публикации"
                        className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        {unpublishing === it.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleFork(it)}
                      disabled={forking === it.id}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
                    >
                      {forking === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitFork className="h-3 w-3" />}
                      {isOwner ? "Открыть" : price > 0 ? "Купить" : "Форкнуть"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-100 shadow-xl">
          <Share2 className="mr-2 inline h-4 w-4" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
