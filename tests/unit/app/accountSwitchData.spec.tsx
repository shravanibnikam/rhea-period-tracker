// @vitest-environment jsdom
/**
 * A new account never sees the previous account's data (P0-06 review, probe P1).
 *
 * The sync gate returns before any refresh until the role is resolved, and the
 * data hook reads only on mount — so when B signed in after A and B's role
 * lookup failed or hung, the screen kept A's tracker. The app must re-read the
 * store on every account change, independent of role, and must not show the
 * main UI until that read has landed. Real Container over fake-indexeddb.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { ContainerProvider } from "@/app/di/context";
import { Container } from "@/app/di/Container";
import type { SyncEngine } from "@/sync";
import { emptyLog, type DailyLog } from "@/domain/types";
import { encodeHlc } from "@/domain/hlc";

type LinkRows = Array<Record<string, string>>;

const h = vi.hoisted(() => ({
  authCb: null as ((event: string, session: unknown) => Promise<void>) | null,
  /** partner_links per "<column>=<value>": rows, or a returned error. */
  links: {} as Record<string, LinkRows | "error">,
}));

vi.mock("@/app/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => Promise<void>) => {
        h.authCb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: () => Promise.resolve({ error: null }),
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (column: string, value: string) => {
          const b = h.links[`${column}=${value}`] ?? [];
          const result =
            b === "error"
              ? { data: null, error: { message: "Failed to fetch" } }
              : { data: b, error: null };
          return {
            limit: (n: number) =>
              Promise.resolve(
                result.data ? { data: result.data.slice(0, n), error: null } : result
              ),
            // The pre-P0-06 lookup shape, so the RED run is behavioural.
            maybeSingle: () =>
              Promise.resolve(
                result.data ? { data: result.data[0] ?? null, error: null } : result
              ),
          };
        },
      }),
    }),
  },
}));

vi.mock("@/app/lib/sync", () => ({
  initialSync: vi.fn((_ownerId: string) => Promise.resolve()),
  pushLog: vi.fn((_ownerId: string, _log: DailyLog) => Promise.resolve()),
  subscribeToLogs: vi.fn((_ownerId: string, _onUpdate: () => void) => null),
  unsubscribe: vi.fn(),
  setSyncReadOnly: vi.fn(),
  isSyncReadOnly: vi.fn(() => false),
}));

import App from "@/app/App";

/** Real container; the engine uses NullTransport; reads can be held. */
class TestContainer extends Container {
  holdReads: Promise<void> | null = null;
  failReads = false;
  override startOwnerSync(uid: string): Promise<SyncEngine> {
    return super.startOwnerSync(uid, null);
  }
  override async getAllLogs(): Promise<DailyLog[]> {
    if (this.failReads) throw new Error("IndexedDB failure");
    const read = super.getAllLogs(); // bound to the account active NOW
    if (this.holdReads) await this.holdReads;
    return read;
  }
}

let n = 0;
const fresh = (p: string) => `${p}-${Date.now()}-${n++}`;
const A_DATES = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-29", "2026-06-30"];

async function seedStore(uid: string, dates: string[]) {
  const c = new Container();
  c.setAccount(uid);
  const d = await c.driver();
  for (const date of dates) {
    await d.put("logs", {
      ...emptyLog(date),
      flow: "heavy",
      updatedAt: encodeHlc(0, 0, "dev"),
      deviceId: "dev",
      deleted: false,
    });
  }
  await c.closeDB();
}

const open: TestContainer[] = [];
function renderApp() {
  const c = new TestContainer();
  open.push(c);
  render(
    <ContainerProvider value={c}>
      <App />
    </ContainerProvider>
  );
  return c;
}

async function emit(event: string, uid: string | null) {
  const cb = h.authCb;
  if (!cb) throw new Error("useAuth did not subscribe to auth state");
  await act(async () => {
    await cb(event, uid ? { user: { id: uid, email: `${uid}@example.test` } } : null);
  });
}

async function settle(ms = 30) {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, ms));
  });
}

/** A's tracker is recognisable by its cycle-day header ("Day N of M"). */
const trackerOf = () => screen.queryByText(/Day \d+ of \d+/);
const roleSelect = () => screen.queryByText(/How will you use the app\?/i);

/** A (owner, 5 rows) is signed in and sees their tracker, then signs out. */
async function ownerASignsInAndOut(c: TestContainer) {
  const a = fresh("A");
  await seedStore(a, A_DATES);
  await settle();
  await emit("INITIAL_SESSION", a);
  await waitFor(() => expect(c.syncEngine()).not.toBeNull());
  await waitFor(() => expect(trackerOf()).toBeTruthy());
  await emit("SIGNED_OUT", null);
  await settle();
}

beforeEach(() => {
  h.links = {};
  h.authCb = null;
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open.splice(0)) {
    await c.stopOwnerSync();
    await c.closeDB();
  }
});

describe("account switch: the screen shows the NEW account's own store", () => {
  it("B (no data) signs in after A and B's role lookup FAILS: B sees its own empty store, not A's tracker", async () => {
    const c = renderApp();
    await ownerASignsInAndOut(c);

    const b = fresh("B");
    h.links[`partner_id=${b}`] = "error";
    await emit("SIGNED_IN", b);
    await settle(50);

    expect(await c.getAllLogs()).toHaveLength(0); // B's store really is empty
    expect(trackerOf()).toBeNull();
    expect(roleSelect()).toBeTruthy();
  });

  it("while B's first read is still in flight the splash stays up — A's rows are never shown to B", async () => {
    const c = renderApp();
    await ownerASignsInAndOut(c);

    let release!: () => void;
    c.holdReads = new Promise<void>((r) => {
      release = r;
    });
    const b = fresh("B");
    h.links[`partner_id=${b}`] = "error"; // the lookup fails fast, before the read
    await emit("SIGNED_IN", b);
    await settle(50);

    expect(trackerOf()).toBeNull();
    expect(screen.getByText("Loading...")).toBeTruthy();

    c.holdReads = null;
    await act(async () => {
      release();
    });
    await waitFor(() => expect(roleSelect()).toBeTruthy());
    expect(trackerOf()).toBeNull();
  });

  it("direct A→B switch (cross-tab SIGNED_IN, no sign-out) and B's read FAILS: B never sees A's rows (probe Q9b)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const c = renderApp();
    const a = fresh("A");
    await seedStore(a, A_DATES);
    await settle();
    await emit("INITIAL_SESSION", a);
    await waitFor(() => expect(trackerOf()).toBeTruthy());

    c.failReads = true;
    const b = fresh("B");
    h.links[`partner_id=${b}`] = "error";
    await emit("SIGNED_IN", b);
    await settle(50);

    expect(trackerOf()).toBeNull();
    expect(roleSelect()).toBeTruthy(); // B's (unreadable) store shows as empty
  });
});
