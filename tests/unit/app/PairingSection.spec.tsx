// @vitest-environment jsdom
/**
 * PairingSection redeem input (RHEA release blocker). The input must NOT
 * uppercase or truncate the case-sensitive invite code, and must send it to
 * redeem verbatim (only surrounding whitespace trimmed).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("@/app/lib/pairing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/pairing")>();
  return {
    ...actual, // keep the REAL isValidInviteCode / INVITE_CODE_RE
    createInviteCode: vi.fn(),
    redeemInviteCode: vi.fn().mockResolvedValue(null),
    getPartnerLink: vi.fn().mockResolvedValue(null),
    unpair: vi.fn(),
  };
});

import { PairingSection } from "@/app/views/settings/PairingSection";
import { redeemInviteCode } from "@/app/lib/pairing";

afterEach(cleanup);
beforeEach(() => vi.mocked(redeemInviteCode).mockClear());

const CODE = "aB3d_Ef-Gh1J2kL9mNp0"; // real 20-char base64url: mixed case, _ and -

async function renderRedeem(role: "partner" | null) {
  render(<PairingSection userId="u1" role={role} onRoleChanged={vi.fn()} />);
  return (await screen.findByLabelText("Invite code")) as HTMLInputElement;
}

describe("PairingSection redeem input preserves the invite code", () => {
  it("does not uppercase, letter-space, or cap length; disables mobile auto-capitalize", async () => {
    const input = await renderRedeem("partner");
    fireEvent.change(input, { target: { value: CODE } });
    expect(input.value).toBe(CODE); // verbatim — no toUpperCase, no truncation
    expect(input.hasAttribute("maxlength")).toBe(false);
    expect(input.className).not.toMatch(/uppercase/);
    expect(input.className).not.toMatch(/tracking-widest/);
    expect(input.getAttribute("autocapitalize")).toBe("none");
    expect(input.getAttribute("autocorrect")).toBe("off");
  });

  it("Pair sends the exact code to redeem_invite (case + _ + - intact, edges trimmed)", async () => {
    const input = await renderRedeem("partner");
    fireEvent.change(input, { target: { value: "  " + CODE + "  " } });
    fireEvent.click(screen.getByRole("button", { name: /^pair$/i }));
    await waitFor(() => expect(redeemInviteCode).toHaveBeenCalledWith(CODE));
  });

  it("blocks an obviously-invalid (old 8-char) code without calling the server", async () => {
    const input = await renderRedeem("partner");
    fireEvent.change(input, { target: { value: "A1B2C3D4" } });
    fireEvent.click(screen.getByRole("button", { name: /^pair$/i }));
    expect(redeemInviteCode).not.toHaveBeenCalled();
    expect(await screen.findByText(/valid invite code/i)).toBeTruthy();
  });

  it("renders the same corrected input for an undetermined (null) role", async () => {
    const input = await renderRedeem(null);
    fireEvent.change(input, { target: { value: CODE } });
    expect(input.value).toBe(CODE);
  });

  it("uses a neutral placeholder, not the old A1B2C3D4 example", async () => {
    const input = await renderRedeem("partner");
    expect(input.getAttribute("placeholder")).toBe("Paste invite code");
  });
});
