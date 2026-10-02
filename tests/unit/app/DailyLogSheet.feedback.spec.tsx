// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { DailyLogSheet } from "@/app/views/tracker/DailyLogSheet";
import { emptyLog } from "@/domain/types";
import { PHASES } from "@/domain/phases";

// P0-04 review follow-ups on the Log sheet's save feedback.
//   (4) A day whose saved log could not be read says so, and Save is disabled
//       (a Save would only be refused).
//   (8) While a save (or delete) is running the sheet cannot be closed, and a
//       late result never calls onClose after the sheet is gone: App's onClose
//       closes whatever sheet is open NOW, which may be another day's.

afterEach(cleanup);

type Props = React.ComponentProps<typeof DailyLogSheet>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function props(over: Partial<Props> = {}): Props {
  return {
    log: emptyLog("2099-01-01"),
    setLog: vi.fn(),
    onSave: vi.fn(() => Promise.resolve()),
    onClose: vi.fn(),
    phaseData: PHASES.menstrual,
    date: new Date(2099, 0, 1),
    ...over,
  };
}

const saveButton = () => screen.getByRole("button", { name: "Save Log" }) as HTMLButtonElement;
const closeButton = () => screen.getByRole("button", { name: "Close" }) as HTMLButtonElement;
const backdrop = () => document.querySelector("[aria-hidden='true'].absolute") as HTMLElement;

describe("DailyLogSheet: a load failure is shown (review item 4)", () => {
  it("shows the load error as an alert and disables Save", () => {
    render(<DailyLogSheet {...props({ loadError: "Couldn't load this day's saved log." })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load this day's saved log/i);
    expect(saveButton().disabled).toBe(true);
  });

  it("without a load error, Save is enabled and nothing is announced", () => {
    render(<DailyLogSheet {...props({ loadError: null })} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });
});

describe("DailyLogSheet: no closing while a save or delete runs (review item 8)", () => {
  it("Escape, X and the backdrop do nothing while saving; the sheet closes once the save lands", async () => {
    const pending = deferred();
    const p = props({ onSave: vi.fn(() => pending.promise) });
    render(<DailyLogSheet {...p} />);
    fireEvent.click(saveButton());

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(backdrop());
    expect(p.onClose).not.toHaveBeenCalled();
    expect(closeButton().disabled).toBe(true);
    fireEvent.click(closeButton());
    expect(p.onClose).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(closeButton().disabled).toBe(false);
  });

  it("Escape does nothing while a delete runs", async () => {
    const pending = deferred();
    const p = props({ canDelete: true, onDelete: vi.fn(() => pending.promise) });
    render(<DailyLogSheet {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /delete this log/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete log/i }));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onClose).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
  });

  it("a save that lands after the sheet is gone does not call onClose", async () => {
    const pending = deferred();
    const p = props({ onSave: vi.fn(() => pending.promise) });
    const { unmount } = render(<DailyLogSheet {...p} />);
    fireEvent.click(saveButton());
    unmount(); // e.g. sign-out or an account switch while the save was running

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(p.onClose).not.toHaveBeenCalled();
  });
});
