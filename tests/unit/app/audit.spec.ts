/**
 * The activity log's read: a failed load must reject, so the UI offers a retry
 * instead of reading the failure as "No changes recorded yet."
 */
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve(h.result) }) }) }),
    }),
  },
}));

import { getAuditLog } from "@/app/lib/audit";

describe("getAuditLog", () => {
  it("rejects on a returned error instead of resolving to an empty log", async () => {
    h.result = { data: null, error: { message: "permission denied" } };
    await expect(getAuditLog("owner-1")).rejects.toMatchObject({ message: "permission denied" });
  });

  it("resolves to the rows it read", async () => {
    const rows = [{ id: "a1", actor_id: "owner-1", action: "share.toggle_on", target: "mood_signal", created_at: "2026-10-29T12:00:00Z" }];
    h.result = { data: rows, error: null };
    expect(await getAuditLog("owner-1")).toEqual(rows);
  });
});
