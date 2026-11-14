import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Compass,
  GraduationCap,
  GitCompareArrows,
  UserRound,
  LogOut,
  ShieldCheck,
  X,
  ArrowUp,
  ChevronDown,
} from "lucide-react";
import { useAuth, useMember } from "../auth/AuthProvider";
import { usePreferences, useUpgradeSheet } from "../lib/store";
import { UpgradeSheet } from "../pages/Upgrade";
import { useFeature } from "../api/catalog";
import { db, queryClient } from "../api/client";
import { claimPendingPlus, useOffer } from "../api/commerce";
import { usePlus, usePlusFeatures } from "../api/student";
import { useToast } from "./ui";
import { friendly } from "../lib/utils";
import { ThemeToggle } from "./Appearance";
import { PREVIEW } from "../lib/config";
import { useSitePrivate } from "../api/catalog";
import TeamGate from "./TeamGate";
import { blockAnalytics, track, trackPage } from "../lib/analytics";

// Everything about the signed-in account sits behind one button, so the bar
// holds only the brand, the menu and this.
function AccountMenu({
  initial,
  name,
  email,
  gated,
  admin,
  onSignOut,
}: {
  initial: string;
  name: string;
  email: string;
  gated: boolean;
  admin: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="account-menu" ref={ref}>
      <button
        className="account-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="قائمة الحساب"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="account-name">حسابي</span>
        <ChevronDown size={15} className="chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <div className="menu-who">
            {name && <strong>{name}</strong>}
            <small dir="ltr">{email}</small>
          </div>
          {!gated && (
            <Link role="menuitem" to="/student/dashboard">
              <UserRound size={17} /> بوابة الطالب
            </Link>
          )}
          {admin && (
            <Link role="menuitem" to="/admin">
              <ShieldCheck size={17} /> لوحة الإدارة
            </Link>
          )}
          <button role="menuitem" className="danger" onClick={onSignOut}>
            <LogOut size={17} /> تسجيل الخروج
          </button>
        </div>
      )}
    </div>
  );
}
// Shown after scrolling down a long page; hidden while the compare dock is up.
function ToTop({ hidden }: { hidden: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 900);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  if (!show || hidden) return null;
  return (
    <button
      className="to-top"
      aria-label="العودة لأعلى الصفحة"
      title="لأعلى"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp size={20} />
    </button>
  );
}
export default function Layout() {
  const { user } = useAuth();
  const member = useMember();
  const feature = useFeature("comparison", user?.id);
  const prefs = usePreferences();
  const toast = useToast();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const compareVisible = feature.data && feature.data !== "hidden";
  // Visitors only: the team's own browsing is never counted.
  useEffect(() => {
    if (user && member.isPending) return;
    if (member.data?.is_enabled) {
      blockAnalytics();
      return;
    }
    trackPage(location.pathname + location.search);
  }, [location.pathname, location.search, user?.id, member.isPending]);
  const offer = useOffer();
  const plus = usePlus();
  useEffect(() => {
    if (!user) return;
    void claimPendingPlus().then((n) => {
      if (n > 0) {
        void queryClient.invalidateQueries({ queryKey: ["plus"] });
        void queryClient.invalidateQueries({ queryKey: ["feature"] });
        toast("تمت ترقية حسابك");
      }
    });
  }, [user?.id]);
  const plusFeatures = usePlusFeatures();
  const showUpgrade = useUpgradeSheet((s) => s.show);
  // Team-only mode: visitors outside the team see only the brand and sign-in.
  const sitePrivate = useSitePrivate();
  const gated = sitePrivate.data !== false && !member.data?.is_enabled;
  // One canonical address per page (no query or hash), so search engines do
  // not count the same page twice.
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    const path = location.pathname.replace(/\/+$/, "") || "/";
    link.href = window.location.origin + path;
  }, [location.pathname]);
  // While private, ask search engines not to index anything.
  useEffect(() => {
    if (!sitePrivate.data) return;
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, nofollow";
    document.head.appendChild(m);
    return () => m.remove();
  }, [sitePrivate.data]);
  const showPromo =
    !gated &&
    !!offer.data?.commercial_enabled &&
    plusFeatures.length > 0 &&
    !plus.data &&
    !location.pathname.startsWith("/admin") &&
    !location.pathname.startsWith("/student/subscription") &&
    location.pathname !== "/upgrade";
  // One list feeds the top navigation (laptop) and the tab row under the bar
  // (phones and tablets): [path, label, icon, exact match, short label].
  const links: [string, string, typeof Compass, boolean, string][] = [
    ["/", "دليل الجامعات", GraduationCap, true, "الجامعات"],
    ...(compareVisible
      ? [["/compare", "قارن الجامعات", GitCompareArrows, false, "المقارنة"] as [string, string, typeof Compass, boolean, string]]
      : []),
    ["/student", "بوابة الطالب", UserRound, false, "حسابي"],
    ...(member.data?.is_enabled
      ? [["/admin", "الإدارة", ShieldCheck, false, "الإدارة"] as [string, string, typeof Compass, boolean, string]]
      : []),
  ];
  // A university profile belongs to the guide tab.
  const activeClass =
    (to: string) =>
    ({ isActive }: { isActive: boolean }) =>
      isActive || (to === "/" && location.pathname.startsWith("/universities"))
        ? "active"
        : "";
  const displayName = String(
    user?.user_metadata?.full_name || user?.user_metadata?.name || "",
  ).trim();
  const initial = (displayName || user?.email || "م").trim().charAt(0);
  return (
    <>
      <a className="skip-link" href="#main">
        انتقل إلى المحتوى
      </a>
      <header className="topbar">
        <div className="shell tb-inner">
          <Link to="/" className="brand" aria-label="مُوجّه، الصفحة الرئيسية">
            <span className="brand-icon">
              <Compass size={26} />
            </span>
            <span className="brand-text">
              مُوجّه<small>بوصلتك للجامعة</small>
            </span>
          </Link>
          {!gated && (
            <nav className="tb-nav" aria-label="القائمة الرئيسية">
              {links.map(([to, label, Icon, end]) => (
                <NavLink key={to} to={to} end={end} className={activeClass(to)}>
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="tb-actions">
            <ThemeToggle />
            {user ? (
              <AccountMenu
                initial={initial}
                name={displayName}
                email={user.email || ""}
                gated={gated}
                admin={!!member.data?.is_enabled}
                onSignOut={async () => {
                  const { error } = await db.auth.signOut();
                  if (error) toast(friendly(error), true);
                }}
              />
            ) : (
              <Link
                className="btn primary compact login-btn"
                to={
                  location.pathname.startsWith("/auth")
                    ? "/auth/login"
                    : "/auth/login?next=" + encodeURIComponent(location.pathname + location.search)
                }
              >
                تسجيل الدخول <ArrowIcon />
              </Link>
            )}
          </div>
        </div>
      </header>
      {!gated && (
        <nav className="mobile-tabs" aria-label="القائمة الرئيسية">
          <div className="shell mt-inner">
            {links.map(([to, , Icon, end, short]) => (
              <NavLink key={to} to={to} end={end} className={activeClass(to)}>
                <Icon size={17} aria-hidden="true" />
                {short}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      {PREVIEW && !gated && (
        <div className="preview-bar" role="note">
          نسخة تجريبية، والموقع قيد التجهيز.
        </div>
      )}
      {showPromo && (
        <div className="promo-bar" role="note">
          <span>
            <strong>رقِّ حسابك</strong>: {plusFeatures.join("، ")}.
          </span>
          <button
            className="btn primary compact"
            onClick={() => {
              track("subscribe_click", { from: "promo_bar" });
              showUpgrade();
            }}
          >
            اعرف المميزات
          </button>
        </div>
      )}
      <main id="main" className="shell main">
        <TeamGate>
          <Outlet />
        </TeamGate>
      </main>
      <footer className="site-footer">
        <div className="shell sf-inner">
          <div className="sf-brand">
            <Link className="footer-brand" to="/">
              <span className="brand-icon" aria-hidden="true">
                <Compass size={20} />
              </span>
              مُوجّه
            </Link>
            <p>دليل الجامعات الحكومية في السعودية: القبول والتخصصات والسكن في مكان واحد.</p>
          </div>
          <nav className="sf-links" aria-label="روابط التذييل">
            {!gated && (
              <>
                <Link to="/">دليل الجامعات</Link>
                <Link to="/student/dashboard">بوابة الطالب</Link>
              </>
            )}
            <Link to="/privacy">الخصوصية</Link>
            <Link to="/terms">شروط الاستخدام</Link>
          </nav>
          <div className="sf-bottom">
            <small>© {new Date().getFullYear()} مُوجّه</small>
            <small>قرارك الجامعي يبدأ بمعرفة خياراتك.</small>
          </div>
        </div>
      </footer>
      {!gated && <UpgradeSheet />}
      <ToTop
        hidden={
          prefs.comparison.length > 0 &&
          !!compareVisible &&
          location.pathname !== "/compare"
        }
      />
      {prefs.comparison.length > 0 &&
        compareVisible &&
        location.pathname !== "/compare" && (
          <div className="compare-dock">
            <GitCompareArrows />
            <span>{prefs.comparison.length} / 3 جامعات للمقارنة</span>
            <Link className="btn primary compact" to="/compare">
              عرض المقارنة
            </Link>
            <button
              className="icon-btn"
              aria-label="مسح المقارنة"
              onClick={prefs.clearComparison}
            >
              <X size={18} />
            </button>
          </div>
        )}
    </>
  );
}
function ArrowIcon() {
  return <span aria-hidden="true">←</span>;
}
