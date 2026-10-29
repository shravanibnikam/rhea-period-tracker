// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import type { SyncEngine } from "@/sync";
import { addDays, toDateKey } from "@/domain/dates";
import { emptyLog } from "@/domain/types";

// A hosted build with a signed-in owner on #welcome (Settings › About Rhea): the
// landing must carry the sync privacy copy, never the local "no account" copy,
// and its one button opens the app with no auth screen in between.

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

vi.mock("@/app/lib/welcome", () => ({ hasWelcomed: () => true, markWelcomed: () => {}, isStandalone: () => false }));

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
  history.replaceState(null, "", "/");
  for (const c of open) await c.closeDB();
  open = [];
});

describe("App: the landing page for a signed-in hosted user (#welcome)", () => {
  it("shows the sync copy and Open Rhea, which goes straight into the app", async () => {
    const uid = `landing-signed-in-${Date.now()}`;
    const seed = new Container();
    seed.setAccount(uid);
    await seed.saveLog({ ...emptyLog(toDateKey(addDays(new Date(), -10))), flow: "medium" });
    await seed.closeDB();

    history.replaceState(null, "", "/#welcome");
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

    const openRhea = await screen.findAllByRole("button", { name: "Open Rhea" });
    expect(document.body.textContent).toMatch(/your logs sync to your account over TLS/);
    expect(document.body.textContent).not.toMatch(/there is no account to make/);
    expect(screen.queryAllByRole("button", { name: /Sign in|Create your account|Start tracking/ })).toHaveLength(0);

    fireEvent.click(openRhea[0]);
    expect(await screen.findByRole("button", { name: "Log today" })).toBeTruthy(); // the owner's tracker
    expect(screen.queryByLabelText(/password/i)).toBeNull(); // no auth screen
    expect(window.location.hash).toBe("#today");
  });
});
