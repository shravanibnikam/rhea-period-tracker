// The landing page shows once per browser, before the app is first opened.
const KEY = "rhea:welcomed";

export function hasWelcomed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // no storage: the landing shows, and entering lasts this session
  }
}

export function markWelcomed(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Private mode: nothing to remember.
  }
}

/** An installed PWA opens straight into the app. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}
