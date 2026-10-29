import { useCallback, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

const KEY = "rhea:theme";

/** This session's choice, kept in memory too: it holds where storage is blocked. */
let chosen: ThemePref | null = null;
/** Open holds on the light theme (the landing page is designed light). */
let lightHolds = 0;

/** This session's choice, else the stored preference; "system" when unset or storage is unavailable. */
export function readTheme(): ThemePref {
  if (chosen) return chosen;
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const darkQuery = () =>
  typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;

/** Put a preference on <html> (index.html does the same before first paint). Light while held. */
export function applyTheme(pref: ThemePref): void {
  const dark = lightHolds === 0 && (pref === "dark" || (pref === "system" && !!darkQuery()?.matches));
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#1B1519" : "#FBF7F5");
}

/**
 * Keep <html> light until the returned release runs, through OS theme changes too; then the
 * preference applies again. Releasing twice is a no-op.
 */
export function holdLightTheme(): () => void {
  lightHolds++;
  applyTheme(readTheme());
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    lightHolds--;
    applyTheme(readTheme());
  };
}

/** The startup hold, while the landing gate may still open (see initTheme). */
let releaseStartup: (() => void) | null = null;

/** Once at startup: apply, then follow the OS while the preference is "system". */
export function initTheme(): void {
  // index.html kept the first paint light for a possible landing (data-landing): stay light
  // until App shows something else, so the page doesn't flash dark in between.
  if (document.documentElement.hasAttribute("data-landing")) releaseStartup = holdLightTheme();
  else applyTheme(readTheme());
  // Re-reads storage on every change, so a later explicit choice always wins.
  darkQuery()?.addEventListener?.("change", () => applyTheme(readTheme()));
}

/** App shows something other than the landing: the preference applies again. Repeat calls are no-ops. */
export function releaseStartupTheme(): void {
  document.documentElement.removeAttribute("data-landing");
  releaseStartup?.();
  releaseStartup = null;
}

export function useTheme(): { theme: ThemePref; setTheme: (next: ThemePref) => void } {
  const [theme, setThemeState] = useState<ThemePref>(readTheme);
  const setTheme = useCallback((next: ThemePref) => {
    chosen = next;
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice still applies for this session.
    }
    applyTheme(next);
    setThemeState(next);
  }, []);
  return { theme, setTheme };
}
