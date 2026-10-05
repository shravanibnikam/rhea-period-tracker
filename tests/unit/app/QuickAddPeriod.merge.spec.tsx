// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { useLogger } from "@/app/hooks/useLogger";
import { QuickAddPeriod } from "@/app/views/tracker/QuickAddPeriod";
import { PHASES } from "@/domain/phases";
import { toDateKey } from "@/domain/dates";
import { emptyLog, type DailyLog } from "@/domain/types";

// P0-01 regression through the real write path: QuickAddPeriod → useLogger
// .saveMany → Container → LogRepository (fake-indexeddb), wired exactly like
// App.tsx (`saveLogs={saveActiveLogs}`). Quick Add over a logged day must keep
// the note; the active view and onSaved must see the MERGED record.

const LOGGED = "2026-03-10";
const NEXT = "2026-03-11";

const SEEDED: DailyLog = {
  date: LOGGED,
  flow: "light",
  symptoms: ["cramps", "bloating", "headache"],
  mood: "anxious",
  energy: "low",
  notes: "private note",
  medication: [{ name: "ibuprofen" }],
  intimacy: { occurred: true },
};

interface HarnessProps {
  onSaved: (saved: DailyLog[]) => void;
  onClose: () => void;
}

function Harness({ onSaved, onClose }: HarnessProps) {
  // The active log date is the logged day, as when App's sheet points at it.
  const { log, loading, saveMany } = useLogger(new Date(2026, 2, 10), onSaved);
  return (
    <>
      <output data-testid="active-notes">{loading ? "loading" : log.notes}</output>
      <QuickAddPeriod onClose={onClose} saveLogs={saveMany} phaseData={PHASES.menstrual} />
    </>
  );
}

let open: Container[] = [];
afterEach(async () => {
  cleanup();
  for (const c of open) await c.closeDB();
  open = [];
});

describe("QuickAddPeriod merges into existing logs (P0-01)", () => {
  it("an existing note survives clicking 'Add 2-day period'", async () => {
    const c = new Container();
    c.setAccount("quick-add-merge");
    open.push(c);
    await c.saveLog(SEEDED);

    const onSaved = vi.fn<(saved: DailyLog[]) => void>();
    const onClose = vi.fn<() => void>();
    render(
      <ContainerProvider value={c}>
        <Harness onSaved={onSaved} onClose={onClose} />
      </ContainerProvider>
    );
    const activeNotes = screen.getByTestId("active-notes");
    await waitFor(() => expect(activeNotes.textContent).toBe("private note"));

    fireEvent.change(screen.getByDisplayValue(toDateKey(new Date())), {
      target: { value: LOGGED },
    });
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2-day period" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    // Persisted: the logged day keeps everything but flow; the next day is new.
    const kept = await c.getLog(LOGGED);
    expect(kept?.notes).toBe("private note");
    expect(kept).toMatchObject({ ...SEEDED, flow: "medium" });
    expect(await c.getLog(NEXT)).toMatchObject({ ...emptyLog(NEXT), flow: "medium" });

    // onSaved (App legacy-pushes what it receives) gets full MERGED records.
    expect(onSaved).toHaveBeenCalledTimes(1);
    const reported = onSaved.mock.calls[0][0];
    expect(reported.find((l) => l.date === LOGGED)).toMatchObject({ ...SEEDED, flow: "medium" });
    expect(reported.find((l) => l.date === NEXT)).toMatchObject({ ...emptyLog(NEXT), flow: "medium" });

    // The active view shows the merged record, not a blank Quick Add row.
    expect(activeNotes.textContent).toBe("private note");
  });
});
