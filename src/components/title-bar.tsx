import { MetacoreLogo } from "./metacore-logo";
import { invoke } from "@/ipc/ipc_client";

export function TitleBar() {
  return (
    <div
      className="title-bar-drag relative flex h-11 w-full items-center border-b border-white/10 px-3 backdrop-blur-xl"
      style={{ backgroundColor: "transparent" }}
    >
      <TrafficLights />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <MetacoreLogo className="h-6 text-foreground/90" />
      </div>
    </div>
  );
}

function TrafficLights() {
  return (
    <div className="title-bar-no-drag group flex items-center gap-2">
      <button
        type="button"
        onClick={() => invoke("window:close")}
        aria-label="Закрыть"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#ff5f57] ring-1 ring-black/20 transition hover:brightness-110"
      >
        <svg
          className="h-2 w-2 text-black/60 opacity-0 transition group-hover:opacity-100"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
        >
          <path d="M2 2 L8 8 M8 2 L2 8" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => invoke("window:minimize")}
        aria-label="Свернуть"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#febc2e] ring-1 ring-black/20 transition hover:brightness-110"
      >
        <svg
          className="h-2 w-2 text-black/60 opacity-0 transition group-hover:opacity-100"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
        >
          <path d="M2 5 L8 5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => invoke("window:maximize")}
        aria-label="Развернуть"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#28c840] ring-1 ring-black/20 transition hover:brightness-110"
      >
        <svg
          className="h-2 w-2 text-black/60 opacity-0 transition group-hover:opacity-100"
          viewBox="0 0 10 10"
          fill="currentColor"
        >
          <path d="M2 2 L5 2 L2 5 Z M8 8 L5 8 L8 5 Z" />
        </svg>
      </button>
    </div>
  );
}
