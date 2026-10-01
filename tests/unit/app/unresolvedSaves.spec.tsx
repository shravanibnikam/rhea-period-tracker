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
 *
 * Every save here first waits for the day's stored record to load in the sheet,
 * then edits it, and the test asserts the edit WAS stored. useLogger refuses a
 * whole-record save while the day's read is pending ("still loading"), and a
 * refused save would make "nothing queued / nothing pushed" pass vacuously.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup, within } from "@testing-library/react";
import { ContainerProvider } from "@/app/di/context";
import { Container } from "@/app/di/Container";
import { NullTransport, type SyncEngine, type OutboxEntry } from "@/sync";
import type { SyncRecord } from "@/data/envelope";
import { logKey, openPlain } from "@/data/envelope";
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
const TODAY = toDateKey(new Date());
const TODAY_KEY = logKey(TODAY);
/** Today's stored note — its appearance in the sheet proves the day's read landed. */
const TODAY_NOTE = "today, before the edit";
const TODAY_EDIT = "today, edited offline";

async function seedStore(
  uid: string,
  rows: Array<Partial<DailyLog> & { date: string }> = [{ date: "2026-06-01", flow: "heavy" }],
  meta: Record<string, unknown> = {}
) {
  const c = new Container();
  c.setAccount(uid);
  const d = await c.driver();
  for (const row of rows) {
    await d.put("logs", {
      ...emptyLog(row.date),
      ...row,
      updatedAt: encodeHlc(0, 0, "dev"),
      deviceId: "dev",
      deleted: false,
    });
  }
  for (const [key, value] of Object.entries(meta)) await d.put("meta", value, key);
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

/** Every record the owner engine handed to its transport: key + opened payload. */
const pushed: Array<{ key: string; payload: string }> = [];
function pushedKeys(): string[] {
  return pushed.map((p) => p.key);
}
async function outboxKeys(c: Container): Promise<string[]> {
  return (await (await c.driver()).getAll<OutboxEntry>("outbox")).map((e) => e.record.key);
}

/**
 * In the open log sheet: wait until the day's STORED record has loaded (its
 * note shows), replace the note, save, and wait for the sheet to close — it
 * closes only once the save has persisted, so a refused ("still loading") or
 * failed save fails here instead of passing vacuously.
 */
async function editLoadedDayAndSave(loadedNote: string, newNote: string) {
  const notes = (await screen.findByPlaceholderText(
    "How are you feeling today?"
  )) as HTMLTextAreaElement;
  await waitFor(() => expect(notes.value).toBe(loadedNote));
  fireEvent.change(notes, { target: { value: newNote } });
  fireEvent.click(screen.getByRole("button", { name: /save log/i }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log your day" })).toBeNull());
  expect(screen.queryByText(/still loading/i)).toBeNull();
  await settle(50);
}

/**
 * The calendar cell for `date`. Scoped to the day grid under the weekday header,
 * so no other button with the same number can match; the grid shows only the
 * displayed month's own days, so the number is unique there.
 */
function calendarDayButton(date: Date): HTMLElement {
  const grid = screen.getByText("Su").parentElement?.nextElementSibling;
  if (!(grid instanceof HTMLElement)) throw new Error("calendar day grid not found");
  return within(grid).getByRole("button", { name: String(date.getDate()) });
}

/** Offline cold start: a stored session, the role lookup fails; the user edits today. */
async function offlineStartAndSaveToday(uid: string) {
  await seedStore(uid, [
    { date: "2026-06-01", flow: "heavy" },
    { date: TODAY, flow: "light", notes: TODAY_NOTE },
  ]);
  h.links[`partner_id=${uid}`] = "error";
  const c = renderApp();
  await settle();
  await emit("INITIAL_SESSION", uid);
  await settle(50);
  fireEvent.click(await screen.findByRole("button", { name: "Log today" }));
  await editLoadedDayAndSave(TODAY_NOTE, TODAY_EDIT);
  // The save really happened: the stored row carries the edit.
  expect((await c.getLog(TODAY))?.notes).toBe(TODAY_EDIT);
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
    for (const r of rows) {
      pushed.push({ key: r.key, payload: r.payload ? JSON.stringify(openPlain(r.payload)) : "" });
    }
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

describe("a store that has served a partner session (lastKnownRole=partner)", () => {
  const OWNER_NOTE = "OWNER-PRIVATE-NOTE";

  it("an unresolved role never queues an edit of the owner's cached row, so a later owner answer uploads nothing (probe Q2b)", async () => {
    const uid = fresh("expartner");
    // The owner's cached row sits on TODAY: the only date that is never in the
    // future and always in the month the calendar opens on, whatever the date
    // (a fixed day number is in the future on the 1st, and yesterday is in the
    // previous month then).
    const now = new Date();
    const cachedDate = toDateKey(now);
    await seedStore(uid, [{ date: cachedDate, flow: "heavy", notes: OWNER_NOTE }], {
      lastKnownRole: "partner",
    });
    h.links[`partner_id=${uid}`] = "error"; // offline start: role unresolved
    const c = renderApp();
    await settle();
    await emit("INITIAL_SESSION", uid);
    await settle(50);

    // Open the owner's cached day from the calendar, wait for her row to load,
    // edit it (keeping her note in the text) and save.
    const edited = `${OWNER_NOTE} (edited offline)`;
    fireEvent.click(await screen.findByRole("tab", { name: /calendar/i }));
    fireEvent.click(calendarDayButton(now));
    await editLoadedDayAndSave(OWNER_NOTE, edited);

    // The edit WAS stored locally (not refused) — and nothing was queued.
    expect((await c.getLog(cachedDate))?.notes).toBe(edited);
    expect(await outboxKeys(c)).toEqual([]);

    // The owner unlinks him; the next lookup answers "owner" and starts the engine.
    h.links[`partner_id=${uid}`] = [];
    await emit("SIGNED_IN", uid);
    await waitFor(() => expect(c.syncEngine()).not.toBeNull());
    await settle(80);

    expect(pushedKeys()).toEqual([]);
    expect(pushed.some((p) => p.payload.includes(OWNER_NOTE))).toBe(false);
  });
});
