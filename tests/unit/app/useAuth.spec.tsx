// @vitest-environment jsdom
/**
 * useAuth role resolution fails CLOSED (P0-06).
 *
 * The role decides who may write: an owner pushes, a partner is read-only. The
 * old detectRole defaulted to "owner" whenever the partner_links lookup failed —
 * and PostgREST RETURNS errors (network, RLS, multi-row `.maybeSingle()`)
 * instead of throwing, so an error read as "no link" → owner. On a partner or
 * ex-partner device that grants write capability over the OWNER's cached rows.
 * An unknown role must grant nothing: role null, sync read-only, no engine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { ContainerProvider } from "@/app/di/context";
import type { Container } from "@/app/di/Container";

type LinkRows = Array<Record<string, string>>;
/** How the partner_links lookup for one filter behaves. */
type LinkBehaviour = LinkRows | "error" | "throw" | "hang" | Promise<LinkRows>;
interface LinkResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

const h = vi.hoisted(() => {
  const state = {
    authCb: null as ((event: string, session: unknown) => Promise<void>) | null,
    /** Keyed "<column>=<value>" (per user) or "<column>" (any user). */
    links: {} as Record<string, LinkBehaviour>,
  };
  const settle = (key: string, fallback: string, shape: (rows: LinkRows) => LinkResult) => {
    const b = state.links[key] ?? state.links[fallback] ?? [];
    if (b === "hang") return new Promise<LinkResult>(() => {});
    if (b === "throw") return Promise.reject(new Error("network down"));
    if (b === "error") {
      // PostgREST resolves with an error; it does not throw.
      return Promise.resolve<LinkResult>({
        data: null,
        error: { message: "permission denied", code: "42501" },
      });
    }
    return Promise.resolve(b).then(shape);
  };
  const query = (column: string, value: string) => ({
    // Emulates postgrest-js: >1 row is a RETURNED error (PGRST116), not a throw.
    maybeSingle: () =>
      settle(`${column}=${value}`, column, (rows) =>
        rows.length > 1
          ? { data: null, error: { code: "PGRST116", message: "multiple (or no) rows returned" } }
          : { data: rows[0] ?? null, error: null }
      ),
    limit: (n: number) =>
      settle(`${column}=${value}`, column, (rows) => ({ data: rows.slice(0, n), error: null })),
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
        eq: (column: string, value: string) => h.query(column, value),
      }),
    }),
  },
}));

import { useAuth } from "@/app/hooks/useAuth";
import { isOwnerEngineSync } from "@/app/lib/flags";
import { isSyncReadOnly, setSyncReadOnly } from "@/app/lib/sync";

function fakeContainer() {
  return {
    setAccount: vi.fn(),
    setMeta: vi.fn((_key: string, _value: unknown) => Promise.resolve()),
    wipeLocalData: vi.fn(() => Promise.resolve()),
  };
}
type FakeContainer = ReturnType<typeof fakeContainer>;

let fake: FakeContainer;

/** Every `loading` value the hook rendered with, in order. */
let loadingSeen: boolean[] = [];

function renderAuth() {
  const value = fake as unknown as Container;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ContainerProvider, { value }, children);
  return renderHook(
    () => {
      const auth = useAuth();
      loadingSeen.push(auth.loading);
      return auth;
    },
    { wrapper }
  );
}

/**
 * Fire an auth event. Every event carries a NEW session/user object, as
 * supabase-js does — including the SIGNED_IN it re-emits from storage (no
 * network) on each hidden→visible tab transition, and TOKEN_REFRESHED.
 */
function emitAuth(uid: string | null, event = uid ? "SIGNED_IN" : "SIGNED_OUT"): Promise<void> {
  const cb = h.state.authCb;
  if (!cb) throw new Error("useAuth did not subscribe to auth state");
  return cb(event, uid ? { user: { id: uid } } : null);
}

/** Sign in (or re-emit for the same account) and wait for detectRole to finish. */
async function signIn(uid: string, event = "SIGNED_IN") {
  await act(async () => {
    await emitAuth(uid, event);
  });
}

/** Sign in WITHOUT waiting — the role lookup stays in flight. */
function beginSignIn(uid: string, event = "SIGNED_IN"): Promise<void> {
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = emitAuth(uid, event);
  });
  return pending;
}

/** What the session is allowed to do, in one comparable object. */
function capability(role: "owner" | "partner" | null) {
  return {
    role,
    ownerEngine: isOwnerEngineSync(true, role),
    readOnly: isSyncReadOnly(),
  };
}

const CLOSED = { role: null, ownerEngine: false, readOnly: true };

beforeEach(() => {
  h.state.links = {};
  h.state.authCb = null;
  loadingSeen = [];
  fake = fakeContainer();
  // The legacy write guard's module default: writes allowed. A fail-open
  // detectRole leaves it there.
  setSyncReadOnly(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("detectRole fails closed", () => {
  it("a THROWN partner lookup yields role null and no write capability", async () => {
    h.state.links.partner_id = "throw";
    const { result } = renderAuth();
    await signIn("u1");

    expect(result.current.loading).toBe(false);
    expect(capability(result.current.role)).toEqual(CLOSED);
    expect(result.current.linkedOwnerId).toBeNull();
    expect(result.current.hasPartnerLinked).toBe(false);
  });

  it("a RETURNED partner-lookup error (PostgREST does not throw) yields role null and no write capability", async () => {
    h.state.links.partner_id = "error";
    const { result } = renderAuth();
    await signIn("u1");

    expect(result.current.loading).toBe(false);
    expect(capability(result.current.role)).toEqual(CLOSED);
    expect(result.current.linkedOwnerId).toBeNull();
    expect(result.current.hasPartnerLinked).toBe(false);
  });

  it("a returned error on the owner lookup also fails closed", async () => {
    h.state.links.partner_id = [];
    h.state.links.owner_id = "error";
    const { result } = renderAuth();
    await signIn("u1");

    expect(capability(result.current.role)).toEqual(CLOSED);
    expect(result.current.hasPartnerLinked).toBe(false);
  });

  it("grants no write capability while the lookup is still in flight", () => {
    h.state.links.partner_id = "hang";
    const { result } = renderAuth();
    void beginSignIn("u1");

    expect(result.current.user?.id).toBe("u1");
    expect(result.current.loading).toBe(true);
    expect(capability(result.current.role)).toEqual(CLOSED);
  });

  it("a new account never inherits the previous account's resolved role", async () => {
    const { result } = renderAuth();
    await signIn("owner-a"); // no links → owner
    expect(result.current.role).toBe("owner");

    h.state.links["partner_id=partner-b"] = "hang";
    void beginSignIn("partner-b");

    expect(result.current.user?.id).toBe("partner-b");
    expect(capability(result.current.role)).toEqual(CLOSED);
  });

  it("a stale lookup for a previous account cannot overwrite the current account's role", async () => {
    let releaseA!: (rows: LinkRows) => void;
    h.state.links["partner_id=user-a"] = new Promise<LinkRows>((resolve) => {
      releaseA = resolve;
    });
    h.state.links["partner_id=user-b"] = [{ owner_id: "owner-9" }];
    const { result } = renderAuth();

    const staleA = beginSignIn("user-a"); // lookup for A stays in flight
    await signIn("user-b"); // B resolves as a partner
    expect(result.current.role).toBe("partner");

    // A's lookup now resolves as "no link" (→ owner) — but A is no longer here.
    await act(async () => {
      releaseA([]);
      await staleA;
    });

    expect(result.current.user?.id).toBe("user-b");
    expect(result.current.role).toBe("partner");
    expect(result.current.linkedOwnerId).toBe("owner-9");
    expect(isSyncReadOnly()).toBe(true);
  });
});

describe("re-checks of an already-resolved account (same uid)", () => {
  // supabase-js re-emits SIGNED_IN from storage on every tab refocus and emits
  // TOKEN_REFRESHED hourly; each runs detectRole again. Offline or on a flaky
  // connection that lookup fails. A failed RE-CHECK must not revoke a role that
  // was positively resolved for this same account: revoking it stops the owner
  // engine (every later save is stored but never queued) and drops a partner
  // into the owner UI and out of the sign-out wipe.
  for (const event of ["SIGNED_IN", "TOKEN_REFRESHED"]) {
    it(`a failed ${event} re-check keeps a resolved owner (engine mode, not read-only)`, async () => {
      const { result } = renderAuth();
      await signIn("owner-1");
      expect(result.current.role).toBe("owner");

      h.state.links.partner_id = "error";
      await signIn("owner-1", event);

      expect(capability(result.current.role)).toEqual({
        role: "owner",
        ownerEngine: true,
        readOnly: false,
      });
    });
  }

  it("a thrown re-check keeps a resolved owner too", async () => {
    const { result } = renderAuth();
    await signIn("owner-1");

    h.state.links.partner_id = "throw";
    await signIn("owner-1", "TOKEN_REFRESHED");

    expect(capability(result.current.role)).toEqual({
      role: "owner",
      ownerEngine: true,
      readOnly: false,
    });
  });

  it("a same-uid re-check in flight does not drop a resolved owner's write capability", async () => {
    const { result } = renderAuth();
    await signIn("owner-1");

    h.state.links.partner_id = "hang";
    void beginSignIn("owner-1");

    expect(capability(result.current.role)).toEqual({
      role: "owner",
      ownerEngine: true,
      readOnly: false,
    });
  });

  it("a failed re-check keeps a resolved partner read-only, and sign-out still wipes", async () => {
    h.state.links.partner_id = [{ owner_id: "owner-1" }];
    const { result } = renderAuth();
    await signIn("partner-1");
    expect(result.current.role).toBe("partner");

    h.state.links.partner_id = "error";
    await signIn("partner-1");

    expect(capability(result.current.role)).toEqual({
      role: "partner",
      ownerEngine: false,
      readOnly: true,
    });
    expect(result.current.linkedOwnerId).toBe("owner-1");

    await act(async () => {
      await result.current.signOut();
    });
    expect(fake.wipeLocalData).toHaveBeenCalledTimes(1);
  });

  it("a POSITIVE contrary answer on re-check still downgrades owner → partner", async () => {
    const { result } = renderAuth();
    await signIn("u1");
    expect(result.current.role).toBe("owner");

    h.state.links.partner_id = [{ owner_id: "owner-9" }];
    await act(async () => {
      await result.current.refreshRole();
    });

    expect(capability(result.current.role)).toEqual({
      role: "partner",
      ownerEngine: false,
      readOnly: true,
    });
    expect(result.current.linkedOwnerId).toBe("owner-9");
  });
});

describe("splash (loading) while a NEW account's role is unknown", () => {
  // An interactive sign-in arrives as SIGNED_IN after INITIAL_SESSION already
  // ended `loading`. Without a splash the app renders with role null for the
  // whole lookup, and anything saved in that window is stored but never queued.
  it("an interactive sign-in holds loading until the new account's role resolves", async () => {
    const { result } = renderAuth();
    await act(async () => {
      await emitAuth(null, "INITIAL_SESSION"); // signed out → AuthScreen
    });
    expect(result.current.loading).toBe(false);

    let release!: (rows: LinkRows) => void;
    h.state.links.partner_id = new Promise<LinkRows>((resolve) => {
      release = resolve;
    });
    const pending = beginSignIn("u1");

    expect(result.current.user?.id).toBe("u1");
    expect(result.current.loading).toBe(true);

    await act(async () => {
      release([]);
      await pending;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.role).toBe("owner");
  });

  it("a failed first lookup ends the splash with the role closed", async () => {
    const { result } = renderAuth();
    await act(async () => {
      await emitAuth(null, "INITIAL_SESSION");
    });
    h.state.links.partner_id = "error";
    await signIn("u1");

    expect(result.current.loading).toBe(false);
    expect(capability(result.current.role)).toEqual(CLOSED);
  });

  for (const event of ["INITIAL_SESSION", "SIGNED_IN"]) {
    it(`a hung first lookup (${event}) cannot hold the splash forever — but it outlasts postgrest's ~7 s retry backoff`, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { result } = renderAuth();
      if (event === "SIGNED_IN") {
        await act(async () => {
          await emitAuth(null, "INITIAL_SESSION");
        });
      }
      h.state.links.partner_id = "hang";
      void beginSignIn("u1", event);
      expect(result.current.loading).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(7_000); // postgrest backoff 1 s + 2 s + 4 s
      });
      expect(result.current.loading).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(8_000);
      });
      expect(result.current.loading).toBe(false);
      expect(capability(result.current.role)).toEqual(CLOSED);
    });
  }

  it("same-uid re-checks never toggle loading (no splash flash on every refocus)", async () => {
    const { result } = renderAuth();
    await signIn("owner-1");
    expect(result.current.loading).toBe(false);

    loadingSeen = [];
    h.state.links.partner_id = "hang";
    void beginSignIn("owner-1"); // refocus re-emit
    h.state.links.partner_id = "error";
    await signIn("owner-1", "TOKEN_REFRESHED");

    expect(loadingSeen.length).toBeGreaterThan(0);
    expect(loadingSeen).not.toContain(true);
  });

  it("owner U signs out and signs in again as U: that first lookup is splashed again", async () => {
    const { result } = renderAuth();
    await signIn("owner-1");
    expect(result.current.role).toBe("owner");

    await act(async () => {
      await emitAuth(null, "SIGNED_OUT");
    });
    expect(result.current.loading).toBe(false);

    h.state.links.partner_id = "hang";
    void beginSignIn("owner-1");

    expect(result.current.loading).toBe(true);
    expect(capability(result.current.role)).toEqual(CLOSED);
  });

  it("an account whose first lookup failed is not re-splashed on each re-check", async () => {
    h.state.links.partner_id = "error";
    const { result } = renderAuth();
    await signIn("u1");
    expect(result.current.loading).toBe(false);

    loadingSeen = [];
    h.state.links.partner_id = "hang";
    void beginSignIn("u1");

    expect(loadingSeen).not.toContain(true);
    expect(capability(result.current.role)).toEqual(CLOSED);
  });
});

describe("resolved roles", () => {
  it("an owner (no links) gets owner capability — the gate is not over-closed", async () => {
    const { result } = renderAuth();
    await signIn("u1");

    expect(capability(result.current.role)).toEqual({
      role: "owner",
      ownerEngine: true,
      readOnly: false,
    });
    expect(result.current.hasPartnerLinked).toBe(false);
  });

  it("a single partner link → read-only partner of that owner, and lastKnownRole=partner is persisted", async () => {
    h.state.links.partner_id = [{ owner_id: "owner-1" }];
    const { result } = renderAuth();
    await signIn("u1");

    expect(capability(result.current.role)).toEqual({
      role: "partner",
      ownerEngine: false,
      readOnly: true,
    });
    expect(result.current.linkedOwnerId).toBe("owner-1");
    await waitFor(() => expect(fake.setMeta).toHaveBeenCalledWith("lastKnownRole", "partner"));
  });

  it("a failed lastKnownRole write grants nothing: still a read-only partner", async () => {
    fake.setMeta.mockRejectedValue(new Error("quota exceeded"));
    h.state.links.partner_id = [{ owner_id: "owner-1" }];
    const { result } = renderAuth();
    await signIn("u1");
    await waitFor(() => expect(fake.setMeta).toHaveBeenCalled());

    expect(capability(result.current.role)).toEqual({
      role: "partner",
      ownerEngine: false,
      readOnly: true,
    });
  });
});

describe("multi-link row sets (.limit(2), N11)", () => {
  it("an owner with TWO partner links reports hasPartnerLinked (Unlink stays reachable)", async () => {
    h.state.links.partner_id = [];
    h.state.links.owner_id = [{ partner_id: "p1" }, { partner_id: "p2" }];
    const { result } = renderAuth();
    await signIn("owner-1");

    expect(result.current.role).toBe("owner");
    expect(result.current.hasPartnerLinked).toBe(true);
  });

  it("a partner linked to TWO owners is never owner: read-only partner, no owner auto-selected", async () => {
    h.state.links.partner_id = [{ owner_id: "o1" }, { owner_id: "o2" }];
    const { result } = renderAuth();
    await signIn("u1");

    expect(capability(result.current.role)).toEqual({
      role: "partner",
      ownerEngine: false,
      readOnly: true,
    });
    expect(result.current.linkedOwnerId).toBeNull();
  });

  it("a multi-linked partner still gets the partner sign-out wipe", async () => {
    h.state.links.partner_id = [{ owner_id: "o1" }, { owner_id: "o2" }];
    const { result } = renderAuth();
    await signIn("u1");

    await act(async () => {
      await result.current.signOut();
    });

    expect(fake.wipeLocalData).toHaveBeenCalledTimes(1);
  });
});
