// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import type { SyncEngine } from "@/sync";
import { toDateKey } from "@/domain/dates";
import { emptyLog, type DailyLog } from "@/domain/types";

// P0-N1, App level (port of reviewer probe Q13). The app mounts before auth
// resolves, so the active log's first read hits the local-only database. When
// the owner's session arrives, today's log must be re-read from HER database:
// the Overview shows her stored symptoms, and a symptom tap keeps her notes
// instead of replacing today's row with an empty draft plus the tapped symptom.

const h = vi.hoisted(() => ({
  authCb: null as ((event: string, session: unknown) => Promise<void>) | null,
}));

vi.mock("@/app/lib/supabase", () => {
  // No partner link in either direction: the user resolves as an owner.
  const noRows = {
    limit: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return {
    isSupabaseConfigured: () => true,
    supabase: {
      auth: {
        onAuthStateChange: (cb: (event: string, session: unknown) => Promise<void>) => {
          h.authCb = cb;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signOut: () => Promise.resolve({ error: null }),
      },
      from: () => ({ select: () => ({ eq: () => noRows }) }),
    },
  };
});

vi.mock("@/app/lib/sync", () => ({
  initialSync: vi.fn(() => Promise.resolve()),
  pushLog: vi.fn(() => Promise.resolve()),
  subscribeToLogs: vi.fn(() => null),
  unsubscribe: vi.fn(),
  setSyncReadOnly: vi.fn(),
  isSyncReadOnly: vi.fn(() => false),
}));

import App from "@/app/App";

/** The owner engine over a NullTransport: no network in unit tests. */
class TestContainer extends Container {
  override async startOwnerSync(uid: string): Promise<SyncEngine> {
    return super.startOwnerSync(uid, null);
  }
}

let open: Container[] = [];
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

async function seed(uid: string, logs: DailyLog[]): Promise<void> {
  const c = new Container();
  c.setAccount(uid);
  for (const log of logs) await c.saveLog(log);
  await c.closeDB();
}

describe("App: the active log follows the signed-in account (P0-N1, probe Q13)", () => {
  it("an owner reopening the app sees today's stored symptoms, and a tap keeps her notes", async () => {
    const uid = `n1-app-owner-${Date.now()}`;
    const today = toDateKey(new Date());
    await seed(uid, [
      { ...emptyLog("2026-06-01"), flow: "heavy" },
      { ...emptyLog(today), flow: "medium", notes: "KEEP-ME", symptoms: ["Headache"] },
    ]);
    const c = new TestContainer();
    open.push(c);
    render(
      <ContainerProvider value={c}>
        <App />
      </ContainerProvider>
    );
    await act(async () => {
      await h.authCb?.("INITIAL_SESSION", { user: { id: uid, email: "owner@example.test" } });
    });
    await screen.findByRole("button", { name: "Log today" }); // the owner's tracker
    await waitFor(() => expect(c.syncEngine()).not.toBeNull());

    // The Overview shows today's stored symptom (soft: also run the tap below).
    const shown = await waitFor(() => screen.getByText(/1 tracked today/)).then(
      () => true,
      () => false
    );
    expect.soft(shown, "Overview shows today's stored symptom").toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cramps" }));
    await waitFor(async () => expect((await c.getLog(today))?.symptoms).toContain("Cramps"));
    const stored = await c.getLog(today);
    expect(stored?.notes).toBe("KEEP-ME");
    expect(stored).toMatchObject({ flow: "medium", symptoms: ["Headache", "Cramps"] });
    expect(screen.getByText(/2 tracked today/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
