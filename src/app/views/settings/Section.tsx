import { useId, type ReactNode } from "react";
import { cn } from "@/app/lib/cn";
import { Button } from "@/app/components/ui/Button";
import { fmt } from "@/app/lib/format";
import { parseDate } from "@/domain/dates";

/** "Oct 27, 2026" for a YYYY-MM-DD key. */
export const formatDay = (key: string) => fmt(parseDate(key), { month: "short", day: "numeric", year: "numeric" });

/**
 * One settings section: its title and help in the left two-fifths, its panels
 * on the right; stacked on a phone. Space, not rules, separates sections.
 */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4 py-6 md:grid-cols-[2fr_3fr] md:gap-10 md:py-8">
      <div className="md:sticky md:top-6 md:self-start md:pt-4">
        <h2 id={id} className="text-foreground">
          {title}
        </h2>
        {description ? <div className="mt-1.5 space-y-2 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

/** A white panel holding rows; rows are split by quiet rules. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("divide-y divide-border rounded-2xl border border-border bg-card px-5", className)}>
      {children}
    </div>
  );
}

/** A row in a panel: what it is on the left, its control on the right (below it on a phone). */
export function Row({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/** A load that failed, in a panel: what went wrong, and a way to try again. */
export function RetryRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p role="status" className="text-sm text-foreground">
        {message}
      </p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Text and date fields: 44px tall, white on any panel, a red edge while invalid. */
export const fieldClass =
  "h-11 w-full rounded-xl border border-input bg-input-background px-3.5 text-base text-foreground placeholder:text-muted-foreground aria-[invalid=true]:border-destructive";
