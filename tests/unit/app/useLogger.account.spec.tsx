// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { useLogger } from "@/app/hooks/useLogger";
import { emptyLog, type DailyLog } from "@/domain/types";

// P0-N1: the active daily log must follow the signed-in account. The app mounts
// useLogger before useAuth scopes the container (container.setAccount(uid)), so
// the first read hits the local-only database. Unless the hook re-reads when
// the account changes, it keeps showing that empty draft, and the next
// whole-record save (an Overview symptom tap, or the sheet's Save) replaces the
// account's real row for the day. After an A→B switch it would carry A's log
// into B's session. Real Container over fake-indexeddb; the account is passed
// to the hook as its third argument, after the container is re-scoped (the
// order useAuth uses).

const DATE = new Date(2026, 2, 10);
const KEY = "2026-03-10";
const OTHER_DATE = new Date(2026, 2, 11);

const SEEDED: DailyLog = {
  ...emptyLog(KEY),
  flow: "medium",
  symptoms: ["Headache"],
  notes: "KEEP-ME",
};

let seq = 0;
const account = (name: string) => `n1-${name}-${++seq}`;

let open: Container[] = [];
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

function appContainer(uid: string | null): Container {
  const c = new Container();
  c.setAccount(uid);
  open.push(c);
  return c;
}

/** Write a row into one account's own database (a separate connection). */
async function seed(uid: string, log: DailyLog): Promise<void> {
  const c = new Container();
  c.setAccount(uid);
  await c.saveLog(log);
  await c.closeDB();
}

async function storedFor(uid: string, date: string): Promise<DailyLog | undefined> {
  const c = new Container();
  c.setAccount(uid);
  const log = await c.getLog(date);
  await c.closeDB();
  return log;
}

function wrapperFor(c: Container) {
  return ({ children }: { children: ReactNode }) => (
    <ContainerProvider value={c}>{children}</ContainerProvider>
  );
}

interface Props {
  date: Date;
  accountKey: string | null;
}

function mount(c: Container, initialProps: Props) {
  return renderHook(({ date, accountKey }: Props) => useLogger(date, undefined, accountKey), {
    initialProps,
    wrapper: wrapperFor(c),
  });
}

function settle(p: Promise<void>): Promise<unknown> {
  return p.then(
    () => "saved",
    (err: unknown) => err
  );
}

describe("useLogger follows the signed-in account (P0-N1)", () => {
  it("re-reads the day when the account is set after mount, and a tap keeps the account's notes", async () => {
    const u = account("owner");
    await seed(u, SEEDED);
    const c = appContainer(null); // mounted before auth resolves: local-only DB
    const { result, rerender } = mount(c, { date: DATE, accountKey: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.log).toEqual(emptyLog(KEY));

    // Sign-in: useAuth scopes the container, then the account key changes.
    c.setAccount(u);
    rerender({ date: DATE, accountKey: u });
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP-ME"));
    expect(result.current.log).toMatchObject(SEEDED);
    expect(result.current.exists).toBe(true);

    // An Overview symptom tap (a replace-mode save built from the shown log).
    await act(async () => {
      await result.current.saveMany([
        { ...result.current.log, symptoms: [...result.current.log.symptoms, "Cramps"] },
      ]);
    });
    expect(await c.getLog(KEY)).toMatchObject({ ...SEEDED, symptoms: ["Headache", "Cramps"] });
    // The "Log today" sheet's Save keeps them too.
    await act(async () => {
      await result.current.save();
    });
    expect(await c.getLog(KEY)).toMatchObject({ ...SEEDED, symptoms: ["Headache", "Cramps"] });
  });

  it("a tap racing the account's re-read is refused, never replacing the stored row (reviewer probe Q13)", async () => {
    const u = account("owner");
    await seed(u, SEEDED);
    const c = appContainer(null);
    const { result, rerender } = mount(c, { date: DATE, accountKey: null });
    await waitFor(() => expect(result.current.loading).toBe(false));

    c.setAccount(u);
    rerender({ date: DATE, accountKey: u });
    // Built from what is on screen before the account's row has loaded.
    let outcome: unknown;
    await act(async () => {
      outcome = await settle(
        result.current.saveMany([{ ...result.current.log, symptoms: ["Cramps"] }])
      );
    });
    expect(await c.getLog(KEY)).toMatchObject(SEEDED);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/still loading/i);
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP-ME"));
  });

  it("an A→B switch drops A's log at once and shows B's; A's content never lands in B's store", async () => {
    const a = account("A");
    const b = account("B");
    await seed(a, { ...SEEDED, notes: "A-PRIVATE" });
    const c = appContainer(a);
    const { result, rerender } = mount(c, { date: DATE, accountKey: a });
    await waitFor(() => expect(result.current.log.notes).toBe("A-PRIVATE"));
    expect(result.current.exists).toBe(true);

    c.setAccount(b);
    rerender({ date: DATE, accountKey: b });
    // Not carried into B's session, even while B's read is pending.
    expect(result.current.log.notes).toBe("");
    expect(result.current.exists).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.log).toEqual(emptyLog(KEY));
    expect(result.current.exists).toBe(false);

    await act(async () => {
      await result.current.saveMany([{ ...result.current.log, symptoms: ["Cramps"] }]);
    });
    expect(await c.getLog(KEY)).toMatchObject({ ...emptyLog(KEY), symptoms: ["Cramps"] });
    expect(await storedFor(a, KEY)).toMatchObject({ ...SEEDED, notes: "A-PRIVATE" });

    // And back to A: A's own row again.
    c.setAccount(a);
    rerender({ date: DATE, accountKey: a });
    await waitFor(() => expect(result.current.log.notes).toBe("A-PRIVATE"));
  });

  it("an account change clears a previous read failure and re-reads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const u = account("owner");
    await seed(u, SEEDED);
    const c = appContainer(null);
    vi.spyOn(c, "getLog").mockRejectedValueOnce(new Error("local read failed"));
    const { result, rerender } = mount(c, { date: DATE, accountKey: null });
    await waitFor(() => expect(result.current.loadError).toBeInstanceOf(Error));

    c.setAccount(u);
    rerender({ date: DATE, accountKey: u });
    expect(result.current.loadError).toBeNull();
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP-ME"));
    expect(result.current.loadError).toBeNull();
  });

  it("a date change resets exists until the new day has loaded (no Delete for an unseen row)", async () => {
    const u = account("owner");
    await seed(u, SEEDED);
    const c = appContainer(u);
    const { result, rerender } = mount(c, { date: DATE, accountKey: u });
    await waitFor(() => expect(result.current.exists).toBe(true));

    rerender({ date: OTHER_DATE, accountKey: u });
    expect(result.current.exists).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(false);
    expect(result.current.log).toEqual(emptyLog("2026-03-11"));
  });
});
