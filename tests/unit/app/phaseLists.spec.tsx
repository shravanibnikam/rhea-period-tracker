// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { CalendarTab } from "@/app/views/tracker/CalendarTab";

afterEach(cleanup);

const CYCLES = [{ periodStart: "2026-10-20", periodEnd: "2026-10-24", periodLength: 5, cycleLength: null, excluded: false }];

// An 18-day cycle squeezes the follicular and ovulation phases to no days
// (src/domain/phases.ts): lists name only the phases a day can be in.
describe("phase lists on a very short cycle", () => {
  it("the calendar legend leaves out phases with no days", () => {
    render(
      <CalendarTab cycles={CYCLES} avgLength={18} avgPeriodLength={5} today={new Date(2026, 9, 28)} logs={[]} fertileWindow={null} readOnly />
    );
    const legend = screen.getByText("Menstrual phase").closest("ul") as HTMLElement;
    expect(within(legend).queryByText("Follicular phase")).toBeNull();
    expect(within(legend).queryByText(/No days/)).toBeNull();
    expect(within(legend).getByText("Luteal phase")).toBeTruthy();
  });
});
