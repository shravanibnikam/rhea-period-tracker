import { Printer } from "lucide-react";
import type { CycleSummary } from "@/app/lib/exports";
import { fmt } from "@/app/lib/format";
import { Button } from "@/app/components/ui/Button";
import { Sheet } from "@/app/components/ui/Sheet";
import { formatDay as day } from "./Section";

// Printing shows the summary alone: every element that neither holds the
// summary nor sits inside it is hidden (the app, the overlay, the sheet's own
// header and buttons), and the summary's ancestors lose their fixed frame and
// scroll box so it runs onto as many pages as it needs, in black on white
// (white even in dark mode, for a print with background graphics on).
const PRINT_CSS = `@media print {
  @page { margin: 16mm; }
  html:has([data-print-summary]) { background: white !important; color-scheme: light; }
  body :not(:has([data-print-summary])):not([data-print-summary]):not([data-print-summary] *) { display: none !important; }
  html body:has([data-print-summary]), :has(> [data-print-summary]), [role="dialog"]:has([data-print-summary]) {
    position: static !important; inset: auto !important; translate: none !important; transform: none !important;
    width: auto !important; max-width: none !important; max-height: none !important; overflow: visible !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important;
    box-shadow: none !important; background: none !important; /* taste-skill-ignore: removes the sheet's shadow */
    animation: none !important; opacity: 1 !important;
  }
  [data-print-summary], [data-print-summary] * { color: black !important; background: none !important; border-color: silver !important; }
}`;

const days = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)} days`);

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl font-semibold text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

/** A dated, printable page of the last cycles for a clinician. */
export function ClinicianSummary({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: CycleSummary | null;
}) {
  const prepared = `Prepared ${fmt(new Date(), { month: "long", day: "numeric", year: "numeric" })} from the days logged in Rhea.`;
  const empty = !summary || summary.cycles.length === 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Cycle summary"
      description={prepared}
      footer={
        <div className="flex justify-end">
          <Button className="w-full sm:w-auto" onClick={() => window.print()} disabled={empty}>
            <Printer size={16} aria-hidden="true" />
            Print
          </Button>
        </div>
      }
    >
      <div data-print-summary className="space-y-6 text-foreground">
        <style>{PRINT_CSS}</style>
        <header className="hidden space-y-1 print:block">
          <p className="font-display text-3xl font-semibold">Cycle summary</p>
          <p className="text-sm">{prepared}</p>
        </header>

        {empty || !summary ? (
          <p className="text-sm text-muted-foreground">
            No periods are logged on this device, so there is nothing to summarize.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Figure label="Average cycle" value={days(summary.averageCycle)} />
                <Figure
                  label="Shortest to longest"
                  value={
                    summary.shortestCycle === null ? "—" : `${summary.shortestCycle}–${summary.longestCycle} days`
                  }
                />
                <Figure label="Standard deviation" value={days(summary.stdDev)} />
                <Figure label="Average period" value={days(summary.averagePeriod)} />
              </dl>
              <p className="text-sm text-muted-foreground">
                {summary.counted > 0
                  ? `From ${summary.counted} completed ${summary.counted === 1 ? "cycle" : "cycles"} since ${day(summary.since!)}.`
                  : "No completed cycle to average: a cycle completes when the next period starts."}
                {summary.cycles.some((c) => c.excluded) && " Cycles excluded in Rhea are listed but not counted."}
              </p>
            </div>

            <div>
              <h3>
                Last {summary.cycles.length} {summary.cycles.length === 1 ? "cycle" : "cycles"}
              </h3>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th scope="col" className="py-2 text-left font-normal">Period started</th>
                    <th scope="col" className="py-2 text-right font-normal">Cycle</th>
                    <th scope="col" className="py-2 text-right font-normal">Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.cycles.map((c) => (
                    <tr key={c.periodStart}>
                      <td className="py-2.5">
                        {day(c.periodStart)}
                        {c.excluded && <span className="block text-muted-foreground">Excluded from averages</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {c.cycleLength === null ? (
                          <span className="text-muted-foreground">In progress</span>
                        ) : (
                          `${c.cycleLength} days`
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{c.periodLength} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3>Most-logged symptoms</h3>
              {summary.symptoms.length > 0 ? (
                <ul className="mt-2 divide-y divide-border text-sm">
                  {summary.symptoms.map((s) => (
                    <li key={s.name} className="flex justify-between gap-4 py-2.5">
                      <span>{s.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.days} {s.days === 1 ? "day" : "days"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No symptoms logged since {day(summary.since!)}.</p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Calculated from the days logged in Rhea. These figures are estimates, not a diagnosis.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
