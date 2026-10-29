// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OverviewTab } from "@/app/views/tracker/OverviewTab";
import { deriveCycleState } from "@/domain/cycle";
import { parseDate } from "@/domain/dates";
import { PHASES } from "@/domain/phases";
import type { FlowLevel } from "@/domain/types";
import { regularCycles } from "../../fixtures/logs";

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
