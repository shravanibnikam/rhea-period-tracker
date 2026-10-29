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
vi.mock("@/app/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/audit")>();
  return { ...actual, logAudit: vi.fn().mockResolvedValue(undefined) };
});

import { PairingSection } from "@/app/views/settings/PairingSection";
import { createInviteCode, getPartnerLink, redeemInviteCode, unpair } from "@/app/lib/pairing";
import { logAudit } from "@/app/lib/audit";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(redeemInviteCode).mockClear();
  vi.mocked(logAudit).mockClear();
});

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

describe("PairingSection unlink asks first", () => {
  it("unlinks only after the owner confirms, logs it, and leaves focus on the new invite button", async () => {
    vi.mocked(getPartnerLink).mockResolvedValueOnce({ ownerId: "u1", partnerId: "p1" });
    vi.mocked(unpair).mockResolvedValue(null);
    render(<PairingSection userId="u1" role="owner" onRoleChanged={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Unlink partner" }));
    expect(unpair).not.toHaveBeenCalled();
    expect(screen.getByText(/link again later/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Unlink partner" }));
    await waitFor(() => expect(unpair).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(logAudit).toHaveBeenCalledWith("u1", "partner.unpaired"));
    const generate = await screen.findByRole("button", { name: "Generate invite code" });
    expect(document.activeElement).toBe(generate);
  });

  it("Cancel puts focus back on Unlink partner, and nothing is logged", async () => {
    vi.mocked(getPartnerLink).mockResolvedValueOnce({ ownerId: "u1", partnerId: "p1" });
    render(<PairingSection userId="u1" role="owner" onRoleChanged={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Unlink partner" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Unlink partner" }));
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("PairingSection invite code", () => {
  const CODE_2 = "zY9x-Wv8_Ut7Sr6Qp5On"; // a second real-shaped code

  it("says when the code stops working and makes a new one on request", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 9, 29, 15, 15).getTime()); // TZ is UTC in tests
    vi.mocked(createInviteCode).mockResolvedValueOnce(CODE).mockResolvedValueOnce(CODE_2);
    render(<PairingSection userId="u1" role="owner" onRoleChanged={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Generate invite code" }));
    expect(await screen.findByText(CODE)).toBeTruthy();
    expect(screen.getByText(/^3:45\sPM$/)).toBeTruthy(); // 30 minutes after it was made
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Copy code" }));

    const again = screen.getByRole("button", { name: "Make a new code" });
    again.focus();
    fireEvent.click(again);
    expect(await screen.findByText(CODE_2)).toBeTruthy();
    expect(screen.queryByText(CODE)).toBeNull();
    expect(document.activeElement).toBe(again);
    now.mockRestore();
  });

  it("re-checks the link when the owner comes back, so a redeemed code stops saying 'Send this code'", async () => {
    vi.mocked(createInviteCode).mockResolvedValueOnce(CODE);
    const onRoleChanged = vi.fn();
    render(<PairingSection userId="u1" role="owner" onRoleChanged={onRoleChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate invite code" }));
    await screen.findByText("Send this code to your partner");

    vi.mocked(getPartnerLink).mockResolvedValueOnce({ ownerId: "u1", partnerId: "p1" });
    fireEvent.focus(window);
    expect(await screen.findByText("Partner linked")).toBeTruthy();
    expect(screen.queryByText("Send this code to your partner")).toBeNull();
    expect(onRoleChanged).toHaveBeenCalled();
  });
});

describe("PairingSection focus and busy state", () => {
  it("after Try again, focus lands on the reloaded panel's first control", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getPartnerLink).mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<PairingSection userId="u1" role="owner" onRoleChanged={vi.fn()} />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    retry.focus();
    fireEvent.click(retry);
    const generate = await screen.findByRole("button", { name: "Generate invite code" });
    expect(document.activeElement).toBe(generate);
    quiet.mockRestore();
  });

  it("a busy Pair button keeps focus and ignores another press", async () => {
    let finish!: (err: string | null) => void;
    vi.mocked(redeemInviteCode).mockReturnValueOnce(new Promise((r) => (finish = r)));
    const input = await renderRedeem("partner");
    fireEvent.change(input, { target: { value: CODE } });
    const pair = screen.getByRole("button", { name: /^pair$/i }) as HTMLButtonElement;
    pair.focus();
    fireEvent.click(pair);

    await waitFor(() => expect(pair.getAttribute("aria-disabled")).toBe("true"));
    expect(pair.disabled).toBe(false);
    expect(document.activeElement).toBe(pair);
    fireEvent.submit(input.form!);
    expect(redeemInviteCode).toHaveBeenCalledTimes(1);

    finish("That code doesn't work any more.");
    expect(await screen.findByText("That code doesn't work any more.")).toBeTruthy();
  });
});
