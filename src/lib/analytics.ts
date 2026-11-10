// Google Analytics 4. Off until GA_ID is set (no script, no cookies).
// The team's admin pages are never tracked, and neither are the owner's/team's
// own visits once they are signed in as team members (see Layout).
import { GA_ID } from "./config";

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let loaded = false;
let blocked = false;

export const analyticsOn = () => !!GA_ID && !blocked;

// Called once the visitor is known to be a team member: stop sending anything.
export function blockAnalytics() {
  blocked = true;
  if (GA_ID) (window as unknown as Record<string, boolean>)["ga-disable-" + GA_ID] = true;
}

function load() {
  if (loaded || !analyticsOn()) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  // Page views are sent by trackPage on every route change (single-page app).
  window.gtag("config", GA_ID, { send_page_view: false, anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
  document.head.appendChild(s);
}

export function trackPage(path: string) {
  if (!analyticsOn() || path.startsWith("/admin")) return;
  load();
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: location.href,
    page_title: document.title,
  });
}

// Named events the owner reads in GA4 > Reports > Engagement > Events.
export type EventName =
  | "login_click"
  | "university_view"
  | "major_search"
  | "compare_open"
  | "subscribe_click";

export function track(name: EventName, params: Record<string, string | number> = {}) {
  if (!analyticsOn() || location.pathname.includes("/admin")) return;
  load();
  window.gtag?.("event", name, params);
}
