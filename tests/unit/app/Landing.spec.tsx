// @vitest-environment jsdom
/**
 * Landing page (docs/DESIGN.md). App renders it with `hosted` = accounts
 * configured (it alone picks the privacy copy) and `signedIn` = a session
 * exists. A local-only build must show no button named exactly "Sign in"
 * (tests/e2e/local-only.e2e.ts), and the live thing must compute the visitor's
 * day with Rhea's own cycle engine.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { SHARE_KEYS } from "@/app/lib/sharing";
import { Landing } from "@/app/views/landing/Landing";
import { SAMPLE_LOGS, SAMPLE_STATE } from "@/app/views/landing/cycle";
import { addDays, toDateKey } from "@/domain/dates";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

const daysAgo = (n: number) => toDateKey(addDays(new Date(), -n));
// The section is aria-labelledby its sentence too; the field is the input.
const startField = () => screen.getByLabelText(/my last period/i, { selector: "input" });

describe("Landing", () => {
  it("renders the page title as its one h1", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Get to know your cycle, gently/);
  });

  it("local mode: Start tracking enters the app and there is no Sign in button", () => {
    const onStart = vi.fn();
    render(<Landing hosted={false} onStart={onStart} onSignIn={vi.fn()} />);
    expect(screen.queryAllByRole("button", { name: "Sign in" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "Create your account" })).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Start tracking" })[0]);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("hosted mode: Create your account and Sign in call their callbacks", () => {
    const onStart = vi.fn();
    const onSignIn = vi.fn();
    render(<Landing hosted onStart={onStart} onSignIn={onSignIn} />);
    expect(screen.queryAllByRole("button", { name: "Start tracking" })).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Create your account" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  // The privacy copy follows the build alone; a session only changes the buttons.
  const LOCAL_COPY = /nothing you log leaves this device, and there is no account to make/;
  const SYNC_COPY = /your logs sync to your account over TLS/;

  it("hosted and signed in: Open Rhea, no Sign in, and the sync copy, never the local one", () => {
    const onStart = vi.fn();
    render(<Landing hosted signedIn onStart={onStart} onSignIn={vi.fn()} />);
    const open = screen.getAllByRole("button", { name: "Open Rhea" });
    expect(open).toHaveLength(3); // nav, hero, closing call
    expect(screen.queryAllByRole("button", { name: "Sign in" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: /Create your account|Start tracking/ })).toHaveLength(0);
    expect(document.body.textContent).toMatch(SYNC_COPY);
    expect(document.body.textContent).not.toMatch(LOCAL_COPY);
    expect(document.body.textContent).not.toMatch(/Create an account/);
    fireEvent.click(open[1]);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("the privacy copy: sync wording when hosted, local wording only without a server", () => {
    render(<Landing hosted onStart={vi.fn()} onSignIn={vi.fn()} />);
    expect(document.body.textContent).toMatch(SYNC_COPY);
    expect(document.body.textContent).not.toMatch(LOCAL_COPY);
    cleanup();
    render(<Landing hosted={false} onStart={vi.fn()} />);
    expect(document.body.textContent).toMatch(LOCAL_COPY);
    expect(document.body.textContent).not.toMatch(SYNC_COPY);
  });

  it("hosted: the privacy policy the copy names opens from the page", () => {
    render(<Landing hosted onStart={vi.fn()} onSignIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "privacy policy" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("a build without a server advertises no accounts and no partner view", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: /partner view/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Partner view" })).toBeNull();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: /What can my partner see/ })).toBeNull();
    const faq = document.getElementById("questions")!.textContent!;
    expect(faq).not.toMatch(/sign in|signed in|your account/i);
  });

  it("in-page links move focus to their target, so Tab continues from there", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<Landing hosted onStart={vi.fn()} onSignIn={vi.fn()} />);
    fireEvent.click(screen.getByRole("link", { name: "Questions" }));
    expect(document.activeElement?.id).toBe("questions");
    fireEvent.click(screen.getByRole("link", { name: /Try it with your own dates/ }));
    expect(document.activeElement?.id).toBe("your-cycle");
  });

  it("the live thing works out today's cycle day and phase from the last period", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    const card = screen.getByRole("status");
    expect(card.textContent).toMatch(/by phase/); // the plain fallback before any input

    fireEvent.change(startField(), { target: { value: daysAgo(17) } });
    expect(card.textContent).toMatch(/Day\s*18\s*of 28/);
    expect(card.textContent).toMatch(/Luteal phase/);
    expect(card.textContent).toMatch(/in 11 days/);
    expect(card.textContent).toMatch(/a calendar estimate, not contraception/i);

    fireEvent.change(screen.getByLabelText(/my cycle is usually/i), { target: { value: "35" } });
    expect(card.textContent).toMatch(/Day\s*18\s*of 35/);
    expect(card.textContent).toMatch(/Ovulation phase/);
  });

  it("the partner view starts with every switch off, and the card follows them", () => {
    render(<Landing hosted onStart={vi.fn()} onSignIn={vi.fn()} />);
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThan(0);
    for (const s of switches) expect(s.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Nothing shared yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Cycle heads-up" }));
    expect(screen.getByRole("switch", { name: "Cycle heads-up" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("Nothing shared yet")).toBeNull();
    expect(screen.getByText(/Period likely in/)).toBeTruthy();
  });

  it("the partner demo has the app's share switches, with a quiet window kept apart", () => {
    render(<Landing hosted onStart={vi.fn()} onSignIn={vi.fn()} />);
    const list = screen.getByRole("list", { name: "What the partner view shows" });
    expect(within(list).getAllByRole("switch").map((s) => s.getAttribute("aria-labelledby"))).toEqual(
      SHARE_KEYS.map((k) => `share-${k.key}-label`)
    );
    for (const k of SHARE_KEYS) expect(within(list).getByRole("switch", { name: k.label })).toBeTruthy();
    expect(within(list).queryByRole("switch", { name: /quiet/i })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Today's mood" }));
    fireEvent.click(screen.getByRole("switch", { name: "Care nudges" }));
    fireEvent.click(screen.getByRole("switch", { name: "Symptoms" }));
    expect(screen.getByText("Mood today")).toBeTruthy();
    expect(screen.getByText("How you can help")).toBeTruthy();
    expect(screen.getByText("Symptoms today")).toBeTruthy();
    expect(screen.getByText(/Sat, Oct 24 · Breast tenderness/)).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "A quiet window today" }));
    expect(screen.getByText("Sharing paused")).toBeTruthy();
    expect(screen.getByText(/Their details show again when it ends/)).toBeTruthy();
    expect(screen.queryByText("Mood today")).toBeNull();
  });

  it("a short cycle lists only the phases its days fall in, never an empty or inverted range", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    const card = screen.getByRole("status");
    fireEvent.change(screen.getByLabelText(/my cycle is usually/i), { target: { value: "18" } });
    expect(card.textContent).toMatch(/Menstrual · Rest & releaseDays 1–5Luteal · Turn inwardDays 6–18/);
    expect(card.textContent).not.toMatch(/Follicular|Ovulation|No days/);
  });

  it("a year still being typed (0002, 0020, 0202) shows no alert and no estimate", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    for (const value of ["0002-05-01", "0020-05-01", "0202-05-01"]) {
      fireEvent.change(startField(), { target: { value } });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("status").textContent).toMatch(/by phase/);
    }
  });

  it("says why a start more than one and a half cycles back is refused", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    fireEvent.change(startField(), { target: { value: daysAgo(42) } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/Day\s*43\s*of 28/);
    fireEvent.change(startField(), { target: { value: daysAgo(43) } });
    expect(screen.getByRole("alert").textContent).toMatch(/43 days ago, more than one and a half cycles back/);
  });

  it("a cycle length that is not a whole day says whole days", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/my cycle is usually/i), { target: { value: "28.5" } });
    expect(screen.getByText(/Rhea takes whole days from 18 to 45, so this uses 28/)).toBeTruthy();
  });

  it("refuses a start date after today", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    fireEvent.change(startField(), { target: { value: daysAgo(-3) } });
    expect(screen.getByRole("alert").textContent).toMatch(/after today/);
  });

  it("shows the light app fragments in both themes, and gives the theme back on leaving", () => {
    // An OS in dark mode, with the theme left on "system" (no storage in this environment).
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("dark"), addEventListener() {}, removeEventListener() {} }));
    document.documentElement.classList.add("dark");
    const { unmount } = render(<Landing hosted={false} onStart={vi.fn()} />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    unmount();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("the sample person's data adds up through the engine", () => {
    expect(SAMPLE_LOGS).toHaveLength(33);
    expect(SAMPLE_STATE.cycles).toHaveLength(6);
    expect(SAMPLE_STATE.avgCycleLength).toBe(28);
    expect(SAMPLE_STATE.cycleDay).toBe(18);
    expect(SAMPLE_STATE.phase).toBe("luteal");
    expect(toDateKey(SAMPLE_STATE.nextPeriodDate!)).toBe("2026-11-07");
    // Ovulation on cycle day 14 (the phase oracle's), so the window ends with the ovulation phase.
    expect(toDateKey(SAMPLE_STATE.fertileWindow!.start)).toBe("2026-10-18");
    expect(toDateKey(SAMPLE_STATE.fertileWindow!.end)).toBe("2026-10-24");
  });
});
