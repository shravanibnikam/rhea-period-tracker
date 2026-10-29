// @vitest-environment jsdom
/**
 * Sheets open from state, not a Radix Dialog.Trigger, so Radix had nothing to
 * give focus back to and it dropped to the page body on close. The Sheet now
 * returns focus to whatever opened it: when it closes in place (the log sheet,
 * Add a period, the clinician summary) and when it unmounts (Privacy, Sources).
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Sheet } from "@/app/components/ui/Sheet";

afterEach(cleanup);

function Harness({ unmountOnClose }: { unmountOnClose: boolean }) {
  const [open, setOpen] = useState(false);
  const sheet = (
    <Sheet open={open} onOpenChange={setOpen} title="A sheet">
      <p>Body</p>
    </Sheet>
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {unmountOnClose ? open && sheet : sheet}
    </>
  );
}

describe("Sheet focus", () => {
  for (const unmountOnClose of [false, true]) {
    it(`returns focus to the opener when it ${unmountOnClose ? "unmounts" : "closes"}`, async () => {
      render(<Harness unmountOnClose={unmountOnClose} />);
      const opener = screen.getByRole("button", { name: "Open" });
      opener.focus();
      fireEvent.click(opener);

      const close = await screen.findByRole("button", { name: "Close" });
      await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));
      fireEvent.click(close);

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(opener));
    });
  }
});
