/**
 * Pairing invite-code handling (RHEA release blocker).
 * The create_invite() secret is a CASE-SENSITIVE 20-char base64url string; the
 * client must never uppercase, truncate, or otherwise corrupt it — only trim
 * surrounding whitespace.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/app/lib/supabase", () => ({ supabase: { rpc } }));

import { redeemInviteCode, createInviteCode, isValidInviteCode } from "@/app/lib/pairing";

// A representative real secret: 20 chars, mixed case, with '_' and '-'.
const CODE = "aB3d_Ef-Gh1J2kL9mNp0";

beforeEach(() => rpc.mockReset());

describe("isValidInviteCode — matches the create_invite() format", () => {
  it("accepts a 20-char base64url code (mixed case, _ and -)", () => {
    expect(isValidInviteCode(CODE)).toBe(true);
    expect(isValidInviteCode("  " + CODE + "  ")).toBe(true); // trims edges only
  });
  it("rejects the old uppercased 8-char shape and truncations", () => {
    expect(isValidInviteCode("A1B2C3D4")).toBe(false); // old placeholder / maxLength=8
    expect(isValidInviteCode(CODE.slice(0, 8))).toBe(false); // truncated
    expect(isValidInviteCode(CODE.slice(0, 19))).toBe(false); // 19
    expect(isValidInviteCode(CODE + "1")).toBe(false); // 21
  });
  it("rejects invalid characters (space, +, /)", () => {
    expect(isValidInviteCode("aB3d Ef-Gh1J2kL9mNp0")).toBe(false);
    expect(isValidInviteCode("aB3d+Ef/Gh1J2kL9mNp0")).toBe(false);
  });
});

describe("redeemInviteCode — sends the code verbatim to redeem_invite", () => {
  it("preserves mixed case, '_' and '-' exactly", async () => {
    rpc.mockResolvedValue({ error: null });
    const err = await redeemInviteCode(CODE);
    expect(err).toBeNull();
    expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_secret: CODE });
  });
  it("trims only surrounding whitespace, never internal characters/case", async () => {
    rpc.mockResolvedValue({ error: null });
    await redeemInviteCode("   " + CODE + "\n");
    expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_secret: CODE });
  });
  it("surfaces the server error message", async () => {
    rpc.mockResolvedValue({ error: { message: "Invalid, expired, or already-used invite" } });
    expect(await redeemInviteCode(CODE)).toBe("Invalid, expired, or already-used invite");
  });
});

describe("createInviteCode", () => {
  it("returns the minted secret from the create_invite RPC", async () => {
    rpc.mockResolvedValue({ data: CODE, error: null });
    expect(await createInviteCode("owner-1")).toBe(CODE);
    expect(rpc).toHaveBeenCalledWith("create_invite");
  });
});
