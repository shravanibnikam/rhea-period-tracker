// @vitest-environment jsdom
/**
 * "Today" moves past midnight. App computed it once, so an app left open (or
 * resumed) the next morning saved "Log today" / "My period started today" to
 * the day it was opened.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { useToday } from "@/app/hooks/useToday";
import App from "@/app/App";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { emptyLog } from "@/domain/types";

// Local mode regardless of the ambient environment.
vi.mock("@/app/lib/supabase", () => ({ supabase: null, isSupabaseConfigured: () => false }));

const BEFORE_MIDNIGHT = new Date(2026, 9, 29, 23, 59, 30);
const NEXT_MORNING = new Date(2026, 9, 30, 7, 0, 0);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const becomeVisible = () => act(() => void document.dispatchEvent(new Event("visibilitychange")));

describe("useToday", () => {
  it("is local midnight, and the same object until the day changes", () => {
    vi.useFakeTimers({ now: BEFORE_MIDNIGHT });
    const { result } = renderHook(() => useToday());
    const first = result.current;
    expect(first).toEqual(new Date(2026, 9, 29));

    act(() => void vi.advanceTimersByTime(20_000)); // still the 29th
    becomeVisible();
    expect(result.current).toBe(first);

    act(() => void vi.advanceTimersByTime(60_000)); // the minute check after midnight
    expect(result.current).toEqual(new Date(2026, 9, 30));
  });

  it("moves to the new day as soon as a resumed page becomes visible", () => {
    vi.useFakeTimers({ now: BEFORE_MIDNIGHT });
    const { result } = renderHook(() => useToday());

    vi.setSystemTime(NEXT_MORNING); // asleep overnight: no timer ran
    becomeVisible();

    expect(result.current).toEqual(new Date(2026, 9, 30));
  });
});

describe("App uses it", () => {
  it("'Log today' saves to the new day after the app resumes the next morning", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: BEFORE_MIDNIGHT });
    const c = new Container();
    c.setAccount(`use-today-${Date.now()}`);
    await c.saveLog({ ...emptyLog("2026-10-01"), flow: "medium" });
    render(
      <ContainerProvider value={c}>
        <App />
      </ContainerProvider>
    );
    await screen.findByRole("button", { name: "Log today" });

    vi.setSystemTime(NEXT_MORNING);
    becomeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Log today" }));
    fireEvent.click(await screen.findByRole("button", { name: /save log/i }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log your day" })).toBeNull());

    expect(await c.getLog("2026-10-30")).toBeDefined();
    expect(await c.getLog("2026-10-29")).toBeUndefined();
    await c.closeDB();
  });
});
