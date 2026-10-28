import { useState, useEffect, type ReactNode } from "react";
import { CalendarHeart, HeartHandshake, Moon, type LucideIcon } from "lucide-react";
import type { PhaseData, PhaseName, CycleState, DailyLog } from "@/domain/types";
import { PHASES, PHASE_ORDER, ENERGY_LABELS, getPhaseRangeLabel, anchorsFrom } from "@/domain/phases";
import { diffDays, toDateKey } from "@/domain/dates";
import { fmt } from "@/app/lib/format";
import { cn } from "@/app/lib/cn";
import { CycleRing } from "@/app/components/shared/CycleRing";
import { CalendarTab } from "@/app/views/tracker/CalendarTab";
import { PartnerSymptoms } from "@/app/views/partner/PartnerSymptoms";
import {
  getShareSettings,
  getQuietWindows,
  isInQuietWindow,
  type ShareKey,
  type ShareSettings,
  type QuietWindow,
} from "@/app/lib/sharing";

interface PartnerViewProps {
  phaseData: PhaseData;
  phase: PhaseName;
  state: CycleState;
  today: Date;
  /** The owner's logs, already in the local store via the partner pull path. */
  logs: DailyLog[];
  ownerId?: string | null;
  currentUserId?: string | null;
}

// Cards pair up from lg; a card alone in its row takes both columns.
const CARD = "rounded-2xl border border-border bg-card p-5 sm:p-6 lg:only:col-span-2";
const ROW = "grid gap-4 lg:grid-cols-2 empty:hidden";
const H2 = "text-xl text-foreground";
// Small labels inside a card: the text face, not the display face.
const LABEL = "font-sans text-sm font-semibold text-foreground [font-size-adjust:none]";

/** A predicted start's distance from today: "In 7 days", "Tomorrow", "3 days ago". */
function fromToday(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  return days === -1 ? "1 day ago" : `${-days} days ago`;
}

/** Five energy marks in the nearest `[data-phase]` colour. */
function Energy({ level }: { level: number }) {
  return (
    <span role="img" aria-label={`Energy ${level} of 5`} className="flex w-24 gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= level ? "bg-phase" : "bg-phase/20")} />
      ))}
    </span>
  );
}

function Notice({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className={cn(CARD, "flex items-start gap-4")}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className={H2}>{title}</h2>
        <p className="mt-1.5 text-base text-muted-foreground">{children}</p>
      </div>
    </section>
  );
}

export function PartnerView({
  phaseData,
  phase,
  state,
  today,
  logs,
  ownerId,
  currentUserId,
}: PartnerViewProps) {
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [quietWindows, setQuietWindows] = useState<QuietWindow[]>([]);
  const [loading, setLoading] = useState(true);
  // Same oracle as the owner's views (M1.3): phase ranges cannot disagree.
  const anchors = anchorsFrom(state.avgCycleLength, state.avgPeriodLength);

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    Promise.all([getShareSettings(ownerId), getQuietWindows(ownerId)]).then(([s, qw]) => {
      setSettings(s);
      setQuietWindows(qw);
      setLoading(false);
    });
  }, [ownerId]);

  const isQuiet = isInQuietWindow(quietWindows);
  // When no Supabase / no owner, show everything (local demo mode)
  const isGated = ownerId != null && settings != null;
  const on = (key: ShareKey) => ownerId == null || settings == null || (!isQuiet && settings[key]);
  const show = {
    phase: on("todays_phase"),
    headsup: on("cycle_headsup"),
    mood: on("mood_signal"),
    tips: on("care_nudges"),
    calendar: on("calendar_view"),
    symptoms: on("symptom_details"),
  };
  const nothingShared = isGated && Object.values(show).every((visible) => !visible);

  // The owner previewing her own partner view (App passes her id as both).
  const preview = ownerId != null && ownerId === currentUserId;
  // Without a logged period the phase is a default, not hers: show none.
  const hasCycle = state.currentCycleStart !== null;
  const todayMood = logs.find((l) => l.date === toDateKey(today))?.mood ?? null;

  let body: ReactNode;
  if (loading) {
    body = (
      <p role="status" className="text-sm text-muted-foreground">
        Loading what she shares…
      </p>
    );
  } else if (isGated && isQuiet) {
    body = (
      <Notice icon={Moon} title="Sharing paused">
        She has paused sharing for a while. Her cycle details show here again when the pause ends.
      </Notice>
    );
  } else if (nothingShared) {
    body = (
      <Notice icon={HeartHandshake} title="Nothing shared yet">
        {preview ? (
          <>
            Choose what to share in{" "}
            <a href="#settings" className="font-semibold text-foreground underline underline-offset-4">
              Settings
            </a>
            , and it shows here.
          </>
        ) : (
          "She hasn't turned on any sharing. When she does, it shows here."
        )}
      </Notice>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {(show.phase || show.headsup || show.tips) && !hasCycle && (
          <Notice icon={CalendarHeart} title="No period logged">
            Her phase, predictions and ideas for helping show here after she logs a period.
          </Notice>
        )}

        {show.phase && hasCycle && (
          <div className={ROW}>
            <section
              className={cn(
                CARD,
                "flex flex-col items-start gap-5 sm:flex-row sm:items-center",
                // Without the ring, the phase's own tint carries the card.
                !show.headsup && "border-transparent bg-phase-tint text-phase-ink"
              )}
            >
              {/* Where she is in the cycle reveals when her period is due, so the
                  ring needs the heads-up toggle as well as the phase. */}
              {show.headsup && (
                <CycleRing
                  avgLength={state.avgCycleLength}
                  avgPeriodLength={state.avgPeriodLength}
                  cycleDay={state.cycleDay}
                  size={168}
                  className="shrink-0"
                >
                  <span aria-hidden="true" className="flex flex-col items-center">
                    <span className="text-sm text-muted-foreground">Day</span>
                    <span className="font-display text-5xl font-semibold leading-none tabular-nums text-foreground">
                      {state.cycleDay}
                    </span>
                  </span>
                </CycleRing>
              )}
              <div className="min-w-0">
                <h2 className={cn("text-2xl sm:text-3xl", show.headsup && "text-foreground")}>
                  She&apos;s in her {phaseData.name.toLowerCase()} phase
                </h2>
                <p className={cn("mt-2 text-sm", show.headsup && "text-muted-foreground")}>
                  {getPhaseRangeLabel(phase, anchors)} of her cycle
                </p>
              </div>
            </section>

            <section className={CARD}>
              <h2 className={H2}>What&apos;s happening in her body</h2>
              <p className="mt-2 text-base leading-relaxed text-foreground">{phaseData.partnerDesc}</p>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Energy</dt>
                  <dd className="mt-2 text-foreground">
                    <Energy level={phaseData.energy} />
                    <span className="mt-2 block">{ENERGY_LABELS[phaseData.energy]}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Usual mood in this phase</dt>
                  <dd className="mt-2 text-foreground">{phaseData.mood}</dd>
                </div>
              </dl>
            </section>
          </div>
        )}

        <div className={ROW}>
          {(show.mood || show.symptoms) && (
            <section className={CARD}>
              <h2 className={H2}>What she&apos;s feeling</h2>
              <div className="mt-4 space-y-5">
                {show.mood && (
                  <div>
                    <h3 className={LABEL}>Mood today</h3>
                    {todayMood ? (
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="rounded-full bg-phase-tint px-3 py-1.5 text-sm font-medium text-phase-ink">
                          {todayMood}
                        </span>
                        <span className="text-sm text-muted-foreground">Logged by her</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No mood logged today.</p>
                    )}
                  </div>
                )}
                {show.symptoms && <PartnerSymptoms logs={logs} today={today} />}
              </div>
            </section>
          )}

          {show.tips && hasCycle && (
            <section className={CARD}>
              <h2 className={H2}>How you can help</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {phaseData.partnerTips.map((tip) => (
                  <li
                    key={tip}
                    className="rounded-xl bg-partner-tint px-4 py-3 text-sm leading-snug text-partner-ink"
                  >
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {show.headsup && hasCycle && (
          <section className={CARD}>
            <h2 className={H2}>What&apos;s coming next</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estimated from her logged cycles, so dates can shift by a few days.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-3">
              {state.predictions.slice(0, 3).map((pred, i) => {
                const days = diffDays(pred.start, today);
                return (
                  <li
                    key={pred.cycleNumber}
                    className={cn(
                      "rounded-xl px-4 py-3",
                      i === 0 ? "bg-menstrual-tint text-menstrual-ink" : "bg-muted text-foreground"
                    )}
                  >
                    <p className="text-sm font-medium">
                      {i > 0 ? "Period" : days < 0 ? "Period may be late" : "Next period"}
                    </p>
                    <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                      {fmt(pred.start, { month: "long", day: "numeric" })}
                    </p>
                    <p className="text-sm">{fromToday(days)}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {show.calendar && (
          <section>
            <h2 className={cn(H2, "mb-3")}>Her cycle calendar</h2>
            <CalendarTab
              cycles={state.cycles}
              avgLength={state.avgCycleLength}
              avgPeriodLength={state.avgPeriodLength}
              today={today}
              logs={logs}
              fertileWindow={state.fertileWindow}
              readOnly
            />
          </section>
        )}

        {show.phase && (
          <section className={CARD}>
            <h2 className={H2}>Understanding the full cycle</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A cycle moves through four phases, each with different needs.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PHASE_ORDER.map((p) => {
                const now = hasCycle && p === phase;
                return (
                  <li
                    key={p}
                    data-phase={p}
                    aria-current={now ? "true" : undefined}
                    className={cn("rounded-xl p-4", now ? "bg-phase-tint text-phase-ink" : "bg-muted text-foreground")}
                  >
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{PHASES[p].name}</span>
                      {now && <span className="text-sm font-medium">Now</span>}
                    </p>
                    <p className={cn("text-sm", !now && "text-muted-foreground")}>{getPhaseRangeLabel(p, anchors)}</p>
                    <div className="mt-3">
                      <Energy level={PHASES[p].energy} />
                    </div>
                    <p className="mt-3 text-sm leading-snug">{PHASES[p].partnerTips[0]}</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Every cycle is different. These are tendencies, not certainties, and listening to her is the best guide.
            </p>
          </section>
        )}
      </div>
    );
  }

  return (
    <div data-phase={phase} className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-foreground">Her cycle</h1>
        <p className="mt-1 text-sm text-muted-foreground">{fmt(today, { weekday: "long", month: "long", day: "numeric" })}</p>
      </header>
      {body}
    </div>
  );
}
