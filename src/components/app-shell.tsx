import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { TitleBar } from "./title-bar";
import { Sidebar } from "./sidebar";
import { ConfirmProvider } from "./confirm-dialog";
import { UpdateBanner } from "./update-banner";
import { effectiveThemeAtom } from "@/atoms/theme";
import { invoke } from "@/ipc/ipc_client";
import { useSettings } from "@/hooks/use-providers";

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useAtomValue(effectiveThemeAtom);
  const qc = useQueryClient();
  const settings = useSettings();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!settings.data) return;
    if (!settings.data.metacoreKey && pathname !== "/") {
      void router.navigate({ to: "/" });
    }
  }, [settings.data, pathname, router]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Periodic license check — every 15 min + on mount. If the server says
  // revoked / device_mismatch, main process clears the key from settings
  // and we refetch to reflect the locked state in the UI.
  useEffect(() => {
    let stopped = false;
    async function check() {
      try {
        await invoke("license:validate");
        if (!stopped) qc.invalidateQueries({ queryKey: ["settings"] });
      } catch {
        // network blip — ignore, will retry
      }
    }
    void check();
    const id = window.setInterval(check, 15 * 60 * 1000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [qc]);

  return (
    <ConfirmProvider>
      <div className="flex h-full flex-col bg-background">
        <TitleBar />
        <UpdateBanner />
        <main className="flex-1 overflow-hidden">{children}</main>
        <Sidebar />
      </div>
    </ConfirmProvider>
  );
}
