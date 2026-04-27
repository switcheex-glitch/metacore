import { useEffect, useRef, useState } from "react";
import { Bitcoin, Loader2, Mail, QrCode, Sparkles, X, Check, ExternalLink } from "lucide-react";
import { useUpdateSettings } from "@/hooks/use-providers";
import { invoke } from "@/ipc/ipc_client";

const SUPABASE_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
const SUPABASE_ANON =
  "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";

type Step = "email" | "waiting" | "success" | "error";
type Method = "SBP" | "CRYPTO";

export function BuyKeyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<Method>("SBP");
  const [step, setStep] = useState<Step>("email");
  const [err, setErr] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const updateSettings = useUpdateSettings();

  useEffect(() => {
    if (!open) {
      setStep("email");
      setEmail("");
      setMethod("SBP");
      setErr(null);
      setPaymentUrl(null);
      setIssuedKey(null);
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, []);

  async function handleStart() {
    const trimmed = email.trim().toLowerCase();
    if (!/.+@.+\..+/.test(trimmed)) {
      setErr("Введи корректный email");
      return;
    }
    setErr(null);
    setStep("waiting");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({ email: trimmed, paymentMethod: method }),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentUrl) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setPaymentUrl(data.paymentUrl);
      window.open(data.paymentUrl, "_blank", "noopener,noreferrer");
      startPolling(trimmed);
    } catch (e) {
      setErr((e as Error).message);
      setStep("error");
    }
  }

  function startPolling(emailLc: string) {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/check-key`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON,
            Authorization: `Bearer ${SUPABASE_ANON}`,
          },
          body: JSON.stringify({ email: emailLc }),
        });
        const data = await res.json();
        if (data.found && data.key) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          setIssuedKey(data.key as string);
          try {
            // Activate the key, binding it to this device + email on the server.
            await invoke("license:activate", { key: data.key, email: emailLc });
          } catch (e) {
            setErr((e as Error).message);
            setStep("error");
            return;
          }
          setStep("success");
        }
      } catch {
        // transient — keep polling
      }
    }, 3500);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-black/90 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold text-white">Купить ключ Metacore</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "email" && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-white/70">
              Подписка · <b className="text-white">1999 ₽/мес</b> · 200 токенов, все модели.
              Оплата через Platega.io.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs text-white/60">Email для привязки ключа</span>
              <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
                <Mail className="h-4 w-4 text-white/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleStart();
                  }}
                  placeholder="you@example.com"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                  autoFocus
                />
              </div>
            </label>
            <div>
              <span className="mb-1 block text-xs text-white/60">Способ оплаты</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod("SBP")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                    method === "SBP"
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.05]"
                  }`}
                >
                  <QrCode className="h-4 w-4 flex-none" />
                  <div className="min-w-0">
                    <div className="font-medium">СБП</div>
                    <div className="text-[10px] text-white/50">QR-код, Россия</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("CRYPTO")}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                    method === "CRYPTO"
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.05]"
                  }`}
                >
                  <Bitcoin className="h-4 w-4 flex-none" />
                  <div className="min-w-0">
                    <div className="font-medium">Крипта</div>
                    <div className="text-[10px] text-white/50">USDT и др.</div>
                  </div>
                </button>
              </div>
            </div>
            {err ? <div className="text-xs text-rose-400">{err}</div> : null}
            <button
              type="button"
              onClick={handleStart}
              disabled={!email.trim()}
              className="w-full rounded-lg border border-white/20 bg-white/15 py-2.5 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-50"
            >
              Перейти к оплате
            </button>
          </div>
        )}

        {step === "waiting" && (
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <Loader2 className="mt-0.5 h-4 w-4 flex-none animate-spin text-white/80" />
              <div className="text-sm text-white/80">
                Открыли страницу оплаты в браузере. Завершите платёж — ключ появится здесь автоматически.
              </div>
            </div>
            {paymentUrl ? (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 py-2 text-xs text-white/70 transition hover:bg-white/10"
              >
                Открыть ещё раз <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-2 text-xs text-white/60 transition hover:bg-white/[0.05]"
            >
              Закрыть (ключ всё равно придёт)
            </button>
          </div>
        )}

        {step === "success" && issuedKey && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <Check className="h-4 w-4 flex-none" />
              Оплата прошла — ключ выдан и подставлен в приложение.
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-xs text-white/80">
              {issuedKey}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-white/20 bg-white/15 py-2.5 text-sm font-medium text-white transition hover:bg-white/25"
            >
              Готово
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
              Не удалось: {err}
            </div>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="w-full rounded-lg border border-white/20 bg-white/15 py-2.5 text-sm font-medium text-white transition hover:bg-white/25"
            >
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
