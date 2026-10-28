import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { applyTheme, readTheme } from "@/app/hooks/useTheme";
import { DEFAULT_CYCLE_LENGTH } from "@/domain/constants";
import { toDateKey } from "@/domain/dates";
import type { PhaseName } from "@/domain/types";
import { MAX_CYCLE, MIN_CYCLE, cycleLengthFrom, estimateCycle } from "./cycle";
import { BackupSheet, CalendarSheet, DayLogSheet, HistorySheet, PartnerCard, TodayCard, type PartnerKey } from "./fragments";
import "./landing.css";

interface LandingProps {
  /** A build with accounts (Supabase configured): the primary action creates an account. */
  hosted: boolean;
  /** Primary action: enter the app (local) or go to account creation (hosted). */
  onStart: () => void;
  /** Hosted only: go to sign-in. */
  onSignIn?: () => void;
}

const REPO = "https://github.com/shravanibnikam/rhea-period-tracker";
const COMMONS = "https://commons.wikimedia.org/wiki/File:";
const img = (file: string) => `${import.meta.env.BASE_URL}landing/${file}`;
const order = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * In-page links scroll without touching location.hash: App reads the hash as a route
 * (#today, #partner, #welcome), so a changed hash would leave the landing page.
 */
function jump(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  const target = document.getElementById(e.currentTarget.hash.slice(1));
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
}

function Mark() {
  return (
    <svg viewBox="0 0 64 64" width="28" height="28" fill="none" aria-hidden="true">
      <path d="M52.68 28.35A21 21 0 1 1 35.65 11.32" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
      <circle cx="46.85" cy="17.15" r="5" fill="currentColor" />
    </svg>
  );
}

function Actions({ hosted, onStart, onSignIn, large = false }: LandingProps & { large?: boolean }) {
  return (
    <div className="l-actions">
      {hosted && onSignIn && (
        <button type="button" className="l-link" onClick={onSignIn}>
          Sign in
        </button>
      )}
      <button type="button" className={large ? "l-button l-button--lg" : "l-button"} onClick={onStart}>
        {hosted ? "Create your account" : "Start tracking"}
      </button>
    </div>
  );
}

function Hl({ phase, children }: { phase: PhaseName; children: ReactNode }) {
  return (
    <mark data-phase={phase} className="l-hl">
      {children}
    </mark>
  );
}

// ─── Content ─────────────────────────────────────────────────────────────────

type OutputKey = "log" | "calendar" | "history" | "backup";
const OUTPUTS: { key: OutputKey; name: string; caption: string; Sheet: () => ReactNode }[] = [
  { key: "log", name: "Day log", caption: "One sheet a day: flow, symptoms, mood, energy and a note. This is the first day of Maya’s period.", Sheet: DayLogSheet },
  { key: "calendar", name: "Calendar", caption: "The month with period days, the estimated fertile window and today. Maya is on day 18.", Sheet: () => <CalendarSheet /> },
  { key: "history", name: "History", caption: "Every cycle you log, with its length and its period. Maya’s last five ran 27 to 30 days.", Sheet: HistorySheet },
  { key: "backup", name: "Backup", caption: "Everything in one JSON file, whenever you want it, from Settings.", Sheet: BackupSheet },
];

const SWITCHES: { key: PartnerKey; label: string; claim: string; text: string }[] = [
  { key: "headsup", label: "Cycle heads-up", claim: "A heads-up before your period.", text: "Your partner sees roughly when the next one is due." },
  { key: "phase", label: "Today’s phase", claim: "The phase you’re in, in plain words.", text: "A soft label for the day, with the energy that phase tends to bring." },
  { key: "symptoms", label: "Symptoms", claim: "What you’ve logged feeling.", text: "Today’s symptoms and the past week’s. The view shows symptoms only, not your notes." },
  { key: "calendar", label: "Cycle calendar", claim: "The month, as you see it.", text: "Phases, period days and the estimated fertile window." },
  { key: "quiet", label: "Quiet window", claim: "A pause, when you want one.", text: "On the days you choose, the partner view shows a pause message instead of your details, whatever else is on." },
];

const NAMES = [
  "Bull et al. 2019",
  "Wilcox, Dunson & Baird 2000",
  "Dunson et al. 1999",
  "Pierson, Althoff & Leskovec 2018",
  "Symul & Holmes 2022",
  "Reed & Carr",
  "Cleveland Clinic",
];

const REFERENCES: { title: string; who: string; doi?: string }[] = [
  { title: "Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles", who: "Bull, Rowland, Scherwitzl et al. NPJ Digital Medicine, 2019", doi: "10.1038/s41746-019-0152-7" },
  { title: "The timing of the fertile window in the menstrual cycle", who: "Wilcox, Dunson, Baird. BMJ, 2000", doi: "10.1136/bmj.321.7271.1259" },
  { title: "Day-specific probabilities of clinical pregnancy", who: "Dunson, Baird, Wilcox, Weinberg. Human Reproduction, 1999", doi: "10.1093/humrep/14.7.1835" },
  { title: "Modeling individual cyclic variation in human behavior", who: "Pierson, Althoff, Leskovec. WWW Conference, 2018", doi: "10.1145/3178876.3186052" },
  { title: "Labeling self-tracked menstrual health records with hidden semi-Markov models", who: "Symul, Holmes. IEEE Journal of Biomedical and Health Informatics, 2022", doi: "10.1109/JBHI.2021.3110716" },
  { title: "The normal menstrual cycle and the control of ovulation", who: "Reed, Carr. Endotext, NIH/NCBI" },
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

const FAQ: [string, string][] = [
  ["Is there end-to-end encryption?", "No. Your logs are stored on your device. When you sign in, they sync to your account over TLS, and the synced copy is not end-to-end encrypted: the database operator could technically read it. A copy of Rhea run without a server keeps everything on the device."],
  ["Does it work offline?", "Yes. Rhea installs like an app and opens without a connection. What you log offline is saved on the device and, if you are signed in, syncs when you are back online."],
  ["Is it contraception?", "No. The fertile window is a calendar estimate from your cycle length, and ovulation moves from cycle to cycle (Wilcox et al. 2000). Don’t rely on it to prevent pregnancy."],
  ["What can my partner see?", "In the partner view, only what you turn on, and nothing until you do; a quiet window pauses it. The app applies those switches, not the server: a linked partner’s account can technically read your synced logs, notes included."],
  ["Can I leave with my data?", "Yes. Export a JSON backup of every log from Settings at any time. Erasing data clears this device only; logs already synced to your account stay on the server."],
  ["What does it cost?", "Nothing. Rhea is free and open source under the MIT licence, with no ads and no analytics. The code is on GitHub."],
];

// ─── Page ────────────────────────────────────────────────────────────────────

export function Landing({ hosted, onStart, onSignIn }: LandingProps) {
  const actions = { hosted, onStart, onSignIn };
  const rootRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);
  const [startKey, setStartKey] = useState("");
  const [lengthRaw, setLengthRaw] = useState("");
  const [output, setOutput] = useState<OutputKey>("log");
  const [share, setShare] = useState<Record<PartnerKey, boolean>>({ headsup: true, phase: true, symptoms: false, calendar: false, quiet: false });
  const [source, setSource] = useState(0);

  const cycleLength = cycleLengthFrom(lengthRaw);
  const result = useMemo(() => estimateCycle(startKey, cycleLength, now), [startKey, cycleLength, now]);
  const estimate = result && "estimate" in result ? result.estimate : null;
  const error = result && "error" in result ? result.error : null;
  // A late period takes the menstrual colours (docs/DESIGN.md).
  const livePhase: PhaseName = !estimate ? "menstrual" : estimate.daysToNext < 0 ? "menstrual" : estimate.phase;
  const current = OUTPUTS.find((o) => o.key === output) ?? OUTPUTS[0];

  // One design in both themes: the page is the dark chapter design either way, and its app
  // fragments show Rhea's light theme. The app's theme comes back when the landing closes.
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.remove("dark");
    const red = getComputedStyle(html).getPropertyValue("--menstrual-field").trim();
    if (red) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", red);
    return () => applyTheme(readTheme());
  }, []);

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
    <div className="landing" id="top" ref={rootRef}>
      <header className="l-hero">
        <nav className="l-nav" aria-label="Rhea">
          <span className="l-brand">
            <Mark /> Rhea
          </span>
          <div className="l-nav__links">
            <a className="l-textlink" href="#your-cycle" onClick={jump}>
              Your cycle
            </a>
            <a className="l-textlink" href="#partner-view" onClick={jump}>
              Partner view
            </a>
            <a className="l-textlink" href="#questions" onClick={jump}>
              Questions
            </a>
          </div>
          <Actions {...actions} />
        </nav>
        <h1 className="l-hero__name l-display">
          <span className="l-line">
            <span style={order(0)}>Rhea.</span>
          </span>{" "}
          <span className="l-line l-line--dark">
            <span style={order(1)}>Period.</span>
          </span>
        </h1>
        <p className="l-hero__line">A free, open-source period tracker that stores your logs on your device and works offline.</p>
      </header>

      <main>
        <section className="l-about" aria-labelledby="about-title">
          <h2 id="about-title" className="l-about__title" data-reveal>
            Where your logs live
          </h2>
          <p className="l-about__text" data-reveal style={order(1)}>
            <b>Rhea</b> is a period tracker that keeps <Hl phase="menstrual">every log on your device</Hl>, in your browser&rsquo;s own
            storage. It <Hl phase="follicular">works offline</Hl>, so a day can be logged on a train or with no signal at all, and it{" "}
            <Hl phase="ovulation">installs like an app</Hl> on a phone or a laptop. It is <Hl phase="luteal">free and open source</Hl> under
            the MIT licence, so anyone can read what the code does with a log, and it carries <Hl phase="menstrual">no ads and no analytics</Hl>.{" "}
            {hosted ? (
              <>
                When you sign in, <Hl phase="follicular">your logs sync to your account</Hl> over TLS so your devices agree; the synced
                copy is not end-to-end encrypted, and the privacy policy says who can read it.
              </>
            ) : (
              <>
                This copy runs without a server: <Hl phase="follicular">nothing you log leaves this device</Hl>, and there is no account
                to make.
              </>
            )}{" "}
            Its estimates say what they are: a cycle day, a phase, a likely date for the next period, and a fertile window that is a
            calendar estimate, not contraception.{" "}
            <a className="l-about__try" href="#your-cycle" onClick={jump}>
              See where you are today.
            </a>
          </p>
        </section>

        <section id="your-cycle" className="l-live" data-phase={livePhase} aria-labelledby="your-cycle-title">
          <div className="l-live__sentence l-display" data-reveal>
            <h2 id="your-cycle-title" className="l-live__h">
              <label htmlFor="period-start">
                My last period <br />
                started
              </label>
            </h2>{" "}
            <input
              id="period-start"
              className="l-blank"
              type="date"
              value={startKey}
              max={toDateKey(now)}
              data-empty={startKey ? undefined : ""}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "your-cycle-error your-cycle-note" : "your-cycle-note"}
              onChange={(e) => setStartKey(e.target.value)}
            />
          </div>
          <div className="l-live__grid">
            <div className="l-live__side" data-reveal style={order(1)}>
              <p className="l-live__len">
                <label htmlFor="cycle-length">My cycle is usually</label>{" "}
                <input
                  id="cycle-length"
                  className="l-blank l-blank--short"
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
                  Rhea takes {MIN_CYCLE} to {MAX_CYCLE} days, so this uses {DEFAULT_CYCLE_LENGTH}.
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

        <section id="inside" className="l-show" aria-labelledby="inside-title">
          <div className="l-show__index">
            <h2 id="inside-title" className="l-show__h" data-reveal>
              Inside Rhea, with a sample cycle
            </h2>
            <ul className="l-show__names">
              {OUTPUTS.map((o, i) => (
                <li key={o.key} data-reveal style={order(i + 1)}>
                  <button type="button" className="l-display" aria-pressed={o.key === output} onClick={() => setOutput(o.key)}>
                    {o.name}
                  </button>
                </li>
              ))}
            </ul>
            <p className="l-show__caption" aria-live="polite" data-reveal style={order(5)}>
              {current.caption}
            </p>
          </div>
          <div className="l-show__stage" data-reveal style={order(2)}>
            <div key={output} className="l-show__sheet">
              <current.Sheet />
            </div>
          </div>
        </section>

        <section id="partner-view" className="l-partner" aria-labelledby="partner-title">
          <div className="l-partner__field">
            <PartnerCard on={share} />
          </div>
          <div className="l-partner__column">
            <h2 id="partner-title" className="l-partner__h l-display" data-reveal>
              Partner view
            </h2>
            <p className="l-partner__lead" data-reveal style={order(1)}>
              A partner links to your account with an invite code you create. Every switch starts off, and you choose what their view
              shows, one at a time; Maya has turned on two. The switches shape the view, not the server: a linked partner&rsquo;s
              account can technically read your synced logs.
            </p>
            {SWITCHES.map((s) => (
              <div key={s.key} className="l-partner__block" data-reveal>
                <h3 className="l-partner__claim">{s.claim}</h3>
                <p className="l-partner__text">{s.text}</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={share[s.key]}
                  className="l-switch"
                  onClick={() => setShare((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                >
                  <span>{s.label}</span>
                  <span className="l-switch__track" aria-hidden="true">
                    <span className="l-switch__thumb" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        </section>

        <figure className="l-moon">
          <div className="l-moon__frame">
            <img
              src={img("rhea-full-globe.jpg")}
              width={1440}
              height={1440}
              loading="lazy"
              decoding="async"
              alt="Rhea, a grey moon covered in craters, fully lit against black space"
            />
          </div>
          <figcaption className="l-moon__caption">
            Rhea, Saturn&rsquo;s second-largest moon, photographed by Cassini on 26 November 2005. The app is named after it.
          </figcaption>
        </figure>

        <section id="research" className="l-proof" aria-labelledby="research-title">
          <div className="l-proof__band">
            <div className="l-marquee">
              {[0, 1].map((copy) => (
                <ul key={copy} className="l-marquee__track l-display" aria-hidden={copy === 1 ? true : undefined}>
                  {NAMES.map((n) => (
                    <li key={n}>
                      {n}
                      <span className="l-dot" />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
          <div className="l-proof__row">
            <div className="l-proof__intro">
              <h2 id="research-title" className="l-proof__h" data-reveal>
                The research behind the estimates
              </h2>
              <p className="l-proof__text" data-reveal style={order(1)}>
                Cycle lengths from more than 600,000 real cycles, when the fertile window falls, and how much phases vary from person to
                person. Rhea lists every source in the app, under Sources.
              </p>
            </div>
            <ul className="l-proof__refs">
              {REFERENCES.map((r, i) => (
                <li key={r.title} data-reveal style={order(i % 4)}>
                  {r.doi ? (
                    <a className="l-textlink l-textlink--on" href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                  ) : (
                    r.title
                  )}
                  <span className="l-proof__who">{r.who}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="history" className="l-list" aria-labelledby="history-title">
          <div className="l-list__head" data-reveal>
            <h2 id="history-title" className="l-list__h l-display">
              <span className="l-dim">Bring it all in.</span> <span>Take it with you.</span>
            </h2>
            <Actions {...actions} large />
          </div>
          <div className="l-list__body">
            <div className="l-tabs" role="group" aria-label="Where your history comes from" data-reveal style={order(1)}>
              {SOURCES.map((s, i) => (
                <button key={s.name} type="button" className="l-tab" aria-pressed={i === source} onClick={() => setSource(i)}>
                  <span className="l-tab__name">{s.name}</span>
                  <span className="l-tab__note">{s.note}</span>
                </button>
              ))}
            </div>
            <ul className="l-bands" aria-label={`${SOURCES[source].name}: what happens`} data-reveal style={order(2)}>
              {SOURCES[source].bands.map(([verb, title, note]) => (
                <li key={verb + title} className="l-bandrow">
                  <span className="l-bandrow__verb">{verb}</span>
                  <span>
                    <span className="l-bandrow__title">{title}</span>
                    <span className="l-bandrow__note">{note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="questions" className="l-faq" aria-labelledby="questions-title">
          <div className="l-faq__head">
            <h2 id="questions-title" className="l-display" data-reveal>
              Straight answers
            </h2>
            <img
              src={img("rhea-before-titan.jpg")}
              width={1272}
              height={955}
              loading="lazy"
              decoding="async"
              data-reveal
              style={order(1)}
              alt="The cratered edge of Rhea in front of the larger, hazy disc of Titan, both lit from one side"
            />
          </div>
          {FAQ.map(([q, a]) => (
            <div key={q} className="l-faq__band">
              <h3 data-reveal>{q}</h3>
              <p data-reveal style={order(1)}>
                {a}
              </p>
            </div>
          ))}
        </section>

        <section className="l-cta" aria-labelledby="start-title">
          <div className="l-cta__row">
            <div className="l-cta__tile l-cta__tile--photo">
              <img
                src={img("rhea-over-saturn.jpg")}
                width={1000}
                height={1000}
                loading="lazy"
                decoding="async"
                alt="Rhea as a small grey disc in front of the pale gold clouds of Saturn"
              />
            </div>
            <div className="l-cta__tile l-cta__tile--main" data-reveal>
              <h2 id="start-title" className="l-display">
                Day one starts here.
              </h2>
              <p>
                {hosted
                  ? "Create an account, log your last period, and the estimates begin from your own dates."
                  : "Rhea opens on this device. Log your last period and the estimates begin from your own dates."}
              </p>
              <Actions {...actions} large />
            </div>
            <div className="l-cta__tile l-cta__tile--colour" />
          </div>
        </section>
      </main>

      <footer className="l-footer">
        <div className="l-footer__top">
          <p className="l-brand">
            <Mark /> Rhea, a free, open-source period tracker.
          </p>
          <p>MIT licence. Estimates, not medical advice.</p>
          <a className="l-textlink l-textlink--on" href="#top" onClick={jump}>
            Back to top
          </a>
        </div>
        <img
          className="l-footer__moon"
          src={img("rhea-trailing-hemisphere.jpg")}
          width={1164}
          height={1164}
          loading="lazy"
          decoding="async"
          alt="Rhea's trailing hemisphere, with bright fractures across grey cratered ice"
        />
        <a className="l-footer__line" href={REPO} target="_blank" rel="noreferrer">
          <span className="l-footer__host">github.com/shravanibnikam/</span>
          <span className="l-footer__repo">rhea-period-tracker</span>
        </a>
        <div className="l-footer__meta">
          <p>
            <a className="l-textlink l-textlink--on" href={REPO} target="_blank" rel="noreferrer">
              Source
            </a>{" "}
            ·{" "}
            <a className="l-textlink l-textlink--on" href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
              MIT licence
            </a>
          </p>
          <p className="l-credits">
            Pictures from NASA&rsquo;s Cassini mission, public domain, via Wikimedia Commons:{" "}
            <a className="l-textlink l-textlink--on" href={`${COMMONS}PIA07763_Rhea_full_globe5.jpg`} target="_blank" rel="noreferrer">
              Rhea full globe
            </a>{" "}
            and{" "}
            <a className="l-textlink l-textlink--on" href={`${COMMONS}Rhea_Before_Titan.jpg`} target="_blank" rel="noreferrer">
              Rhea before Titan
            </a>{" "}
            by NASA/JPL/Space Science Institute;{" "}
            <a className="l-textlink l-textlink--on" href={`${COMMONS}Rhea_Over_Saturn_from_Cassini.jpg`} target="_blank" rel="noreferrer">
              Rhea over Saturn
            </a>{" "}
            by NASA/JPL, processed by Jcpag2012;{" "}
            <a className="l-textlink l-textlink--on" href={`${COMMONS}Rhea_by_Cassini_21_Nov_2009.jpg`} target="_blank" rel="noreferrer">
              Rhea, 21 November 2009
            </a>{" "}
            by NASA.
          </p>
          <p className="l-footer__year">2026</p>
        </div>
      </footer>
    </div>
  );
}
