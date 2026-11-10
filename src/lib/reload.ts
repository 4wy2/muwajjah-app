import { lazy, type ComponentType } from "react";

// After a deploy, files from the previous build no longer exist. A page that
// was open before the deploy (or an old cached copy) then fails to load a
// chunk. We reload once to pick up the new build instead of showing an error.
const KEY = "muwajjah-reloaded-at";

export function isStaleBuildError(e: unknown) {
  const m = String((e as { message?: string })?.message || e || "");
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|error loading dynamically/i.test(m);
}

export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false; // avoid a reload loop
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: still try once */
  }
  location.reload();
  return true;
}

export function lazyWithReload<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await load();
    } catch (e) {
      if (isStaleBuildError(e) && reloadOnce()) return new Promise<never>(() => {});
      throw e;
    }
  });
}

if (typeof window !== "undefined") {
  // Vite fires this when a preloaded dependency of a lazy chunk fails.
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnce()) event.preventDefault();
  });
}
