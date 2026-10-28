// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { DailyLogSheet } from "@/app/views/tracker/DailyLogSheet";
import { emptyLog, type DailyLog } from "@/domain/types";
import { PHASES } from "@/domain/phases";

// Medication and intimacy in the log sheet. The harness saves the way
// useLogger.save does: whatever `log` the latest render holds.

afterEach(cleanup);

function Harness({ initial, saved }: { initial?: Partial<DailyLog>; saved: DailyLog[] }) {
  const [log, setLog] = useState<DailyLog>({ ...emptyLog("2099-01-01"), ...initial });
  return (
    <DailyLogSheet
      log={log}
      setLog={setLog}
      onSave={async () => {
        saved.push(log);
      }}
      onClose={() => {}}
      phaseData={PHASES.luteal}
      date={new Date(2099, 0, 1)}
    />
  );
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const openMore = () => fireEvent.click(button("Medication and intimacy"));

async function save(saved: DailyLog[]) {
  fireEvent.click(button("Save Log"));
  await waitFor(() => expect(saved).toHaveLength(1));
  return saved[0];
}

describe("DailyLogSheet: medication", () => {
  it("adds a suggestion in one tap and a typed one trimmed, refuses an empty name, and removes one", async () => {
    const saved: DailyLog[] = [];
    render(<Harness saved={saved} />);
    openMore();

    fireEvent.click(button("Add Ibuprofen"));
    expect(screen.queryByRole("button", { name: "Add Ibuprofen" })).toBeNull(); // already logged

    fireEvent.click(button("Add medication"));
    expect(screen.getByText(/enter the medication's name/i)).toBeTruthy();

    fireEvent.change(field(/other medication/i), { target: { value: "  Mefenamic   acid " } });
    fireEvent.change(field(/dose/i), { target: { value: " 500 mg " } });
    fireEvent.change(field(/time/i), { target: { value: "08:30" } });
    fireEvent.click(button("Add medication"));
    expect(field(/other medication/i).value).toBe("");
    expect(screen.getByText(/500 mg · 8:30 AM/)).toBeTruthy();

    fireEvent.click(button("Add Iron"));
    fireEvent.click(button("Remove Iron"));

    expect((await save(saved)).medication).toEqual([
      { name: "Ibuprofen" },
      { name: "Mefenamic acid", dose: "500 mg", takenAt: "08:30" },
    ]);
  });

  it("saves a medication that was typed but not added", async () => {
    const saved: DailyLog[] = [];
    render(<Harness saved={saved} initial={{ medication: [{ name: "Iron" }] }} />);
    // The section opens by itself: this day already has medication logged.
    fireEvent.change(field(/other medication/i), { target: { value: "Naproxen" } });
    expect((await save(saved)).medication).toEqual([{ name: "Iron" }, { name: "Naproxen" }]);
  });
});

describe("DailyLogSheet: intimacy", () => {
  it("logs had sex with protected yes / no, and 'Not sure' leaves protection unknown", async () => {
    const saved: DailyLog[] = [];
    render(<Harness saved={saved} />);
    openMore();
    expect(screen.queryByRole("button", { name: "Yes" })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Had sex" }));
    expect(button("Not sure").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button("No"));
    expect(button("No").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button("Yes"));
    expect((await save(saved)).intimacy).toEqual({ occurred: true, protected: true });
  });

  it("'Not sure' stores no protection value, and switching off clears the entry", async () => {
    const first: DailyLog[] = [];
    render(<Harness saved={first} initial={{ intimacy: { occurred: true, protected: false } }} />);
    fireEvent.click(button("Not sure"));
    expect((await save(first)).intimacy).toEqual({ occurred: true });
    cleanup();

    const second: DailyLog[] = [];
    render(<Harness saved={second} initial={{ intimacy: { occurred: true } }} />);
    fireEvent.click(screen.getByRole("switch", { name: "Had sex" }));
    expect((await save(second)).intimacy).toBeNull();
  });
});
