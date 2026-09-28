// @vitest-environment jsdom
/**
 * Saves made while the role is unresolved (P0-06 review, probe P5).
 *
 * auth-js keeps a valid session offline, so "open the app on the subway, log,
 * come back online" is common: the role lookup fails, the user logs, and the
 * role resolves later. Two decisions are kept apart:
 *   - QUEUE: the write goes to the durable outbox (local only) while the role
 *     is owner OR unresolved;
 *   - PUSH: only the owner engine delivers it, and it starts only after a
 *     POSITIVE owner answer.
 * A POSITIVE partner answer drops what was queued: those entries are edits to
 * the owner's cached rows and must never be uploaded (e.g. after an unlink).
 * Real Container over fake-indexeddb; the engine's NullTransport push is spied.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { ContainerProvider } from "@/app/di/context";
import { Container } from "@/app/di/Container";
import { NullTransport, type SyncEngine, type OutboxEntry } from "@/sync";
import type { SyncRecord } from "@/data/envelope";
import { logKey } from "@/data/envelope";
import { emptyLog, type DailyLog } from "@/domain/types";
import { toDateKey } from "@/domain/dates";
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

vi.mock("@/app/lib/sharing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/sharing")>();
  return {
    ...actual,
    getShareSettings: vi.fn(() => Promise.resolve(null)),
    getQuietWindows: vi.fn(() => Promise.resolve([])),
    getSharedNotes: vi.fn(() => Promise.resolve([])),
  };
});

import App from "@/app/App";

/** Real container; the owner engine uses NullTransport (push is spied). */
class TestContainer extends Container {
  override startOwnerSync(uid: string): Promise<SyncEngine> {
    return super.startOwnerSync(uid, null);
  }
}

let n = 0;
const fresh = (p: string) => `${p}-${Date.now()}-${n++}`;
const TODAY_KEY = logKey(toDateKey(new Date()));

async function seedStore(uid: string) {
  const c = new Container();
  c.setAccount(uid);
  const d = await c.driver();
  await d.put("logs", {
    ...emptyLog("2026-06-01"),
    flow: "heavy",
    updatedAt: encodeHlc(0, 0, "dev"),
    deviceId: "dev",
    deleted: false,
  });
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

async function emit(event: string, uid: string) {
  const cb = h.authCb;
  if (!cb) throw new Error("useAuth did not subscribe to auth state");
  await act(async () => {
    await cb(event, { user: { id: uid, email: `${uid}@example.test` } });
  });
}

async function settle(ms = 30) {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, ms));
  });
}

/** Every record key the owner engine handed to its transport. */
const pushed: string[] = [];
function pushedKeys(): string[] {
  return [...pushed];
}
async function outboxKeys(c: Container): Promise<string[]> {
  return (await (await c.driver()).getAll<OutboxEntry>("outbox")).map((e) => e.record.key);
}

/** Offline cold start: a stored session, the role lookup fails; the user logs today. */
async function offlineStartAndSaveToday(uid: string) {
  await seedStore(uid);
  h.links[`partner_id=${uid}`] = "error";
  const c = renderApp();
  await settle();
  await emit("INITIAL_SESSION", uid);
  await settle(50);
  fireEvent.click(await screen.findByRole("button", { name: "Log today" }));
  fireEvent.click(await screen.findByRole("button", { name: /save log/i }));
  await waitFor(async () =>
    expect((await c.getAllLogs()).map((l) => l.date)).toContain(toDateKey(new Date()))
  );
  await settle(50);
  return c;
}

beforeEach(() => {
  h.links = {};
  h.authCb = null;
  pushed.length = 0;
  const realPush = NullTransport.prototype.push;
  vi.spyOn(NullTransport.prototype, "push").mockImplementation(function (
    this: NullTransport,
    rows: SyncRecord[],
    ctx
  ) {
    pushed.push(...rows.map((r) => r.key));
    return realPush.call(this, rows, ctx);
  });
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open.splice(0)) {
    await c.stopOwnerSync();
    await c.closeDB();
  }
});

describe("a save made while the role is unresolved", () => {
  it("is queued, and PUSHED once the owner is confirmed (offline start → back online)", async () => {
    const uid = fresh("owner");
    const c = await offlineStartAndSaveToday(uid);
    expect(pushedKeys()).toEqual([]); // nothing left the device while unresolved

    h.links[`partner_id=${uid}`] = []; // back online: the lookup answers "owner"
    await emit("SIGNED_IN", uid); // supabase-js re-emits on refocus
    await waitFor(() => expect(c.syncEngine()).not.toBeNull());
    await waitFor(() => expect(pushedKeys()).toContain(TODAY_KEY));
    await waitFor(async () => expect(await outboxKeys(c)).toEqual([]));
  });

  it("is kept queued — and never pushed — while the lookup keeps failing", async () => {
    const uid = fresh("offline");
    const c = await offlineStartAndSaveToday(uid);

    await emit("SIGNED_IN", uid); // refocus, still offline
    await emit("TOKEN_REFRESHED", uid);
    await settle(50);

    expect(c.syncEngine()).toBeNull();
    expect(pushedKeys()).toEqual([]);
    expect(await outboxKeys(c)).toEqual([TODAY_KEY]);
  });

  it("is dropped when the account resolves as a PARTNER, and never pushed — not even after a later unlink", async () => {
    const uid = fresh("partner");
    const c = await offlineStartAndSaveToday(uid);
    expect(await outboxKeys(c)).toEqual([TODAY_KEY]);

    h.links[`partner_id=${uid}`] = [{ owner_id: "owner-1" }];
    await emit("SIGNED_IN", uid);
    await waitFor(async () => expect(await outboxKeys(c)).toEqual([]));
    expect(c.syncEngine()).toBeNull();

    // The owner unlinks; this account now resolves as an owner and starts the engine.
    h.links[`partner_id=${uid}`] = [];
    await emit("SIGNED_IN", uid);
    await waitFor(() => expect(c.syncEngine()).not.toBeNull());
    await settle(80);

    expect(pushedKeys()).toEqual([]);
  });
});
