import { useEffect, useState } from "react";
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
} from "lucide-react";
import { useAuth, useMember } from "../auth/AuthProvider";
import { usePreferences } from "../lib/store";
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
        toast("تم تفعيل اشتراكك");
      }
    });
  }, [user?.id]);
  const plusFeatures = usePlusFeatures();
  // Team-only mode: visitors outside the team see only the brand and sign-in.
  const sitePrivate = useSitePrivate();
  const gated = sitePrivate.data !== false && !member.data?.is_enabled;
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
    !location.pathname.startsWith("/student/subscription");
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
  const initial = String(
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "م",
  )
    .trim()
    .charAt(0);
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
              <>
                {!gated && (
                  <Link
                    className="account-chip"
                    to="/student/dashboard"
                    aria-label="حسابي"
                    title="حسابي"
                  >
                    <span className="avatar" aria-hidden="true">
                      {initial}
                    </span>
                    <span className="account-name">حسابي</span>
                  </Link>
                )}
                <button
                  className="icon-btn"
                  aria-label="تسجيل الخروج"
                  title="تسجيل الخروج"
                  onClick={async () => {
                    const { error } = await db.auth.signOut();
                    if (error) toast(friendly(error), true);
                  }}
                >
                  <LogOut size={19} />
                </button>
              </>
            ) : (
              <Link className="btn primary compact login-btn" to="/auth/login">
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
            <strong>مُوجّه بلس</strong>
            {offer.data?.season_label ? " لـ" + offer.data.season_label : ""}:{" "}
            {plusFeatures.join("، ")}.
          </span>
          <Link
            className="btn primary compact"
            to="/student/subscription"
            onClick={() => track("subscribe_click", { from: "promo_bar" })}
          >
            اشترك{offer.data?.price_text ? " بـ" + offer.data.price_text : ""}
          </Link>
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
