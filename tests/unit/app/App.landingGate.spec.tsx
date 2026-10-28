// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import App from "@/app/App";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { toDateKey, addDays } from "@/domain/dates";
import { emptyLog } from "@/domain/types";

vi.mock("@/app/lib/supabase", () => ({ supabase: null, isSupabaseConfigured: () => false }));
// Web Storage is not reliably there under Node's jsdom: drive "welcomed" directly.
const visit = vi.hoisted(() => ({ welcomed: true }));
vi.mock("@/app/lib/welcome", () => ({
  hasWelcomed: () => visit.welcomed,
  markWelcomed: () => {
    visit.welcomed = true;
  },
  isStandalone: () => false,
}));

// The landing gate follows the hash without a reload: an app route leaves the
// landing page (even #welcome → #today, where the route itself is unchanged),
// and #welcome opens it again. Its other rules stand (first visit, no data,
// no account; installed PWAs skip it).

let open: Container[] = [];
let seq = 0;
afterEach(async () => {
  cleanup();
  history.replaceState(null, "", "/");
  visit.welcomed = true;
  for (const c of open) await c.closeDB();
  open = [];
});

async function renderAt(hash: string, { withData }: { withData: boolean }) {
  const c = new Container();
  c.setAccount(`landing-gate-${++seq}-${Date.now()}`);
  open.push(c);
  if (withData) await c.saveLog({ ...emptyLog(toDateKey(addDays(new Date(), -10))), flow: "medium" });
  history.replaceState(null, "", `/${hash}`);
  render(
    <ContainerProvider value={c}>
      <App />
    </ContainerProvider>
  );
}

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
const landing = () => screen.findAllByRole("button", { name: /Start tracking/ });

describe("App: the landing gate follows the hash", () => {
  it("leaves #welcome for #today when there is no data yet", async () => {
    await renderAt("#welcome", { withData: false });
    await landing();
    await go("#today");
    expect(await screen.findByRole("heading", { name: "Get started" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start tracking/ })).toBeNull();
  });

  it("leaves #welcome for #today with data, although the route stays Today", async () => {
    await renderAt("#welcome", { withData: true });
    await landing();
    await go("#today");
    expect(await screen.findByText(/Day \d+ of \d+/)).toBeTruthy();
  });

  it("keeps its rules: a first-visit deep link opens the app, and #welcome opens the landing page", async () => {
    visit.welcomed = false;
    await renderAt("#insights", { withData: false });
    expect(await screen.findByRole("heading", { name: "Get started" })).toBeTruthy();
    await go("#welcome");
    await landing();
  });
});
