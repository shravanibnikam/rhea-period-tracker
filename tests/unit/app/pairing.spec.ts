/**
 * Pairing invite-code handling (RHEA release blocker).
 * The create_invite() secret is a CASE-SENSITIVE 20-char base64url string; the
 * client must never uppercase, truncate, or otherwise corrupt it — only trim
 * surrounding whitespace.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type LinkRows = Array<Record<string, string>>;
interface LinkResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

const { rpc, links, linkQuery } = vi.hoisted(() => {
  /** partner_links rows (or a returned error) per filter column. */
  const links: Record<string, LinkRows | "error"> = {};
  const settle = (column: string, shape: (rows: LinkRows) => LinkResult) => {
    const b = links[column] ?? [];
    return Promise.resolve<LinkResult>(
      b === "error" ? { data: null, error: { message: "permission denied" } } : shape(b)
    );
  };
  const linkQuery = (column: string) => ({
    // Emulates postgrest-js: >1 row is a RETURNED error (PGRST116), not a throw.
    maybeSingle: () =>
      settle(column, (rows) =>
        rows.length > 1
          ? { data: null, error: { code: "PGRST116", message: "multiple (or no) rows returned" } }
          : { data: rows[0] ?? null, error: null }
      ),
    limit: (n: number) => settle(column, (rows) => ({ data: rows.slice(0, n), error: null })),
  });
  return { rpc: vi.fn(), links, linkQuery };
});
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    rpc,
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (column: string, _value: string) => linkQuery(column),
      }),
    }),
  },
}));

import {
  redeemInviteCode,
  createInviteCode,
  isValidInviteCode,
  getPartnerLink,
} from "@/app/lib/pairing";

// A representative real secret: 20 chars, mixed case, with '_' and '-'.
const CODE = "aB3d_Ef-Gh1J2kL9mNp0";

beforeEach(() => {
  rpc.mockReset();
  for (const k of Object.keys(links)) delete links[k];
});

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

describe("getPartnerLink — multi-link row sets (N11, P0-06)", () => {
  it("an owner with TWO partner links is linked (so Unlink renders), no partner auto-selected", async () => {
    links.owner_id = [{ partner_id: "p1" }, { partner_id: "p2" }];
    expect(await getPartnerLink("owner-1")).toEqual({ ownerId: "owner-1", partnerId: null });
  });

  it("a partner linked to TWO owners is still a linked partner — never reported as an owner", async () => {
    links.partner_id = [{ owner_id: "o1" }, { owner_id: "o2" }];
    expect(await getPartnerLink("partner-1")).toEqual({ ownerId: null, partnerId: "partner-1" });
  });

  it("a returned lookup error rejects instead of reading as 'no link'", async () => {
    links.owner_id = "error";
    await expect(getPartnerLink("owner-1")).rejects.toMatchObject({ message: "permission denied" });
  });

  it("single links and no link behave as before (controls)", async () => {
    links.owner_id = [{ partner_id: "p1" }];
    expect(await getPartnerLink("owner-1")).toEqual({ ownerId: "owner-1", partnerId: "p1" });

    delete links.owner_id;
    links.partner_id = [{ owner_id: "o1" }];
    expect(await getPartnerLink("partner-1")).toEqual({ ownerId: "o1", partnerId: "partner-1" });

    delete links.partner_id;
    expect(await getPartnerLink("nobody")).toBeNull();
  });
});
