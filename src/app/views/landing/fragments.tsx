// True-size fragments of Rhea's own screens for the landing page (docs/DESIGN.md, app style
// "Shape, space and depth"): white panels, phase tints with the dark of their hue as ink, 24px corners.
// They are pictures of the app, so nothing in them is a working control. Data: cycle.ts.
import { FileJson } from "lucide-react";
import { CycleRing } from "@/app/components/shared/CycleRing";
import { cn } from "@/app/lib/cn";
import { ALL_SYMPTOMS } from "@/app/lib/constants";
import { fmt } from "@/app/lib/format";
import { addDays, diffDays, parseDate, toDateKey } from "@/domain/dates";
import { getVariabilityLabel } from "@/domain/cycle";
import { ENERGY_LABELS, PHASES, PHASE_ORDER, anchorsFrom, getPhaseRangeLabel } from "@/domain/phases";
import {
  PERIOD_LENGTH,
  SAMPLE_BY_DATE,
  SAMPLE_LOGS,
  SAMPLE_START,
  SAMPLE_STATE,
  SAMPLE_TODAY,
  type Estimate,
} from "./cycle";

const day = (d: Date) => fmt(d, { month: "short", day: "numeric" });
const weekday = (d: Date) => fmt(d, { weekday: "short", month: "short", day: "numeric" });

function Pill({ on, children }: { on?: boolean; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-full px-3 text-sm font-medium",
        on ? "bg-phase-tint text-phase-ink" : "bg-muted text-foreground/75"
      )}
    >
      {children}
    </span>
  );
}

function Label({ children }: { children: string }) {
  return <p className="mb-2 text-sm font-semibold text-foreground">{children}</p>;
}

// ─── Today: the visitor's own estimate (the live thing) ─────────────────────

/** `sample`: the hero's picture of Maya's day, so it is not the live region and says it is an example. */
export function TodayCard({
  estimate,
  cycleLength,
  today,
  sample = false,
}: {
  estimate: Estimate | null;
  cycleLength: number;
  today: Date;
  sample?: boolean;
}) {
  return (
    <div data-ui className="l-ui w-full max-w-[400px] rounded-2xl bg-card p-6 text-foreground shadow-soft" role={sample ? undefined : "status"}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-xl font-semibold">{estimate ? "Today" : "Your cycle, in four phases"}</p>
        <p className="text-sm text-muted-foreground">{sample ? "Example" : estimate ? weekday(today) : `${cycleLength} days`}</p>
      </div>
      {estimate ? <EstimateView e={estimate} /> : <PhaseList cycleLength={cycleLength} />}
    </div>
  );
}

function EstimateView({ e }: { e: Estimate }) {
  const p = PHASES[e.phase];
  const late = e.daysToNext < 0;
  const next =
    e.daysToNext > 0
      ? `Around ${day(e.nextPeriod)}, in ${e.daysToNext} ${e.daysToNext === 1 ? "day" : "days"}`
      : e.daysToNext === 0
        ? `Estimated for today, ${day(e.nextPeriod)}`
        : `Estimated for ${day(e.nextPeriod)}, ${-e.daysToNext} ${e.daysToNext === -1 ? "day" : "days"} ago`;
  return (
    <>
      <div className="mt-4 flex justify-center">
        <CycleRing avgLength={e.cycleLength} avgPeriodLength={PERIOD_LENGTH} cycleDay={e.cycleDay} size={200}>
          <p className="text-sm text-muted-foreground">Day</p>
          <p className="font-display text-5xl font-medium leading-none lining-nums tabular-nums">{e.cycleDay}</p>
          <p className="mt-1 text-sm text-muted-foreground">of {e.cycleLength}</p>
        </CycleRing>
      </div>
      <p data-phase={late ? "menstrual" : e.phase} className="mt-4 rounded-xl bg-phase-tint px-4 py-3 text-phase-ink">
        <span className="font-semibold">{late ? "Period due" : `${p.name} phase`}</span>
        <span> · {late ? "your estimate has passed" : p.tagline}</span>
      </p>
      <dl className="mt-3 grid gap-1 rounded-xl bg-muted px-4 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Next period</dt>
          <dd className="text-right font-medium">{next}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Fertile window</dt>
          <dd className="text-right font-medium">
            {day(e.fertile.start)} – {day(e.fertile.end)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-muted-foreground">The fertile window is a calendar estimate, not contraception.</p>
    </>
  );
}

function PhaseList({ cycleLength }: { cycleLength: number }) {
  const anchors = anchorsFrom(cycleLength, PERIOD_LENGTH);
  return (
    <>
      <ul className="mt-4 grid gap-2">
        {PHASE_ORDER.map((ph) => (
          <li key={ph} data-phase={ph} className="flex items-baseline justify-between gap-3 rounded-xl bg-phase-tint px-4 py-3 text-phase-ink">
            <span>
              <span className="font-semibold">{PHASES[ph].name}</span> · {PHASES[ph].tagline}
            </span>
            <span className="shrink-0 text-sm tabular-nums">{getPhaseRangeLabel(ph, anchors)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">Add the first day of your last period to see which one is today.</p>
    </>
  );
}

// ─── Showcase sheets: Maya's sample data ─────────────────────────────────────

const FIRST_DAY = SAMPLE_BY_DATE.get(toDateKey(SAMPLE_START))!;
const MOODS = ["Calm", "Happy", "Sensitive", "Anxious", "Sad", "Emotional", "Tearful", "Stressed"];

export function DayLogSheet() {
  return (
    <div data-ui className="l-ui l-sheet rounded-2xl bg-card p-6 text-foreground">
      <p className="font-display text-xl font-semibold">{weekday(SAMPLE_START)}</p>
      <p className="text-sm text-muted-foreground">Cycle day 1 · Menstrual phase</p>
      <div className="mt-5" data-phase="menstrual">
        <Label>Flow</Label>
        <div className="flex gap-1 rounded-2xl bg-muted p-1">
          {["None", "Spotting", "Light", "Medium", "Heavy"].map((f) => (
            <span
              key={f}
              className={cn(
                "flex min-h-10 flex-1 items-center justify-center rounded-xl text-sm font-medium",
                f.toLowerCase() === FIRST_DAY.flow ? "bg-phase-tint text-phase-ink" : "text-muted-foreground"
              )}
            >
              {f}
            </span>
          ))}
        </div>
        <div className="mt-5">
          <Label>Symptoms</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_SYMPTOMS.slice(0, 12).map((s) => (
              <Pill key={s} on={FIRST_DAY.symptoms.includes(s)}>
                {s}
              </Pill>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <Label>Mood</Label>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <Pill key={m} on={FIRST_DAY.mood === m}>
                {m}
              </Pill>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <Label>Energy</Label>
          <div className="flex gap-1 rounded-2xl bg-muted p-1">
            {["Low", "Medium", "High"].map((x) => (
              <span
                key={x}
                className={cn(
                  "flex min-h-10 flex-1 items-center justify-center rounded-xl text-sm font-medium",
                  x.toLowerCase() === FIRST_DAY.energy ? "bg-card text-foreground" : "text-muted-foreground"
                )}
              >
                {x}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <Label>Notes</Label>
          <p className="rounded-xl bg-muted px-4 py-3 text-sm">{FIRST_DAY.notes}</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Not end-to-end encrypted; a linked partner&rsquo;s account can read it.</p>
        </div>
        <span className="mt-5 flex min-h-12 items-center justify-center rounded-full bg-primary text-base font-medium text-primary-foreground">
          Save log
        </span>
      </div>
    </div>
  );
}

const FERTILE = SAMPLE_STATE.fertileWindow!;
const within = (d: Date, a: Date, b: Date) => d >= a && d <= b;

export function CalendarSheet({ compact = false }: { compact?: boolean }) {
  const first = new Date(SAMPLE_TODAY.getFullYear(), SAMPLE_TODAY.getMonth(), 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  return (
    <div data-ui className={cn("l-ui rounded-2xl text-foreground", compact ? "bg-muted p-4" : "l-sheet bg-card p-6")}>
      <div className="flex items-baseline justify-between">
        <p className={cn("font-display font-semibold", compact ? "text-base" : "text-xl")}>{fmt(first, { month: "long", year: "numeric" })}</p>
        {!compact && <p className="text-sm text-muted-foreground">Cycle day {SAMPLE_STATE.cycleDay}</p>}
      </div>
      <div className={cn("mt-4 grid grid-cols-7 text-center", compact ? "gap-1 text-[13px]" : "gap-1.5 text-sm")}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
          <span key={w} className="pb-1 text-muted-foreground">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`blank-${i}`} />;
          const key = toDateKey(d);
          const period = (SAMPLE_BY_DATE.get(key)?.flow ?? "none") !== "none";
          const fertile = within(d, FERTILE.start, FERTILE.end);
          const today = key === toDateKey(SAMPLE_TODAY);
          return (
            <span
              key={key}
              data-phase={period ? "menstrual" : fertile ? "ovulation" : undefined}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-lg tabular-nums",
                (period || fertile) && "bg-phase-tint font-semibold text-phase-ink",
                today && "ring-2 ring-foreground ring-inset font-semibold"
              )}
            >
              {d.getDate()}
              {key === toDateKey(FERTILE.ovulationDate) && (
                <span className="absolute bottom-1 size-1.5 rounded-full bg-ovulation" aria-label="estimated ovulation" />
              )}
            </span>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-menstrual" /> Period
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-ovulation" /> Fertile window, estimated
        </span>
        {!compact && <span>Next period around {day(SAMPLE_STATE.nextPeriodDate!)}</span>}
      </div>
    </div>
  );
}

export function HistorySheet() {
  const done = SAMPLE_STATE.cycles.filter((c) => c.cycleLength !== null).reverse();
  const longest = Math.max(...done.map((c) => c.cycleLength as number));
  return (
    <div data-ui className="l-ui l-sheet rounded-2xl bg-card p-6 text-foreground">
      <p className="font-display text-xl font-semibold">Cycle history</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          [`${SAMPLE_STATE.avgCycleLength}`, "days, average cycle"],
          [`${SAMPLE_STATE.avgPeriodLength}`, "days, average period"],
          [getVariabilityLabel(SAMPLE_STATE.stdDev), "over 5 cycles"],
        ].map(([figure, note]) => (
          <div key={note} className="rounded-xl bg-muted px-3 py-3">
            <p className="font-display text-2xl font-semibold leading-tight lining-nums tabular-nums">{figure}</p>
            <p className="text-sm text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>
      <ul className="mt-5 grid gap-3">
        <li className="text-sm">
          <div className="flex justify-between">
            <span className="font-medium">{day(SAMPLE_START)}, this cycle</span>
            <span className="text-muted-foreground">day {SAMPLE_STATE.cycleDay}</span>
          </div>
        </li>
        {done.map((c) => (
          <li key={c.periodStart} className="text-sm">
            <div className="flex justify-between">
              <span className="font-medium">{day(parseDate(c.periodStart))}</span>
              <span className="tabular-nums text-muted-foreground">
                {c.cycleLength} days · period {c.periodLength}
              </span>
            </div>
            <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-muted" style={{ width: `${((c.cycleLength as number) / longest) * 100}%` }}>
              <span className="h-full bg-menstrual" style={{ width: `${(c.periodLength / (c.cycleLength as number)) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BackupSheet() {
  const file = `rhea-backup-${toDateKey(SAMPLE_TODAY)}.json`;
  return (
    <div data-ui className="l-ui l-sheet l-sheet--narrow rounded-2xl bg-card p-6 text-foreground">
      <p className="font-display text-xl font-semibold">Export backup</p>
      <p className="text-sm text-muted-foreground">Download all your data as a JSON file</p>
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
        <FileJson size={20} aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{file}</p>
          <p className="text-sm text-muted-foreground">
            {SAMPLE_LOGS.length} days · {SAMPLE_STATE.cycles.length} cycles · version 2
          </p>
        </div>
      </div>
      <pre className="mt-4 overflow-hidden rounded-xl bg-muted p-4 font-mono text-[13px] leading-relaxed text-foreground">{JSON.stringify(FIRST_DAY, null, 2)}</pre>
      <p className="mt-3 text-sm text-muted-foreground">Restore it in any copy of Rhea with Import Rhea backup.</p>
    </div>
  );
}

// ─── The partner's view ──────────────────────────────────────────────────────

export type PartnerKey = "headsup" | "phase" | "symptoms" | "calendar" | "quiet";

const SAMPLE_TODAY_KEY = toDateKey(SAMPLE_TODAY);
const EARLIER = Array.from({ length: 6 }, (_, i) => addDays(SAMPLE_TODAY, -(i + 1)))
  .map((d) => ({ d, s: SAMPLE_BY_DATE.get(toDateKey(d))?.symptoms ?? [] }))
  .filter((x) => x.s.length > 0);

export function PartnerCard({ on }: { on: Record<PartnerKey, boolean> }) {
  const phase = PHASES[SAMPLE_STATE.phase];
  const daysLeft = diffDays(SAMPLE_STATE.nextPeriodDate!, SAMPLE_TODAY);
  const nothing = !on.headsup && !on.phase && !on.symptoms && !on.calendar;
  return (
    <div data-ui className="l-ui w-[400px] max-w-full rounded-2xl bg-card p-6 text-foreground shadow-soft">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-xl font-semibold">Maya&rsquo;s cycle</p>
        <p className="text-sm text-muted-foreground">Partner view</p>
      </div>
      {on.quiet ? (
        <div className="mt-4 rounded-xl bg-muted p-5">
          <p className="font-semibold">Sharing paused</p>
          <p className="mt-1 text-sm text-muted-foreground">Maya has a quiet window today. Her details show again when it ends.</p>
        </div>
      ) : nothing ? (
        <div className="mt-4 rounded-xl bg-muted p-5">
          <p className="font-semibold">Nothing shared yet</p>
          <p className="mt-1 text-sm text-muted-foreground">When Maya turns something on, it shows here.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-2.5">
          {on.phase && (
            <div data-phase={SAMPLE_STATE.phase} className="rounded-xl bg-phase-tint px-4 py-3 text-phase-ink">
              <p className="font-display text-2xl font-semibold">{phase.name} phase</p>
              <p className="text-sm">
                {phase.tagline} · {ENERGY_LABELS[phase.energy]}
              </p>
            </div>
          )}
          {on.headsup && (
            <div data-phase="menstrual" className="flex items-center justify-between rounded-xl bg-phase-tint px-4 py-3 text-phase-ink">
              <span className="text-sm font-semibold">Period likely in ~{daysLeft} days</span>
              <span className="font-display text-xl font-semibold lining-nums tabular-nums">{daysLeft}d</span>
            </div>
          )}
          {on.symptoms && (
            <div className="rounded-xl bg-muted px-4 py-3">
              <p className="text-sm font-semibold">Logged today</p>
              <div className="mt-2 flex flex-wrap gap-1.5" data-phase={SAMPLE_STATE.phase}>
                {(SAMPLE_BY_DATE.get(SAMPLE_TODAY_KEY)?.symptoms ?? []).map((s) => (
                  <Pill key={s} on>
                    {s}
                  </Pill>
                ))}
              </div>
              {EARLIER.map(({ d, s }) => (
                <p key={toDateKey(d)} className="mt-2 text-sm text-muted-foreground">
                  {fmt(d, { weekday: "short", day: "numeric" })} · {s.join(", ")}
                </p>
              ))}
            </div>
          )}
          {on.calendar && <CalendarSheet compact />}
        </div>
      )}
    </div>
  );
}
