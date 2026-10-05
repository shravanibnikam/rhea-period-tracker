// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { toDateKey } from "@/domain/dates";
import { emptyLog, type DailyLog } from "@/domain/types";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { LogRepository } from "@/data/repositories";
import type { StoredLog } from "@/data/repositories/LogRepository";
import { SyncEngine } from "@/sync/SyncEngine";
import { FakeTransport } from "../../helpers/fakeTransport";

// P0-N2 (port of reviewer probe zzProbePullStale). A sync pull that lands after
// the active log was read must reach the view, and an Overview symptom tap must
// change ONLY that symptom on the STORED row — never rebuild the whole record
// from a stale view and replace the synced row on every device. Real App, real
// owner SyncEngine on this device, a second device ("phone") and an in-memory
// server (FakeTransport) standing in for Supabase.

const h = vi.hoisted(() => ({
  authCb: null as ((event: string, session: unknown) => Promise<void>) | null,
  server: null as unknown,
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

// The app's SupabaseTransport is the shared in-memory server.
vi.mock("@/sync", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    SupabaseTransport: class {
      constructor() {
        return h.server as object;
      }
    },
  };
});

import App from "@/app/App";

const TODAY = toDateKey(new Date());
const REMOTE: DailyLog = {
  ...emptyLog(TODAY),
  flow: "medium",
  notes: "REMOTE-KEEP",
  symptoms: ["Headache"],
};

let open: Container[] = [];
let seq = 0;
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

/** Another device of the same owner, syncing through the same server. */
function phoneFor(uid: string, server: FakeTransport) {
  const driver = new MemoryDriver({ dbName: `rhea-phone-${uid}` });
  const engine = new SyncEngine({
    deviceId: "phone",
    selfPeerId: uid,
    scopes: ["owner"],
    transport: server,
    driver,
  });
  return { engine, repo: new LogRepository(driver, { outbox: engine.outbox }) };
}

/** Write rows into the account's store on a separate connection (no engine, no App refresh). */
async function writeBehindTheView(uid: string, logs: DailyLog[]): Promise<void> {
  const c = new Container();
  c.setAccount(uid);
  for (const log of logs) await c.saveLog(log);
  await c.closeDB();
}

/** Start the App (this device) signed in as `uid`, with its owner engine running. */
async function startLaptop(uid: string): Promise<Container> {
  // Older history, so the owner lands on the tracker rather than RoleSelect.
  await writeBehindTheView(uid, [{ ...emptyLog("2026-06-01"), flow: "heavy" }]);
  const c = new Container();
  open.push(c);
  render(
    <ContainerProvider value={c}>
      <App />
    </ContainerProvider>
  );
  await act(async () => {
    await h.authCb?.("INITIAL_SESSION", { user: { id: uid, email: "owner@example.test" } });
  });
  await screen.findByRole("button", { name: "Log today" });
  await waitFor(() => expect(c.syncEngine()).not.toBeNull());
  return c;
}

function freshServer(): FakeTransport {
  const server = new FakeTransport();
  h.server = server;
  return server;
}

const notesField = () => screen.findByPlaceholderText("How are you feeling today?");

/**
 * Start this device, then wait until the App listens to its engine's status:
 * every status the engine emits runs the App's sync refresh (refreshAfterSync).
 */
async function startLaptopListening(uid: string): Promise<{ c: Container; engine: SyncEngine }> {
  const listen = vi.spyOn(SyncEngine.prototype, "onStatus");
  const c = await startLaptop(uid);
  await waitFor(() => expect(listen.mock.contexts).toContain(c.syncEngine()));
  return { c, engine: c.syncEngine() as SyncEngine };
}

/**
 * Deliver a sync refresh: pull on this device, then wait until the engine has
 * emitted a status since (a pull always ends with one). The App's listener was
 * registered before ours, so by then its sync refresh has run.
 */
async function pullAndRefresh(engine: SyncEngine): Promise<void> {
  let statuses = 0;
  const off = engine.onStatus(() => {
    statuses++;
  });
  try {
    await act(async () => {
      await engine.pull();
    });
    await waitFor(() => expect(statuses).toBeGreaterThan(0));
  } finally {
    off();
  }
}

/**
 * Record the App's reads of today's log (useLogger reads only through
 * getLog), so a test can let the ones it caused settle; `fail` rejects them.
 */
function watchTodayReads(c: Container) {
  const real = c.getLog.bind(c);
  const ctl = {
    fail: false,
    failed: 0,
    reads: [] as Promise<unknown>[],
    /** Let every recorded read settle, and React apply what it led to. */
    settle: () =>
      act(async () => {
        await Promise.allSettled(ctl.reads.splice(0));
      }),
  };
  vi.spyOn(c, "getLog").mockImplementation((date) => {
    if (date !== TODAY) return real(date);
    let read: Promise<DailyLog | undefined>;
    if (ctl.fail) {
      ctl.failed++;
      read = Promise.reject(new Error("read failed"));
    } else {
      read = real(date);
    }
    ctl.reads.push(read);
    return read;
  });
  return ctl;
}

/** Today's stored notes, read past the App (and past any getLog spy). */
async function storedNotes(c: Container): Promise<string | undefined> {
  return (await (await c.driver()).get<StoredLog>("logs", TODAY))?.notes;
}

describe("App: the active log stays in step with synced data (P0-N2)", () => {
  it("after a pull lands, the Overview shows the synced day and a tap keeps it on every device", async () => {
    const uid = `n2-pull-${++seq}-${Date.now()}`;
    const server = freshServer();
    const phone = phoneFor(uid, server);
    await phone.repo.save(REMOTE);
    await phone.engine.flush("manual");

    const c = await startLaptop(uid);
    await waitFor(async () => expect((await c.getLog(TODAY))?.notes).toBe("REMOTE-KEEP"));

    // The Overview shows the pulled day (soft, so the tap below also runs).
    const shown = await waitFor(() => screen.getByText(/1 tracked today/)).then(
      () => true,
      () => false
    );
    expect.soft(shown, "Overview shows the synced symptom").toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cramps" }));
    await waitFor(async () => expect((await c.getLog(TODAY))?.symptoms).toContain("Cramps"));
    const stored = await c.getLog(TODAY);
    expect(stored).toMatchObject({ ...REMOTE, symptoms: ["Headache", "Cramps"] });
    await waitFor(() => expect(screen.getByText(/2 tracked today/)).toBeTruthy());

    // The phone receives the merged row, not an empty one.
    await c.syncEngine()?.flush("manual");
    await phone.engine.pull();
    expect(await phone.repo.get(TODAY)).toMatchObject({
      ...REMOTE,
      symptoms: ["Headache", "Cramps"],
    });
  });

  it("a tap changes only that symptom on the STORED row, even if the view has not caught up yet", async () => {
    const uid = `n2-behind-${++seq}-${Date.now()}`;
    freshServer();
    const c = await startLaptop(uid);
    await screen.findByText(/0 tracked today/);

    // The store changes without the view hearing about it (a pull whose
    // refresh has not run yet): notes plus a symptom the view has never shown.
    await writeBehindTheView(uid, [REMOTE]);

    fireEvent.click(screen.getByRole("button", { name: "Cramps" }));
    await waitFor(async () => expect((await c.getLog(TODAY))?.symptoms).toContain("Cramps"));
    expect(await c.getLog(TODAY)).toMatchObject({ ...REMOTE, symptoms: ["Headache", "Cramps"] });
    // The view now shows the stored record.
    await waitFor(() => expect(screen.getByText(/2 tracked today/)).toBeTruthy());
  });

  it("the Log sheet opened after a later pull shows the synced record", async () => {
    const uid = `n2-sheet-${++seq}-${Date.now()}`;
    const server = freshServer();
    const phone = phoneFor(uid, server);
    const c = await startLaptop(uid);
    await screen.findByText(/0 tracked today/);

    // The phone logs today after this device started; this device pulls it.
    await phone.repo.save(REMOTE);
    await phone.engine.flush("manual");
    await act(async () => {
      await c.syncEngine()?.pull();
    });
    expect((await c.getLog(TODAY))?.notes).toBe("REMOTE-KEEP");

    fireEvent.click(screen.getByRole("button", { name: "Log today" }));
    const notes = (await notesField()) as HTMLTextAreaElement;
    await waitFor(() => expect(notes.value).toBe("REMOTE-KEEP"));
  });

  it("the Log sheet re-reads the day when it opens, even if the view had not caught up", async () => {
    const uid = `n2-open-${++seq}-${Date.now()}`;
    freshServer();
    await startLaptop(uid);
    await screen.findByText(/0 tracked today/);

    await writeBehindTheView(uid, [REMOTE]);
    fireEvent.click(screen.getByRole("button", { name: "Log today" }));
    const notes = (await notesField()) as HTMLTextAreaElement;
    await waitFor(() => expect(notes.value).toBe("REMOTE-KEEP"));
  });

  // Review mutant M4: a sync refresh must not re-read the day while the sheet
  // is open — the re-read would replace what the user is typing.
  it("a pull while the Log sheet is open keeps what the user typed, and Save stores it", async () => {
    const uid = `n2-typing-${++seq}-${Date.now()}`;
    const server = freshServer();
    const phone = phoneFor(uid, server);
    await phone.repo.save(REMOTE);
    await phone.engine.flush("manual");
    const { c, engine } = await startLaptopListening(uid);
    await screen.findByText(/1 tracked today/);
    const reads = watchTodayReads(c);

    fireEvent.click(screen.getByRole("button", { name: "Log today" }));
    const notes = (await notesField()) as HTMLTextAreaElement;
    expect(reads.reads).not.toHaveLength(0); // the sheet re-reads the day when it opens...
    await reads.settle(); // ...and that read has landed, so it cannot replace the typing below
    expect(notes.value).toBe("REMOTE-KEEP");
    fireEvent.change(notes, { target: { value: "TYPED-WHILE-SYNCING" } });

    // The phone edits the day; this device pulls that while the sheet is open.
    await phone.repo.save({ ...REMOTE, notes: "PHONE-LATER" });
    await phone.engine.flush("manual");
    await pullAndRefresh(engine);
    await reads.settle();
    expect(await storedNotes(c)).toBe("PHONE-LATER"); // the pull reached the store

    expect(notes.value).toBe("TYPED-WHILE-SYNCING"); // before Save
    fireEvent.click(screen.getByRole("button", { name: "Save Log" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log your day" })).toBeNull());
    expect(await storedNotes(c)).toBe("TYPED-WHILE-SYNCING");
  });

  // Review mutant M18: a failed re-read after a sync (sheet closed) is a
  // background read of a day already shown — keep it, and report nothing.
  it("a sync refresh whose re-read of the day fails keeps the Overview's day, with no load error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const uid = `n2-bgfail-${++seq}-${Date.now()}`;
    const server = freshServer();
    const phone = phoneFor(uid, server);
    await phone.repo.save(REMOTE);
    await phone.engine.flush("manual");
    const { c, engine } = await startLaptopListening(uid);
    await screen.findByText(/1 tracked today/);
    const reads = watchTodayReads(c);
    reads.fail = true;

    await pullAndRefresh(engine);
    await reads.settle();

    expect(reads.failed).toBeGreaterThan(0); // the refresh did re-read the day, and that read failed
    expect(screen.getByText(/1 tracked today/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
