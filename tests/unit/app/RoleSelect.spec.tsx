// @vitest-environment jsdom
/**
 * RoleSelect invite input (RHEA pairing release blocker). This is the FIRST
 * screen a partner hits on initial sign-in ("I'm joining as a partner") — a
 * third redeem input that must also preserve the case-sensitive code verbatim.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("@/app/lib/pairing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/pairing")>();
  return { ...actual, redeemInviteCode: vi.fn().mockResolvedValue(null) };
});

import { RoleSelect } from "@/app/views/auth/RoleSelect";
import { redeemInviteCode } from "@/app/lib/pairing";

afterEach(cleanup);
beforeEach(() => vi.mocked(redeemInviteCode).mockClear());

const CODE = "aB3d_Ef-Gh1J2kL9mNp0";

function openInvite() {
  render(<RoleSelect onChooseOwner={vi.fn()} onPaired={vi.fn()} />);
  fireEvent.click(screen.getByText(/joining as a partner/i));
  return screen.getByLabelText("Invite code") as HTMLInputElement;
}

describe("RoleSelect partner invite input preserves the code", () => {
  it("does not uppercase or truncate the pasted code", () => {
    const input = openInvite();
    fireEvent.change(input, { target: { value: CODE } });
    expect(input.value).toBe(CODE);
    expect(input.hasAttribute("maxlength")).toBe(false);
    expect(input.className).not.toMatch(/uppercase/);
    expect(input.getAttribute("autocapitalize")).toBe("none");
    expect(input.getAttribute("placeholder")).toBe("Paste invite code");
  });

  it("Connect sends the exact code to redeem_invite (edges trimmed only)", async () => {
    const input = openInvite();
    fireEvent.change(input, { target: { value: "  " + CODE + "  " } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() => expect(redeemInviteCode).toHaveBeenCalledWith(CODE));
  });

  it("blocks the old 8-char shape without calling the server", async () => {
    const input = openInvite();
    fireEvent.change(input, { target: { value: "A1B2C3D4" } });
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(redeemInviteCode).not.toHaveBeenCalled();
    expect(await screen.findByText(/valid invite code/i)).toBeTruthy();
  });
});
