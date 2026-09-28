// @vitest-environment jsdom
/**
 * PairingSection's partner-status load (P0-06 / N11).
 *
 * getPartnerLink REJECTS when the partner_links lookup returns an error, so an
 * unknown link state is never read as "no link" — which would offer an
 * already-linked owner a second invite (multi-link). The section must then say
 * so, and offer neither invite nor redeem, instead of silently vanishing with
 * an unhandled rejection. Uses the real getPartnerLink over a mocked client.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

type LinkRows = Array<Record<string, string>>;

const h = vi.hoisted(() => ({
  /** partner_links rows (or a returned error) per filter column. */
  links: {} as Record<string, LinkRows | "error">,
}));

vi.mock("@/app/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    rpc: vi.fn(),
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (column: string, _value: string) => {
          const b = h.links[column] ?? [];
          const failed = { data: null, error: { message: "Failed to fetch" } };
          return {
            limit: (n: number) =>
              Promise.resolve(b === "error" ? failed : { data: b.slice(0, n), error: null }),
            // The pre-P0-06 lookup shape, emulating postgrest-js: >1 row is a
            // RETURNED error (PGRST116), not a throw — so the parent's RED is
            // behavioural rather than a TypeError.
            maybeSingle: () =>
              Promise.resolve(
                b === "error"
                  ? failed
                  : b.length > 1
                    ? { data: null, error: { code: "PGRST116", message: "multiple (or no) rows returned" } }
                    : { data: b[0] ?? null, error: null }
              ),
          };
        },
      }),
    }),
  },
}));

import { PairingSection } from "@/app/views/settings/PairingSection";

const STATUS_ERROR = /couldn't load partner status/i;

beforeEach(() => {
  h.links = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PairingSection — partner status that cannot be loaded", () => {
  for (const role of ["owner", "partner", null] as const) {
    it(`role ${role}: shows an error and offers neither invite, redeem nor unlink`, async () => {
      h.links.owner_id = "error";
      render(<PairingSection userId="u1" role={role} onRoleChanged={vi.fn()} />);

      expect(await screen.findByText(STATUS_ERROR)).toBeTruthy();
      expect(screen.queryByText(/generate invite code/i)).toBeNull();
      expect(screen.queryByLabelText("Invite code")).toBeNull();
      expect(screen.queryByText(/unlink partner/i)).toBeNull();
    });
  }
});

describe("PairingSection — multi-link owner (N11, controls)", () => {
  it("an owner with TWO partner links sees Unlink, not a second invite", async () => {
    h.links.owner_id = [{ partner_id: "p1" }, { partner_id: "p2" }];
    render(<PairingSection userId="owner-1" role="owner" onRoleChanged={vi.fn()} />);

    expect(await screen.findByText(/unlink partner/i)).toBeTruthy();
    expect(screen.queryByText(/generate invite code/i)).toBeNull();
    expect(screen.queryByText(STATUS_ERROR)).toBeNull();
  });

  it("an owner with no link is offered an invite", async () => {
    render(<PairingSection userId="owner-1" role="owner" onRoleChanged={vi.fn()} />);

    expect(await screen.findByText(/generate invite code/i)).toBeTruthy();
    expect(screen.queryByText(STATUS_ERROR)).toBeNull();
  });
});
