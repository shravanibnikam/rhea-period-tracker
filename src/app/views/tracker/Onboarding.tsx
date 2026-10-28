import { CalendarPlus, ChevronRight, FileUp, PenLine, type LucideIcon } from "lucide-react";
import { cn } from "@/app/lib/cn";

interface OnboardingProps {
  onStartLogging: () => void;
  onImport: () => void;
  onQuickAdd: () => void;
  /** A build with accounts (Supabase configured): mention sync and partners. */
  hosted?: boolean;
}

const CARD = "rounded-2xl border border-border bg-card p-6 sm:p-8";

function Action({
  icon: Icon,
  title,
  detail,
  onClick,
  primary = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors",
        primary
          ? "bg-menstrual-tint text-menstrual-ink hover:bg-menstrual-tint/70"
          : "border border-border hover:bg-muted"
      )}
    >
      <Icon size={20} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{title}</span>
        <span className={cn("block text-sm", primary ? "opacity-80" : "text-muted-foreground")}>{detail}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 opacity-60" />
    </button>
  );
}

export function Onboarding({ onStartLogging, onImport, onQuickAdd, hosted = false }: OnboardingProps) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-12">
      <section aria-labelledby="get-started" className={cn(CARD, "lg:col-span-7")}>
        <img src={`${import.meta.env.BASE_URL}rhea-mark.svg`} alt="Rhea" className="size-10" />
        <h1 id="get-started" className="mt-5 text-3xl">
          Get started
        </h1>
        <p className="mt-2 max-w-prose text-base text-muted-foreground">
          Add your last period and Rhea estimates your cycle day, your next period and your fertile
          window. The estimates sharpen with every cycle you log.
        </p>
        <div className="mt-6 grid gap-3">
          <Action
            primary
            icon={CalendarPlus}
            title="Add your last period"
            detail="Pick the start date and how many days it lasted"
            onClick={onQuickAdd}
          />
          <Action icon={PenLine} title="Log today" detail="Flow, symptoms, mood and energy" onClick={onStartLogging} />
          <Action
            icon={FileUp}
            title="Import from another app"
            detail="Clue, Flo, Apple Health, or any CSV"
            onClick={onImport}
          />
        </div>
      </section>

      <section aria-labelledby="good-to-know" className={cn(CARD, "lg:col-span-5")}>
        <h2 id="good-to-know" className="text-lg">
          Good to know
        </h2>
        <dl className="mt-4 space-y-5 text-sm">
          <div>
            <dt className="text-base font-semibold">Where your logs live</dt>
            <dd className="mt-1 text-muted-foreground">
              {hosted
                ? "On this device. When you sign in they sync to your account over TLS; synced data is not end-to-end encrypted."
                : "On this device. This version of Rhea has no account and no sync."}
            </dd>
          </div>
          <div>
            <dt className="text-base font-semibold">Estimates, labelled as estimates</dt>
            <dd className="mt-1 text-muted-foreground">
              Every prediction says how sure it is. The fertile window is a calendar estimate, not
              contraception.
            </dd>
          </div>
          {hosted && (
            <div>
              <dt className="text-base font-semibold">Built for two</dt>
              <dd className="mt-1 text-muted-foreground">
                Link a partner and choose what their view shows. Their account can read the logs you
                sync, and you can unlink them at any time.
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
