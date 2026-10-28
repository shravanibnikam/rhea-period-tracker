import { useCallback, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

const KEY = "rhea:theme";

/** The stored preference; "system" when unset or storage is unavailable. */
export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const darkQuery = () =>
  typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;

/** Put a preference on <html> (index.html does the same before first paint). */
export function applyTheme(pref: ThemePref): void {
  const dark = pref === "dark" || (pref === "system" && !!darkQuery()?.matches);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#1B1519" : "#FBF7F5");
}

/** Once at startup: apply, then follow the OS while the preference is "system". */
export function initTheme(): void {
  applyTheme(readTheme());
  // Re-reads storage on every change, so a later explicit choice always wins.
  darkQuery()?.addEventListener?.("change", () => applyTheme(readTheme()));
}

export function useTheme(): { theme: ThemePref; setTheme: (next: ThemePref) => void } {
  const [theme, setThemeState] = useState<ThemePref>(readTheme);
  const setTheme = useCallback((next: ThemePref) => {
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
