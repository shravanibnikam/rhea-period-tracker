import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/400-italic.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/dm-sans/300.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Providers } from "./di";
import App from "./App";
import "./styles/index.css";

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
if ("serviceWorker" in navigator && !isNativeShell) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
