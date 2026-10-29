// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
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

describe("calendar while a period is late", () => {
  // Started Sep 21 with a 28-day average: due Oct 19, so 9 days late on Oct 28.
  const LATE = [{ periodStart: "2026-09-21", periodEnd: "2026-09-25", periodLength: 5, cycleLength: null, excluded: false }];
  const TODAY = new Date(2026, 9, 28);
  const cell = (re: RegExp) => screen.getAllByRole("button").find((b) => re.test(b.getAttribute("aria-label") ?? ""));

  it("runs the current cycle on to today and predicts the next period from tomorrow", () => {
    render(<CalendarTab cycles={LATE} avgLength={28} avgPeriodLength={5} today={TODAY} logs={[]} fertileWindow={null} readOnly />);
    expect(cell(/^Wednesday, October 28, today, luteal phase/)).toBeTruthy();
    // The predicted period that would have started Oct 19 is not drawn in the past.
    for (const d of [19, 20, 21, 22, 23]) expect(cell(new RegExp(`October ${d}, .*period predicted`))).toBeUndefined();
    expect(cell(/^Thursday, October 29, menstrual phase, period predicted/)).toBeTruthy();
  });
});

describe("calendar Today button", () => {
  it("is a 44px target and leaves focus on the month picker when it goes away", () => {
    render(<CalendarTab cycles={CYCLES} avgLength={28} avgPeriodLength={5} today={new Date(2026, 9, 28)} logs={[]} fertileWindow={null} readOnly />);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    const back = screen.getByRole("button", { name: "Today" });
    expect(back.className).toContain("h-11");
    fireEvent.click(back);
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Month" }));
  });
});
