import { Link, useRouterState } from "@tanstack/react-router";
import { useRef, useState, type MouseEvent } from "react";
import { useAtom } from "jotai";
import {
  LayoutGrid,
  MessageSquare,
  Settings,
  BookOpen,
  Store,
  Users,
  Database,
  Lock,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/use-t";
import { useSettings } from "@/hooks/use-providers";
import { sidebarCollapsedAtom } from "@/atoms/sidebar";

type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  requiresKey?: boolean;
};

const ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutGrid },
  { to: "/apps", labelKey: "nav.apps", icon: MessageSquare, requiresKey: true },
  { to: "/settings", labelKey: "nav.settings", icon: Settings, requiresKey: true },
  { to: "/library", labelKey: "nav.library", icon: BookOpen, requiresKey: true },
  { to: "/hub", labelKey: "nav.hub", icon: Store, requiresKey: true },
  { to: "/gallery", labelKey: "nav.gallery", icon: Users, requiresKey: true },
  { to: "/studio", labelKey: "nav.studio", icon: Database, requiresKey: true },
];

const BASE = 44;
const MAX = 72;
const RANGE = 90;
const LIFT = 14;

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const settings = useSettings();
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);

  const unlocked = Boolean(settings.data?.metacoreKey);

  if (collapsed) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-2 z-40 flex justify-center">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Показать меню"
          className="pointer-events-auto flex h-6 w-16 items-center justify-center rounded-t-lg border border-b-0 border-white/10 bg-black/60 text-muted-foreground backdrop-blur-xl transition hover:text-foreground"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center">
      <div className="pointer-events-auto flex items-end gap-1.5">
        <nav
          onMouseMove={(e: MouseEvent<HTMLElement>) => setMouseX(e.clientX)}
          onMouseLeave={() => setMouseX(null)}
          aria-label="Primary"
          className="flex items-end gap-1.5 rounded-2xl border border-white/15 bg-black/80 px-3 py-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
        >
          {ITEMS.map((item) => (
            <DockItem
              key={item.labelKey}
              item={item}
              active={isActive(pathname, item.to)}
              mouseX={mouseX}
              locked={Boolean(item.requiresKey) && !unlocked}
            />
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Скрыть меню"
          className="flex h-9 w-9 items-center justify-center self-center rounded-xl border border-white/15 bg-black/80 text-white/85 backdrop-blur-2xl transition hover:text-white"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  if (to === "/apps") return pathname === "/apps" || pathname.startsWith("/apps/");
  return pathname.startsWith(to);
}

function DockItem({
  item,
  active,
  mouseX,
  locked,
}: {
  item: NavItem;
  active: boolean;
  mouseX: number | null;
  locked: boolean;
}) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const Icon = item.icon;

  let size = BASE;
  let lift = 0;
  if (mouseX != null && wrapRef.current) {
    const rect = wrapRef.current.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const dist = Math.abs(mouseX - center);
    if (dist < RANGE) {
      const factor = 1 - dist / RANGE;
      size = BASE + (MAX - BASE) * factor;
      lift = factor * LIFT;
    }
  }

  const scale = size / BASE;

  const commonStyle = {
    width: BASE,
    height: BASE,
    transform: `translateY(${-lift}px) scale(${scale})`,
    transformOrigin: "center bottom" as const,
    transition:
      "transform 120ms ease-out, background-color 150ms ease, color 150ms ease, box-shadow 150ms ease",
  };

  const className = cn(
    "flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] text-white/85 will-change-transform",
    !locked && "hover:text-white",
    active && "border-primary/50 bg-primary/20 text-primary shadow-[0_0_24px_-4px_rgba(139,92,246,0.65)]",
    locked && "opacity-40 cursor-not-allowed",
  );

  return (
    <div
      ref={wrapRef}
      className="relative flex items-end justify-center"
      style={{
        width: size,
        height: BASE,
        transition: "width 120ms ease-out",
      }}
    >
      {locked ? (
        <div
          aria-label={`${t(item.labelKey)} (${t("nav.locked")})`}
          title={t("nav.locked")}
          className={className}
          style={commonStyle}
        >
          <Lock className="h-4 w-4" strokeWidth={1.75} />
        </div>
      ) : (
        <Link
          to={item.to}
          aria-label={t(item.labelKey)}
          className={className}
          style={commonStyle}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </Link>
      )}
      {active && (
        <span className="pointer-events-none absolute -bottom-1.5 h-1 w-1 rounded-full bg-primary" />
      )}
    </div>
  );
}
