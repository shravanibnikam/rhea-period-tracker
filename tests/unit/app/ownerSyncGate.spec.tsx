// @vitest-environment jsdom
/**
 * App sync gate (P0-06): nothing syncs until the role is POSITIVELY resolved.
 *
 * The sync effect used to fire as soon as `auth.user` was set — before
 * detectRole had answered — and treated the unknown role as owner. Every
 * partner session therefore started the OWNER engine for a moment, and that
 * engine's initial seed uploads whatever is in the local `logs` store: on a
 * partner / ex-partner device, the owner's rows, under the partner's own id.
 * The legacy (flag-off) path had the same window via initialSync → pushAllLogs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { ContainerProvider } from "@/app/di/context";
import type { Container } from "@/app/di/Container";
import type { DailyLog } from "@/domain/types";
import { emptyLog } from "@/domain/types";

type LinkRows = Array<Record<string, string>>;
type LinkBehaviour = LinkRows | "error" | "hang" | Promise<LinkRows>;
interface LinkResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

const h = vi.hoisted(() => {
  const state = {
    authCb: null as ((event: string, session: unknown) => Promise<void>) | null,
    links: {} as Record<string, LinkBehaviour>,
  };
  const settle = (column: string, shape: (rows: LinkRows) => LinkResult) => {
    const b = state.links[column] ?? [];
    if (b === "hang") return new Promise<LinkResult>(() => {});
    if (b === "error") {
      return Promise.resolve<LinkResult>({ data: null, error: { message: "permission denied" } });
    }
    return Promise.resolve(b).then(shape);
  };
  const query = (column: string) => ({
    // Emulates postgrest-js: >1 row is a RETURNED error (PGRST116), not a throw.
    maybeSingle: () =>
      settle(column, (rows) =>
        rows.length > 1
          ? { data: null, error: { code: "PGRST116", message: "multiple (or no) rows returned" } }
          : { data: rows[0] ?? null, error: null }
      ),
    limit: (n: number) => settle(column, (rows) => ({ data: rows.slice(0, n), error: null })),
  });
  return { state, query };
});

vi.mock("@/app/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => Promise<void>) => {
        h.state.authCb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: () => Promise.resolve({ error: null }),
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (column: string, _value: string) => h.query(column),
      }),
    }),
  },
}));

// The legacy direct-sync functions are the observable side effects here.
vi.mock("@/app/lib/sync", () => ({
  initialSync: vi.fn((_ownerId: string) => Promise.resolve()),
  pushLog: vi.fn((_ownerId: string, _log: DailyLog) => Promise.resolve()),
  subscribeToLogs: vi.fn((_ownerId: string, _onUpdate: () => void) => null),
  unsubscribe: vi.fn(),
  setSyncReadOnly: vi.fn(),
  isSyncReadOnly: vi.fn(() => false),
}));

// PartnerView loads share settings over the network; keep it offline.
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
import { initialSync, pushLog, subscribeToLogs } from "@/app/lib/sync";
import { flags } from "@/app/lib/flags";

/** A device that already holds rows — on a partner device, the owner's. */
const CACHED: DailyLog[] = [{ ...emptyLog("2026-09-01"), flow: "medium" }];

function fakeContainer() {
  const engine = { onStatus: vi.fn((_cb: () => void) => () => {}) };
  return {
    setAccount: vi.fn(),
    setOwnerSyncMode: vi.fn((_enabled: boolean) => {}),
    startOwnerSync: vi.fn((_uid: string, _client: unknown) => Promise.resolve(engine)),
    stopOwnerSync: vi.fn(() => Promise.resolve()),
    getAllLogs: vi.fn(() => Promise.resolve(CACHED)),
    getMeta: vi.fn((_key: string) => Promise.resolve(undefined)),
    setMeta: vi.fn((_key: string, _value: unknown) => Promise.resolve()),
    getLog: vi.fn((_date: string) => Promise.resolve(undefined)),
    saveLog: vi.fn((_log: DailyLog) => Promise.resolve()),
    deleteLog: vi.fn((_date: string) => Promise.resolve()),
    wipeLocalData: vi.fn(() => Promise.resolve()),
  };
}
type FakeContainer = ReturnType<typeof fakeContainer>;

let c: FakeContainer;
const syncEngineFlag = flags.syncEngine;

function renderApp() {
  render(
    <ContainerProvider value={c as unknown as Container}>
      <App />
    </ContainerProvider>
  );
}

function emitSignIn(uid: string): Promise<void> {
  const cb = h.state.authCb;
  if (!cb) throw new Error("useAuth did not subscribe to auth state");
  return cb("SIGNED_IN", { user: { id: uid, email: `${uid}@example.test` } });
}

/** Sign in and let detectRole finish. */
async function signIn(uid: string) {
  await act(async () => {
    await emitSignIn(uid);
  });
}

/** Sign in WITHOUT waiting — the role lookup stays in flight. */
function beginSignIn(uid: string) {
  act(() => {
    void emitSignIn(uid);
  });
}

/** Let pending promise continuations (effects, async IIFEs) run. */
async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

/** Save today's log through the real DailyLogSheet → useLogger → onSaved path. */
async function saveTodayViaSheet() {
  fireEvent.click(await screen.findByRole("button", { name: "Log today" }));
  fireEvent.click(await screen.findByRole("button", { name: /save log/i }));
  await waitFor(() => expect(c.saveLog).toHaveBeenCalled());
  await settle();
}

/** No owner engine, no durable-outbox mode, no legacy pull/subscribe/push. */
function expectNoSyncCapability() {
  expect(c.startOwnerSync).not.toHaveBeenCalled();
  expect(c.setOwnerSyncMode).not.toHaveBeenCalledWith(true);
  expect(initialSync).not.toHaveBeenCalled();
  expect(subscribeToLogs).not.toHaveBeenCalled();
  expect(pushLog).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.links = {};
  h.state.authCb = null;
  flags.syncEngine = true;
  c = fakeContainer();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  flags.syncEngine = syncEngineFlag;
});

describe("role unresolved → no sync of any kind", () => {
  it("lookup never resolves: no owner engine or outbox mode — before OR after the loading timeout — and a save is not pushed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.state.links.partner_id = "hang";
    renderApp();
    beginSignIn("u1");
    await act(async () => {
      await Promise.resolve();
    });

    expectNoSyncCapability();
    expect(c.setOwnerSyncMode).toHaveBeenCalledWith(false);

    // useAuth's splash bound ends `loading` with the role still unknown.
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    vi.useRealTimers();
    await saveTodayViaSheet();

    expectNoSyncCapability();
  });

  it("lookup fails: no owner engine, no legacy sync, and a save is not pushed", async () => {
    h.state.links.partner_id = "error";
    renderApp();
    await signIn("u1");
    await settle();

    expectNoSyncCapability();
    await saveTodayViaSheet();
    expectNoSyncCapability();
  });

  it("legacy mode (engine flag off): no pull/push-all of the local store and no push while unresolved", async () => {
    flags.syncEngine = false;
    h.state.links.partner_id = "error";
    renderApp();
    await signIn("u1");
    await settle();

    expectNoSyncCapability();
    await saveTodayViaSheet();
    expectNoSyncCapability();
  });
});

describe("interactive sign-in shows the splash until the role resolves", () => {
  it("SIGNED_IN after INITIAL_SESSION: no tracker (no way to save) until the lookup answers", async () => {
    let resolveLink!: (rows: LinkRows) => void;
    h.state.links.partner_id = new Promise<LinkRows>((resolve) => {
      resolveLink = resolve;
    });
    renderApp();
    const cb = h.state.authCb;
    if (!cb) throw new Error("useAuth did not subscribe to auth state");
    await act(async () => {
      await cb("INITIAL_SESSION", null);
    });
    await settle();

    beginSignIn("owner-1");
    await settle();

    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Log today" })).toBeNull();

    await act(async () => {
      resolveLink([]);
    });
    expect(await screen.findByRole("button", { name: "Log today" })).toBeTruthy();
    await waitFor(() => expect(c.startOwnerSync).toHaveBeenCalledTimes(1));
  });
});

describe("partner sessions never start the owner engine", () => {
  it("not in the pre-resolution window, not after: only the read-only pull of the linked owner", async () => {
    let resolveLink!: (rows: LinkRows) => void;
    h.state.links.partner_id = new Promise<LinkRows>((resolve) => {
      resolveLink = resolve;
    });
    renderApp();
    beginSignIn("partner-1");
    await act(async () => {
      await Promise.resolve();
    });

    // Pre-resolution window: the user is set, the role is not.
    expectNoSyncCapability();

    await act(async () => {
      resolveLink([{ owner_id: "owner-1" }]);
    });
    await waitFor(() => expect(initialSync).toHaveBeenCalledWith("owner-1"));

    expect(subscribeToLogs).toHaveBeenCalledWith("owner-1", expect.any(Function));
    expect(initialSync).not.toHaveBeenCalledWith("partner-1");
    expect(c.startOwnerSync).not.toHaveBeenCalled();
    expect(c.setOwnerSyncMode).not.toHaveBeenCalledWith(true);
    expect(c.setMeta).toHaveBeenCalledWith("lastKnownRole", "partner");
  });

  it("a multi-linked partner (ambiguous owner) runs no owner engine and never pulls under its own id", async () => {
    h.state.links.partner_id = [{ owner_id: "o1" }, { owner_id: "o2" }];
    renderApp();
    await signIn("partner-1");
    await settle();

    expectNoSyncCapability();
  });
});

describe("resolved owner (controls: the gate opens once the role is known)", () => {
  it("starts the owner engine exactly once, only after resolution", async () => {
    let resolveLink!: (rows: LinkRows) => void;
    h.state.links.partner_id = new Promise<LinkRows>((resolve) => {
      resolveLink = resolve;
    });
    h.state.links.owner_id = [];
    renderApp();
    beginSignIn("owner-1");
    await act(async () => {
      await Promise.resolve();
    });
    expect(c.startOwnerSync).not.toHaveBeenCalled();

    await act(async () => {
      resolveLink([]);
    });
    await waitFor(() => expect(c.startOwnerSync).toHaveBeenCalledTimes(1));

    expect(c.startOwnerSync.mock.calls[0][0]).toBe("owner-1");
    expect(c.setOwnerSyncMode).toHaveBeenLastCalledWith(true);
    expect(initialSync).not.toHaveBeenCalled();
  });

  it("a failed re-check of the same owner (tab refocus re-emits SIGNED_IN) never leaves owner-engine mode", async () => {
    renderApp();
    await signIn("owner-1");
    await waitFor(() => expect(c.startOwnerSync).toHaveBeenCalledTimes(1));
    c.setOwnerSyncMode.mockClear();

    h.state.links.partner_id = "error";
    await signIn("owner-1"); // supabase-js re-emits SIGNED_IN from storage on refocus
    await settle();

    expect(c.setOwnerSyncMode).not.toHaveBeenCalledWith(false);
    // The engine is running at the end: the last start follows the last stop.
    const lastStart = Math.max(...c.startOwnerSync.mock.invocationCallOrder);
    const lastStop = Math.max(0, ...c.stopOwnerSync.mock.invocationCallOrder);
    expect(lastStart).toBeGreaterThan(lastStop);
  });

  it("legacy mode: an owner pulls its own id and pushes saves directly", async () => {
    flags.syncEngine = false;
    renderApp();
    await signIn("owner-1");
    await waitFor(() => expect(initialSync).toHaveBeenCalledWith("owner-1"));

    await saveTodayViaSheet();

    expect(pushLog).toHaveBeenCalledWith("owner-1", expect.objectContaining({ date: expect.any(String) }));
    expect(c.startOwnerSync).not.toHaveBeenCalled();
    expect(c.setOwnerSyncMode).not.toHaveBeenCalledWith(true);
  });
});
