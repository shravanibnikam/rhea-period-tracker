// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { OverviewTab } from "@/app/views/tracker/OverviewTab";
import { InsightsTab } from "@/app/views/tracker/InsightsTab";
import { deriveCycleState } from "@/domain/cycle";
import { parseDate } from "@/domain/dates";
import { PHASES } from "@/domain/phases";
import type { FlowLevel } from "@/domain/types";
import { regularCycles } from "../../fixtures/logs";

// The regular history: 28-day cycles, the latest starting 2026-03-26.
const COMPLETED_STARTS = ["2026-01-01", "2026-01-29", "2026-02-26"];

beforeAll(() => {
  // Insights' cycle chart (recharts) measures its box; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

function today(key: string, override: number | null = null, excluded: string[] = []) {
  const day = parseDate(key);
  const state = deriveCycleState(regularCycles, override, day, new Set(excluded));
  const props = {
    phaseData: PHASES[state.phase],
    state,
    symptoms: new Set<string>(),
    toggleSymptom: vi.fn(),
    today: day,
  };
  return { state, props };
}

describe("Today: My period started today", () => {
  it("is ready again after a save, when today's flow goes back to none", async () => {
    const { props } = today("2026-04-21"); // the next period is due in 2 days
    const onPeriodStarted = vi.fn(() => Promise.resolve());
    const ui = (todayFlow: FlowLevel) => (
      <OverviewTab {...props} onPeriodStarted={onPeriodStarted} todayFlow={todayFlow} />
    );
    const { rerender } = render(ui("none"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "My period started today" }));
    });
    expect(onPeriodStarted).toHaveBeenCalledTimes(1);

    rerender(ui("medium")); // the save lands: the action goes away
    expect(screen.queryByRole("button", { name: /my period started today|saving/i })).toBeNull();
    rerender(ui("none")); // later set back to none
    const button = screen.getByRole("button", { name: "My period started today" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});

describe("Today: My period started today, on a spotting day", () => {
  it("is still offered: spotting alone doesn't start a period", () => {
    const { props } = today("2026-04-21");
    render(<OverviewTab {...props} onPeriodStarted={vi.fn(() => Promise.resolve())} todayFlow="spotting" />);
    expect(screen.getByRole("button", { name: "My period started today" })).toBeTruthy();
  });
});

describe("Today: Coming up", () => {
  it("lists no date already past when the period is very late", () => {
    const { state, props } = today("2026-06-01"); // predictions May 21 (passed), June 18, July 16
    expect(state.isLate).toBe(true);
    render(<OverviewTab {...props} />);
    const comingUp = screen.getByRole("region", { name: "Coming up" });
    expect(within(comingUp).queryByText("May 21")).toBeNull();
    expect(within(comingUp).queryByText(/ago/)).toBeNull();
    expect(within(comingUp).getByText("June 18")).toBeTruthy();
    expect(within(comingUp).getByText("July 16")).toBeTruthy();
  });
});

describe("Today and Insights name what the predictions come from", () => {
  const insights = ({ state }: ReturnType<typeof today>, excluded: string[] = []) => (
    <InsightsTab
      phaseData={PHASES[state.phase]}
      cycles={state.cycles}
      avgLength={state.avgCycleLength}
      avgPeriodLength={state.avgPeriodLength}
      cycleDay={state.cycleDay}
      stdDev={state.stdDev}
      logs={regularCycles}
      predictions={state.predictions}
      excludedStarts={new Set(excluded)}
      onToggleExcluded={vi.fn()}
    />
  );

  it("the logged cycles", () => {
    render(<OverviewTab {...today("2026-04-01").props} />);
    expect(screen.getByText("Building accuracy, from 3 complete cycles")).toBeTruthy();
  });

  it("a cycle length set in Settings", () => {
    const t = today("2026-04-01", 30);
    render(<OverviewTab {...t.props} />);
    expect(screen.getByText("An estimate from the 30-day cycle you set")).toBeTruthy();
    cleanup();
    render(insights(t));
    expect(screen.getByText("Estimates from the 30-day cycle length you set.")).toBeTruthy();
  });

  it("every cycle excluded: both say so, and show the same estimates", () => {
    const t = today("2026-04-01", null, COMPLETED_STARTS);
    render(<OverviewTab {...t.props} />);
    expect(screen.getByText("Early estimate from a typical 28-day cycle, as all your cycles are excluded")).toBeTruthy();
    cleanup();
    render(insights(t, COMPLETED_STARTS));
    expect(screen.getByText("All your cycles are excluded, so these estimates use a typical 28-day cycle.")).toBeTruthy();
    expect(screen.queryByText(/estimated here once a cycle completes/)).toBeNull();
    expect(screen.getByText("Apr 23")).toBeTruthy();
  });
});
