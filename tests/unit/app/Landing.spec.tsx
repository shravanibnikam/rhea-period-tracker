// @vitest-environment jsdom
/**
 * Landing page (docs/DESIGN.md). App renders it with
 * `hosted` = accounts configured and nobody signed in. A local-only build must
 * show no button named exactly "Sign in" (tests/e2e/local-only.e2e.ts), and the
 * live thing must compute the visitor's day with Rhea's own cycle engine.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

  it("the live thing works out today's cycle day and phase from the last period", () => {
    render(<Landing hosted={false} onStart={vi.fn()} />);
    const card = screen.getByRole("status");
    expect(card.textContent).toMatch(/four phases/); // the plain fallback before any input

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
    render(<Landing hosted={false} onStart={vi.fn()} />);
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThan(0);
    for (const s of switches) expect(s.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Nothing shared yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Cycle heads-up" }));
    expect(screen.getByRole("switch", { name: "Cycle heads-up" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("Nothing shared yet")).toBeNull();
    expect(screen.getByText(/Period likely in/)).toBeTruthy();
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
    expect(toDateKey(SAMPLE_STATE.fertileWindow!.start)).toBe("2026-10-19");
    expect(toDateKey(SAMPLE_STATE.fertileWindow!.end)).toBe("2026-10-25");
  });
});
