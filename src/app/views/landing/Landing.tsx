import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { ArrowDown } from "lucide-react";
import { CycleRing } from "@/app/components/shared/CycleRing";
import { Button, buttonVariants } from "@/app/components/ui/Button";
import { Segmented, Switch } from "@/app/components/ui/controls";
import { holdLightTheme } from "@/app/hooks/useTheme";
import { cn } from "@/app/lib/cn";
import { SHARE_KEYS, type ShareKey } from "@/app/lib/sharing";
import { PrivacyPolicy } from "@/app/views/settings/PrivacyPolicy";
import { DEFAULT_CYCLE_LENGTH } from "@/domain/constants";
import { toDateKey } from "@/domain/dates";
import type { PhaseName } from "@/domain/types";
import { MAX_CYCLE, MIN_CYCLE, PERIOD_LENGTH, SAMPLE_ESTIMATE, SAMPLE_TODAY, cycleLengthFrom, estimateCycle } from "./cycle";
import { BackupSheet, CalendarSheet, DayLogSheet, HistorySheet, PartnerCard, TodayCard } from "./fragments";
// The one italic phrase (the hero's "gently"); main.tsx loads the upright face only.
import "@fontsource-variable/cormorant-garamond/wght-italic.css";
import "./landing.css";

interface LandingProps {
  /** A build that syncs to accounts (Supabase configured). It alone chooses the privacy copy. */
  hosted: boolean;
  /** A session exists: the primary action opens the app, and there is no Sign in. */
  signedIn?: boolean;
  /** Primary action: enter the app (local, or signed in) or go to account creation (hosted). */
  onStart: () => void;
  /** Hosted and signed out only: go to sign-in. */
  onSignIn?: () => void;
}

const REPO = "https://github.com/shravanibnikam/rhea-period-tracker";
const PHOTO_PAGE = "https://commons.wikimedia.org/wiki/File:Rhea_Over_Saturn_from_Cassini.jpg";
const img = (file: string) => `${import.meta.env.BASE_URL}landing/${file}`;
const order = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * In-page links scroll without touching location.hash: App reads the hash as a route
 * (#today, #partner, #welcome), so a changed hash would leave the landing page. Focus moves
 * too (targets carry tabIndex -1), so the next Tab continues from the target.
 */
function jump(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  const target = document.getElementById(e.currentTarget.hash.slice(1));
  if (!target) return;
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

function Mark() {
  return (
    <svg viewBox="0 0 64 64" width="28" height="28" fill="none" aria-hidden="true">
      <path d="M52.68 28.35A21 21 0 1 1 35.65 11.32" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      <circle cx="46.85" cy="17.15" r="5" fill="currentColor" />
    </svg>
  );
}

const startLabel = ({ hosted, signedIn }: LandingProps) => (!hosted ? "Start tracking" : signedIn ? "Open Rhea" : "Create your account");

/** The primary action, plus Sign in on a hosted build when signed out. The nav puts Sign in first. */
function Actions({ size = "md", nav = false, ...props }: LandingProps & { size?: "md" | "lg"; nav?: boolean }) {
  const { hosted, signedIn, onStart, onSignIn } = props;
  const start = (
    <Button size={size} className="l-start" onClick={onStart}>
      {startLabel(props)}
    </Button>
  );
  const signIn = hosted && !signedIn && onSignIn && (
    <Button variant="ghost" size={size} onClick={onSignIn}>
      Sign in
    </Button>
  );
  return (
    <div className="l-actions">
      {nav ? signIn : start}
      {nav ? start : signIn}
    </div>
  );
}

/** Emphasis as a soft underline in a phase's colour, never a highlighter block. */
function Em({ phase, children }: { phase: PhaseName; children: ReactNode }) {
  return (
    <strong data-phase={phase} className="l-em">
      {children}
    </strong>
  );
}

// ─── Content ─────────────────────────────────────────────────────────────────

type OutputKey = "log" | "calendar" | "history" | "backup";
const OUTPUTS: { value: OutputKey; label: string; caption: string; Sheet: () => ReactNode }[] = [
  { value: "log", label: "Day log", caption: "One sheet a day: flow, symptoms, mood, energy and a note. This is the first day of Maya’s period.", Sheet: DayLogSheet },
  { value: "calendar", label: "Calendar", caption: "The month with period days, the estimated fertile window and today. Maya is on day 18.", Sheet: () => <CalendarSheet /> },
  { value: "history", label: "History", caption: "Every cycle you log, with its length and its period. Maya’s last five ran 27 to 30 days.", Sheet: HistorySheet },
  { value: "backup", label: "Backup", caption: "Everything in one JSON file, whenever you want it, from Settings.", Sheet: BackupSheet },
];

// The app's own share keys, labels and descriptions; a quiet window is a separate control there too.
const ALL_OFF = Object.fromEntries(SHARE_KEYS.map((s) => [s.key, false])) as Record<ShareKey, boolean>;

const REFERENCES: { title: string; who: string; doi?: string; url?: string }[] = [
  { title: "Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles", who: "Bull, Rowland, Scherwitzl et al. NPJ Digital Medicine, 2019", doi: "10.1038/s41746-019-0152-7" },
  { title: "The timing of the fertile window in the menstrual cycle", who: "Wilcox, Dunson, Baird. BMJ, 2000", doi: "10.1136/bmj.321.7271.1259" },
  { title: "Day-specific probabilities of clinical pregnancy", who: "Dunson, Baird, Wilcox, Weinberg. Human Reproduction, 1999", doi: "10.1093/humrep/14.7.1835" },
  { title: "Modeling individual cyclic variation in human behavior", who: "Pierson, Althoff, Leskovec. WWW Conference, 2018", doi: "10.1145/3178876.3186052" },
  { title: "Labeling self-tracked menstrual health records with hidden semi-Markov models", who: "Symul, Holmes. IEEE Journal of Biomedical and Health Informatics, 2022", doi: "10.1109/JBHI.2021.3110716" },
  {
    title: "The normal menstrual cycle and the control of ovulation",
    who: "Reed, Carr. Endotext, NIH/NCBI",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK279054/",
  },
  { title: "Menstrual cycle: overview and phases; follicular and luteal phase", who: "Cleveland Clinic, clinical reference" },
];

const MERGES: [string, string, string] = ["Merges", "Into what you logged", "Field by field: a day you already logged keeps whatever the file leaves empty."];
const PREVIEW: [string, string, string] = ["Shows", "A preview first", "How many days were found, and their date range, before you confirm."];
const SOURCES: { name: string; note: string; bands: [string, string, string][] }[] = [
  {
    name: "Clue",
    note: "CSV export",
    bands: [["Reads", "Your period days", "From the flow column of Clue’s CSV export."], ["Skips", "Days without flow", "Clue lists every day; only days with bleeding come across."], PREVIEW, MERGES],
  },
  {
    name: "Flo",
    note: "JSON or CSV",
    bands: [["Reads", "Period days and intensity", "From Flo’s JSON export, or its CSV."], ["Maps", "Intensity to flow", "Heavy, medium, light and spotting carry across as they were."], PREVIEW, MERGES],
  },
  {
    name: "Apple Health",
    note: "export.xml",
    bands: [["Reads", "Menstrual flow records", "Every menstrual flow record in the Health app’s export.xml."], ["Maps", "Light, heavy, unspecified", "Light and heavy carry across; unspecified becomes spotting, anything else medium."], PREVIEW, MERGES],
  },
  {
    name: "Any CSV",
    note: "with a date column",
    bands: [["Needs", "A date column", "Named date, day or start. Flow, symptoms, mood, energy and notes columns come too."], ["Reads", "Day-first or month-first", "Decided per file: a first number above 12 means the day comes first."], ["Never", "Invents flow", "No flow column, no flow: the import says so instead of guessing."], PREVIEW],
  },
  {
    name: "Rhea backup",
    note: "JSON",
    bands: [["Exports", "Everything, any time", "One JSON file from Settings: every day you logged, and your settings."], ["Restores", "On any copy of Rhea", "Import Rhea backup; days that are already up to date are skipped."], ["Opens", "Anywhere", "It is plain JSON, readable by any program you trust."]],
  },
];

// [question, answer, what a build without a server says instead (null: not asked there)]
const FAQ: [string, string, (string | null)?][] = [
  [
    "Is there end-to-end encryption?",
    "No. Your logs are stored on your device. When you sign in, they sync to your account over TLS, and the synced copy is not end-to-end encrypted: the database operator could technically read it. A copy of Rhea run without a server keeps everything on the device.",
    "No. This copy of Rhea runs without a server: your logs stay in this browser’s storage on this device, and nothing is synced.",
  ],
  [
    "Does it work offline?",
    "Yes. Rhea installs like an app and opens without a connection. What you log offline is saved on the device and, if you are signed in, syncs when you are back online.",
    "Yes. Rhea installs like an app and opens without a connection. Everything you log is saved on this device.",
  ],
  ["Is it contraception?", "No. The fertile window is a calendar estimate from your cycle length, and ovulation moves from cycle to cycle (Wilcox et al. 2000). Don’t rely on it to prevent pregnancy."],
  [
    "What can my partner see?",
    "In the partner view, only what you turn on, and nothing until you do; a quiet window pauses it. The app applies those switches, not the server: a linked partner’s account can technically read your synced logs, notes included.",
    null,
  ],
  [
    "Can I leave with my data?",
    "Yes. Export a JSON backup of every log from Settings at any time. Erasing data clears this device only; logs already synced to your account stay on the server.",
    "Yes. Export a JSON backup of every log from Settings at any time. Erasing data clears this device.",
  ],
  ["What does it cost?", "Nothing. Rhea is free and open source under the MIT licence, with no ads and no analytics. The code is on GitHub."],
];

// ─── Page ────────────────────────────────────────────────────────────────────

export function Landing(actions: LandingProps) {
  const { hosted, signedIn, onStart } = actions;
  const rootRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);
  const [startKey, setStartKey] = useState("");
  const [lengthRaw, setLengthRaw] = useState("");
  const [output, setOutput] = useState<OutputKey>("log");
  // Every switch starts off, as in the app: the visitor turns them on.
  const [share, setShare] = useState(ALL_OFF);
  const [quiet, setQuiet] = useState(false);
  const [source, setSource] = useState(0);
  const [policy, setPolicy] = useState(false);

  const cycleLength = cycleLengthFrom(lengthRaw);
  const result = useMemo(() => estimateCycle(startKey, cycleLength, now), [startKey, cycleLength, now]);
  const estimate = result && "estimate" in result ? result.estimate : null;
  const error = result && "error" in result ? result.error : null;
  // A late period takes the menstrual colours (docs/DESIGN.md).
  const livePhase: PhaseName = !estimate || estimate.daysToNext < 0 ? "menstrual" : estimate.phase;
  const current = OUTPUTS.find((o) => o.value === output) ?? OUTPUTS[0];

  // The page is designed light (pastel fields), so it holds Rhea's light theme, even through an
  // OS theme change; the app's theme comes back when the landing closes.
  useLayoutEffect(() => holdLightTheme(), []);

  // Section entrances: hidden only once this runs (data-motion), shown once, never replayed.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-in", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0 }
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    root.setAttribute("data-motion", "");
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing" id="top" tabIndex={-1} ref={rootRef}>
      <header className="l-top">
        {/* Two buttons need the room the section links take below about 840px. */}
        <nav className={cn("l-nav", hosted && !signedIn && "l-nav--two")} aria-label="Rhea">
          <span className="l-brand">
            <Mark /> <span className="l-brand__name font-display">Rhea</span>
          </span>
          <div className="l-nav__links">
            <a href="#your-cycle" onClick={jump}>
              Your cycle
            </a>
            {hosted && (
              <a href="#partner-view" onClick={jump}>
                Partner view
              </a>
            )}
            <a href="#questions" onClick={jump}>
              Questions
            </a>
          </div>
          <Actions {...actions} nav />
        </nav>
      </header>

      <main>
        <div className="l-top">
          <div className="l-hero">
            <div className="l-hero__text">
              <h1 className="l-h1">
                Get to know your cycle, <em>gently</em>
              </h1>
              <p className="l-hero__line">
                Rhea is a free, open-source period tracker that keeps your logs on your device and works offline.
              </p>
              <div className="l-hero__actions">
                <Button size="lg" className="l-hero__start" onClick={onStart}>
                  {startLabel(actions)}
                </Button>
                <a className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "l-hero__try")} href="#your-cycle" onClick={jump}>
                  Try it with your own dates <ArrowDown size={18} aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="l-hero__stage" data-phase="menstrual">
              <TodayCard estimate={SAMPLE_ESTIMATE} cycleLength={SAMPLE_ESTIMATE.cycleLength} today={SAMPLE_TODAY} sample />
            </div>
          </div>
        </div>

        <section className="l-section l-about" aria-labelledby="about-title">
          <div className="l-wrap">
            <h2 id="about-title" className="l-h2" data-reveal>
              Where your logs live
            </h2>
            <div className="l-about__text" data-reveal style={order(1)}>
              <p>
                Rhea keeps <Em phase="menstrual">every log on your device</Em>, in your browser&rsquo;s own storage. It{" "}
                <Em phase="follicular">works offline</Em>, so a day can be logged on a train or with no signal at all, and it{" "}
                <Em phase="ovulation">installs like an app</Em> on a phone or a laptop.
              </p>
              <p>
                It is <Em phase="luteal">free and open source</Em> under the MIT licence, so anyone can read what the code does with a log,
                and it carries no ads and no analytics.{" "}
                {hosted ? (
                  <>
                    When you sign in, your logs sync to your account over TLS so your devices agree; the synced copy is not end-to-end
                    encrypted, and the{" "}
                    <button type="button" className="l-link" onClick={() => setPolicy(true)}>
                      privacy policy
                    </button>{" "}
                    says who can read it.
                  </>
                ) : (
                  "This copy runs without a server: nothing you log leaves this device, and there is no account to make."
                )}
              </p>
              <p>
                Its estimates say what they are: a cycle day, a phase, a likely date for the next period, and a fertile window that is a
                calendar estimate, not contraception.
              </p>
            </div>
          </div>
        </section>

        <section id="your-cycle" tabIndex={-1} className="l-section l-chapter l-live" data-phase={livePhase} aria-labelledby="your-cycle-title">
          <div className="l-wrap l-live__grid">
            <div className="l-live__form" data-reveal>
              <h2 id="your-cycle-title" className="l-h2">
                <label htmlFor="period-start">My last period started</label>
              </h2>
              <input
                id="period-start"
                className="l-field l-field--date"
                type="date"
                value={startKey}
                max={toDateKey(now)}
                data-empty={startKey ? undefined : ""}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "your-cycle-error your-cycle-note" : "your-cycle-note"}
                onChange={(e) => setStartKey(e.target.value)}
              />
              <p className="l-live__len">
                <label htmlFor="cycle-length">My cycle is usually</label>{" "}
                <input
                  id="cycle-length"
                  className="l-field l-field--short"
                  type="number"
                  inputMode="numeric"
                  min={MIN_CYCLE}
                  max={MAX_CYCLE}
                  placeholder={String(DEFAULT_CYCLE_LENGTH)}
                  value={lengthRaw}
                  onChange={(e) => setLengthRaw(e.target.value)}
                />{" "}
                days.
              </p>
              {lengthRaw !== "" && cycleLengthFrom(lengthRaw) !== Number(lengthRaw) && (
                <p className="l-live__hint">
                  Rhea takes whole days from {MIN_CYCLE} to {MAX_CYCLE}, so this uses {DEFAULT_CYCLE_LENGTH}.
                </p>
              )}
              {error && (
                <p id="your-cycle-error" className="l-live__hint" role="alert">
                  {error}
                </p>
              )}
              <p id="your-cycle-note" className="l-live__note">
                Worked out in this browser with Rhea&rsquo;s own cycle engine. Nothing you enter is stored or sent.
              </p>
            </div>
            <TodayCard estimate={estimate} cycleLength={cycleLength} today={now} />
          </div>
        </section>

        <section id="inside" className="l-section l-show" aria-labelledby="inside-title">
          <div className="l-wrap l-show__grid">
            <div className="l-show__index">
              <h2 id="inside-title" className="l-h2" data-reveal>
                Inside Rhea, with a sample cycle
              </h2>
              <Segmented
                label="Screens"
                value={output}
                options={OUTPUTS}
                onChange={(v) => v && setOutput(v)}
                className="l-show__tabs [&>button]:min-h-11 [&>button]:text-[15px]"
              />
              <p className="l-show__caption" aria-live="polite">
                {current.caption}
              </p>
            </div>
            <div className="l-show__stage" data-reveal style={order(1)}>
              <div key={output} className="l-show__sheet">
                <current.Sheet />
              </div>
            </div>
          </div>
        </section>

        {/* A build without a server has no accounts, so no partner to link. */}
        {hosted && (
          <section id="partner-view" tabIndex={-1} className="l-section l-chapter l-partner" data-phase="follicular" aria-labelledby="partner-title">
            <div className="l-wrap l-partner__grid">
              <div className="l-partner__head" data-reveal>
                <h2 id="partner-title" className="l-h2">
                  A partner view, if you want one
                </h2>
                <p className="l-lead">
                  A partner links to your account with an invite code you create. Every switch starts off, and you choose what their
                  view shows, one at a time. The switches shape the view, not the server: a linked partner&rsquo;s account can
                  technically read your synced logs.
                </p>
                <p className="l-partner__try">Try them here: the card shows what Maya&rsquo;s partner would see.</p>
              </div>
              <div className="l-partner__card">
                <PartnerCard on={share} quiet={quiet} />
              </div>
              <ul className="l-partner__list" aria-label="What the partner view shows">
                {SHARE_KEYS.map((s, i) => (
                  <li key={s.key} data-reveal style={order(i)}>
                    <ShareSwitch
                      id={`share-${s.key}`}
                      label={s.label}
                      note={s.description}
                      checked={share[s.key]}
                      onChange={(on) => setShare((prev) => ({ ...prev, [s.key]: on }))}
                    />
                  </li>
                ))}
              </ul>
              <div className="l-partner__quiet" data-reveal>
                <h3 className="l-h3 l-partner__quiet-title">Quiet windows</h3>
                <ShareSwitch
                  id="share-quiet"
                  label="A quiet window today"
                  note="In the app you pick the days. During one, the view shows a pause message, whatever is turned on above."
                  checked={quiet}
                  onChange={setQuiet}
                />
              </div>
            </div>
          </section>
        )}

        <section id="research" className="l-section l-chapter" data-phase="ovulation" aria-labelledby="research-title">
          <div className="l-wrap l-split">
            <div data-reveal>
              <h2 id="research-title" className="l-h2">
                The research behind the estimates
              </h2>
              <p className="l-lead">
                Cycle lengths from more than 600,000 real cycles, when the fertile window falls, and how much phases vary from person to
                person. Rhea lists every source in the app, under Sources.
              </p>
            </div>
            <ul className="l-refs">
              {REFERENCES.map((r, i) => (
                <li key={r.title} data-reveal style={order(i % 3)}>
                  {r.doi || r.url ? (
                    <a className="l-link l-refs__title" href={r.url ?? `https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                  ) : (
                    <span className="l-refs__title">{r.title}</span>
                  )}
                  <span className="l-refs__who">{r.who}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="history" className="l-section l-list" aria-labelledby="history-title">
          <div className="l-wrap">
            <div data-reveal>
              <h2 id="history-title" className="l-h2">
                Bring your history in, and take it with you
              </h2>
              <p className="l-lead">Start from the history you already have, and take all of it with you whenever you like.</p>
            </div>
            <div className="l-list__body" data-reveal style={order(1)}>
              <div className="l-tabs" role="group" aria-label="Where your history comes from">
                {SOURCES.map((s, i) => (
                  <button key={s.name} type="button" className="l-tab" aria-pressed={i === source} onClick={() => setSource(i)}>
                    <span className="l-tab__name">{s.name}</span>
                    <span className="l-tab__note">{s.note}</span>
                  </button>
                ))}
              </div>
              <ul className="l-bands" aria-label={`${SOURCES[source].name}: what happens`}>
                {SOURCES[source].bands.map(([verb, title, note]) => (
                  <li key={verb + title} className="l-bandrow">
                    <span className="l-bandrow__verb font-display">{verb}</span>
                    <span>
                      <span className="l-bandrow__title">{title}</span>
                      <span className="l-bandrow__note">{note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="questions" tabIndex={-1} className="l-section l-chapter" data-phase="luteal" aria-labelledby="questions-title">
          <div className="l-wrap">
            <h2 id="questions-title" className="l-h2" data-reveal>
              Honest answers
            </h2>
            <div className="l-faq">
              {FAQ.map(([q, a, local]) => {
                const answer = hosted || local === undefined ? a : local;
                return (
                  answer && (
                    <div key={q} className="l-faq__row" data-reveal>
                      <h3 className="l-h3">{q}</h3>
                      <p>{answer}</p>
                    </div>
                  )
                );
              })}
            </div>
          </div>
        </section>

        <section className="l-section l-chapter l-cta" data-phase="menstrual" aria-labelledby="start-title">
          <div className="l-wrap l-cta__inner" data-reveal>
            <div className="l-cta__ring" aria-hidden="true">
              <CycleRing avgLength={DEFAULT_CYCLE_LENGTH} avgPeriodLength={PERIOD_LENGTH} cycleDay={1} size={136}>
                <span className="l-cta__day font-display">Day 1</span>
              </CycleRing>
            </div>
            <h2 id="start-title" className="l-h2">
              Day one starts here
            </h2>
            <p className="l-lead">
              {!hosted
                ? "Rhea opens on this device. Log your last period and the estimates begin from your own dates."
                : signedIn
                  ? "You’re signed in. Open Rhea and carry on from your own dates."
                  : "Create an account, log your last period, and the estimates begin from your own dates."}
            </p>
            <Actions {...actions} size="lg" />
          </div>
        </section>
      </main>

      <footer className="l-section l-footer">
        <div className="l-wrap l-footer__grid">
          <div className="l-footer__about">
            <p className="l-brand">
              <Mark /> <span className="l-brand__name font-display">Rhea</span>
            </p>
            <p>A free, open-source period tracker. MIT licence. Estimates, not medical advice.</p>
            <p>
              <a className="l-link" href={REPO} target="_blank" rel="noreferrer">
                Source on GitHub
              </a>{" "}
              ·{" "}
              <a className="l-link" href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                MIT licence
              </a>{" "}
              ·{" "}
              <a className="l-link" href="#top" onClick={jump}>
                Back to top
              </a>
            </p>
          </div>
          <figure className="l-moon">
            <img
              src={img("rhea-saturn.jpg")}
              width={320}
              height={320}
              loading="lazy"
              decoding="async"
              alt="Rhea, a small grey cratered moon, in front of the pale gold clouds of Saturn"
            />
            <figcaption>
              Why the name? Rhea is also a moon of Saturn, seen here by the Cassini spacecraft against the planet&rsquo;s clouds. Photograph:{" "}
              <a className="l-link" href={PHOTO_PAGE} target="_blank" rel="noreferrer">
                Rhea over Saturn
              </a>
              , NASA/JPL, processed by Jcpag2012, public domain, via Wikimedia Commons.
            </figcaption>
          </figure>
        </div>
      </footer>
      {policy && <PrivacyPolicy onClose={() => setPolicy(false)} />}
    </div>
  );
}

/** One switch row of the partner demo, labelled and described as in the app's Settings. */
function ShareSwitch({ id, label, note, checked, onChange }: { id: string; label: string; note: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="l-switch" htmlFor={id}>
      <span>
        <span id={`${id}-label`} className="l-switch__label">
          {label}
        </span>
        <span id={`${id}-note`} className="l-switch__note">
          {note}
        </span>
      </span>
      <Switch id={id} checked={checked} aria-labelledby={`${id}-label`} aria-describedby={`${id}-note`} onCheckedChange={onChange} />
    </label>
  );
}
