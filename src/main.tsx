import "@fontsource/heebo/400.css";
import "@fontsource/heebo/500.css";
import "@fontsource/heebo/600.css";
import "@fontsource/heebo/700.css";
import "@fontsource/heebo/800.css";
import "./styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useApp } from "./state/store";

function applyTheme(theme: string) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}
applyTheme(useApp.getState().theme);
useApp.subscribe((s) => applyTheme(s.theme));

// After a new deploy, an already-open tab asks for screen chunks that no longer
// exist ("Failed to fetch dynamically imported module"). Reload once to pick up
// the new version instead of showing an error page.
window.addEventListener("vite:preloadError", (e) => {
  try {
    if (sessionStorage.getItem("pw-reloaded") === location.href) return;
    sessionStorage.setItem("pw-reloaded", location.href);
  } catch {
    /* storage blocked: reload anyway */
  }
  e.preventDefault();
  location.reload();
});
// The page is healthy: allow the one-time reload again for the next deploy.
window.setTimeout(() => {
  try {
    sessionStorage.removeItem("pw-reloaded");
  } catch {
    /* ignore */
  }
}, 15_000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
