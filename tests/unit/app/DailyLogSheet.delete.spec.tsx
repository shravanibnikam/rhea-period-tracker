// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { DailyLogSheet } from "@/app/views/tracker/DailyLogSheet";
import { emptyLog } from "@/domain/types";
import { PHASES } from "@/domain/phases";

afterEach(cleanup);

type Props = React.ComponentProps<typeof DailyLogSheet>;

function renderSheet(over: Partial<Props> = {}) {
  const props: Props = {
    log: emptyLog("2099-01-01"),
    setLog: vi.fn(),
    onSave: vi.fn(),
    onClose: vi.fn(),
    phaseData: PHASES.menstrual,
    date: new Date(2099, 0, 1),
    ...over,
  };
  render(<DailyLogSheet {...props} />);
  return props;
}

const deleteBtn = () => screen.queryByRole("button", { name: /delete this log/i });
const confirmBtn = () => screen.queryByRole("button", { name: /confirm delete log/i });

describe("DailyLogSheet — Delete action", () => {
  it("hides Delete when canDelete is false (e.g. a new/empty draft)", () => {
    renderSheet({ canDelete: false, onDelete: vi.fn() });
    expect(deleteBtn()).toBeNull();
  });

  it("hides Delete when no onDelete handler is provided", () => {
    renderSheet({ canDelete: true });
    expect(deleteBtn()).toBeNull();
  });

  it("is confirmation-gated: first click reveals confirm without deleting", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderSheet({ canDelete: true, onDelete });
    fireEvent.click(deleteBtn()!);
    expect(confirmBtn()).not.toBeNull();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("cancel backs out without deleting", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderSheet({ canDelete: true, onDelete });
    fireEvent.click(deleteBtn()!);
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(confirmBtn()).toBeNull();
    expect(deleteBtn()).not.toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("confirming calls onDelete exactly once", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderSheet({ canDelete: true, onDelete });
    fireEvent.click(deleteBtn()!);
    fireEvent.click(confirmBtn()!);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it("a failed delete keeps the modal open and surfaces an error (log retained)", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("push failed"));
    const props = renderSheet({ canDelete: true, onDelete });
    fireEvent.click(deleteBtn()!);
    fireEvent.click(confirmBtn()!);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/push failed/i);
    expect(props.onClose).not.toHaveBeenCalled();
    // Recovered to the non-confirming state so the user can retry.
    expect(deleteBtn()).not.toBeNull();
  });
});
