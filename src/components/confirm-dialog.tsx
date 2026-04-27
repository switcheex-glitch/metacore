import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  useEffect(() => {
    if (state) confirmBtnRef.current?.focus();
  }, [state]);

  function close(result: boolean) {
    if (!state) return;
    state.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => close(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") close(false);
            if (e.key === "Enter") close(true);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-white/15 bg-black/85 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${
                  state.destructive ? "bg-rose-500/15 text-rose-400" : "bg-white/10 text-white"
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                {state.title ? (
                  <div className="text-base font-semibold text-white">{state.title}</div>
                ) : null}
                <div className="mt-1 text-sm text-white/75">{state.message}</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
              >
                {state.cancelLabel ?? "Отмена"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => close(true)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  state.destructive
                    ? "border-rose-500/40 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
                    : "border-white/20 bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                {state.confirmLabel ?? "ОК"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
