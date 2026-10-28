import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/red-hat-display/500.css";
import "@fontsource/red-hat-display/700.css";
import "@fontsource/red-hat-display/900.css";
import "@fontsource/red-hat-text/400.css";
import "@fontsource/red-hat-text/500.css";
import "@fontsource/red-hat-text/600.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Providers } from "./di";
import { initTheme } from "./hooks/useTheme";
import App from "./App";
import "./styles/index.css";

initTheme();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <Providers>
          <App />
        </Providers>
      </ErrorBoundary>
    </StrictMode>
  );
}

// Register the service worker for offline PWA support — WEB ONLY (M1.10 /
// RHEA-059): inside a Capacitor webview the SW cache fights the native
// bundle, so native shells skip registration (spec §3).
const isNativeShell =
  typeof (window as { Capacitor?: unknown }).Capacitor !== "undefined";
if (import.meta.env.PROD && "serviceWorker" in navigator && !isNativeShell) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => {});
  });
}
