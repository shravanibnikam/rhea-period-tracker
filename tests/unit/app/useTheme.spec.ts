// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { holdLightTheme, initTheme, readTheme, releaseStartupTheme, useTheme } from "@/app/hooks/useTheme";

const isDark = () => document.documentElement.classList.contains("dark");

/** An OS colour scheme the test can flip, with the change event the app listens to. */
function stubOs(dark: boolean) {
  const os = { dark, listeners: [] as (() => void)[] };
  vi.stubGlobal("matchMedia", (q: string) => ({
    get matches() {
      return q.includes("dark") && os.dark;
    },
    addEventListener: (_: string, cb: () => void) => os.listeners.push(cb),
    removeEventListener() {},
  }));
  return {
    flip(next: boolean) {
      os.dark = next;
      os.listeners.forEach((cb) => cb());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

describe("useTheme", () => {
  it("an OS change to dark waits while the light theme is held, and applies on release", () => {
    // Storage blocked: the preference reads "system", so the OS decides.
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    const os = stubOs(false);
    initTheme();
    const release = holdLightTheme();
    os.flip(true);
    expect(isDark()).toBe(false);
    release();
    expect(isDark()).toBe(true);
    release(); // a second release is a no-op
    os.flip(false);
    expect(isDark()).toBe(false);
  });

  it("stays light from startup while index.html kept the page light for the landing, until App hands it back", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    stubOs(true);
    document.documentElement.setAttribute("data-landing", "");
    initTheme();
    expect(isDark()).toBe(false);
    releaseStartupTheme();
    expect(isDark()).toBe(true);
    expect(document.documentElement.hasAttribute("data-landing")).toBe(false);
    releaseStartupTheme(); // repeat calls are no-ops
    expect(isDark()).toBe(true);
  });

  // Last: the session's choice stays for the rest of this module's life.
  it("keeps this session's choice in memory when storage is blocked", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    stubOs(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(readTheme()).toBe("dark");
    expect(renderHook(() => useTheme()).result.current.theme).toBe("dark");
  });
});
