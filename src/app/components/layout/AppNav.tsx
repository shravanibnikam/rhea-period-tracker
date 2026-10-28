import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  CalendarDays,
  ChartNoAxesColumn,
  CircleDot,
  HeartHandshake,
  LogOut,
  Settings,
  type LucideIcon,
} from "lucide-react";

export const ROUTES = ["today", "calendar", "insights", "settings", "partner"] as const;
export type Route = (typeof ROUTES)[number];

/** The route in the URL hash; anything else (none, #welcome, a stray anchor) is Today. */
export function readRoute(): Route {
  const hash = window.location.hash.slice(1);
  return (ROUTES as readonly string[]).includes(hash) ? (hash as Route) : "today";
}

const ITEMS: Record<Route, { label: string; tip: string; icon: LucideIcon }> = {
  today: { label: "Today", tip: "Today", icon: CircleDot },
  calendar: { label: "Calendar", tip: "Calendar", icon: CalendarDays },
  insights: { label: "Insights", tip: "Insights", icon: ChartNoAxesColumn },
  partner: { label: "Partner", tip: "Partner view", icon: HeartHandshake },
  settings: { label: "Settings", tip: "Settings", icon: Settings },
};

// Tooltips and the account menu float, so they carry a shadow.
const TIP =
  "z-50 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-sm text-popover-foreground shadow-md max-lg:hidden"; // taste-skill-ignore
const MENU =
  "absolute bottom-0 left-full z-50 ml-3 w-64 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"; // taste-skill-ignore

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10} className={TIP}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface AppNavProps {
  routes: readonly Route[];
  current: Route;
  /** Signed in: the account button at the foot of the rail (desktop; phones sign out in Settings). */
  account?: { email: string; role: string | null; onSignOut: () => void };
}

/**
 * One nav for every width: an unlabelled 56px icon rail from `lg` (tooltips
 * name the icons), a bottom bar with short labels below it. Plain hash links,
 * so the URL, Back and Forward drive the view (App listens to hashchange).
 */
export function AppNav({ routes, current, account }: AppNavProps) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <nav
        aria-label="Rhea"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:inset-y-0 lg:left-0 lg:flex lg:w-14 lg:flex-col lg:items-center lg:border-t-0 lg:border-r lg:bg-background lg:py-4"
      >
        <img
          src={`${import.meta.env.BASE_URL}rhea-mark.svg`}
          alt=""
          className="mb-6 hidden size-7 lg:block"
        />
        <ul className="flex lg:flex-1 lg:flex-col lg:items-center lg:gap-1.5">
          {routes.map((r) => {
            const { label, tip, icon: Icon } = ITEMS[r];
            return (
              <li key={r} className={r === "settings" ? "flex-1 lg:mt-auto lg:flex-none" : "flex-1 lg:flex-none"}>
                <Tip label={tip}>
                  <a
                    href={`#${r}`}
                    aria-current={current === r ? "page" : undefined}
                    className="group flex h-16 flex-col items-center justify-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground lg:size-11 lg:rounded-xl lg:hover:bg-muted lg:aria-[current=page]:bg-muted"
                  >
                    <span className="flex h-8 w-14 items-center justify-center rounded-full transition-colors group-aria-[current=page]:bg-muted lg:h-auto lg:w-auto lg:group-aria-[current=page]:bg-transparent">
                      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="lg:sr-only">{label}</span>
                  </a>
                </Tip>
              </li>
            );
          })}
        </ul>
        {account && <AccountMenu {...account} />}
      </nav>
    </Tooltip.Provider>
  );
}

function AccountMenu({ email, role, onSignOut }: NonNullable<AppNavProps["account"]>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Click outside or Escape closes; Escape hands focus back to the button.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative mt-3 hidden lg:block">
      <Tip label={email}>
        <button
          ref={button}
          type="button"
          aria-label="Account"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
            {email.charAt(0).toUpperCase()}
          </span>
        </button>
      </Tip>
      {open && (
        <div className={MENU}>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{email}</p>
            <p className="text-sm text-muted-foreground">{role === "partner" ? "Partner account" : "Your account"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
