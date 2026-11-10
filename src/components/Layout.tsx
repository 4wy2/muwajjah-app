import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Compass,
  GraduationCap,
  GitCompareArrows,
  UserRound,
  LogOut,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth, useMember } from "../auth/AuthProvider";
import { usePreferences } from "../lib/store";
import { useFeature } from "../api/catalog";
import { db, queryClient } from "../api/client";
import { claimPendingPlus, useOffer } from "../api/commerce";
import { usePlus } from "../api/student";
import { useToast } from "./ui";
import { friendly } from "../lib/utils";
import { ThemeToggle } from "./Appearance";
import { PREVIEW } from "../lib/config";
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
  const showPromo =
    !!offer.data?.commercial_enabled &&
    !plus.data &&
    !location.pathname.startsWith("/admin") &&
    !location.pathname.startsWith("/student/subscription");
  return (
    <>
      <a className="skip-link" href="#main">
        انتقل إلى المحتوى
      </a>
      <header className="topbar">
        <div className="shell nav-row">
          <Link to="/" className="brand" aria-label="مُوجّه، الصفحة الرئيسية">
            <span className="brand-icon">
              <Compass size={31} />
            </span>
            <span>
              مُوجّه<small>بوصلتك للجامعة</small>
            </span>
          </Link>
          <nav aria-label="القائمة الرئيسية">
            <NavLink to="/" end>
              <GraduationCap size={19} /> دليل الجامعات
            </NavLink>
            {compareVisible && (
              <NavLink to="/compare">
                <GitCompareArrows size={18} /> قارن الجامعات
              </NavLink>
            )}
            <NavLink to="/student/dashboard">
              <UserRound size={18} /> بوابة الطالب
            </NavLink>
            {member.data?.is_enabled && (
              <NavLink to="/admin">
                <ShieldCheck size={18} /> الإدارة
              </NavLink>
            )}
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            {user ? (
              <button
                className="icon-btn"
                aria-label="تسجيل الخروج"
                onClick={async () => {
                  const { error } = await db.auth.signOut();
                  if (error) toast(friendly(error), true);
                }}
              >
                <LogOut size={19} />
              </button>
            ) : (
              <Link className="btn primary compact" to="/auth/login">
                تسجيل الدخول <ArrowIcon />
              </Link>
            )}
          </div>
        </div>
      </header>
      {PREVIEW && (
        <div className="preview-bar" role="note">
          نسخة تجريبية، والموقع قيد التجهيز.
        </div>
      )}
      {showPromo && (
        <div className="promo-bar" role="note">
          <span>
            <strong>مُوجّه بلس</strong>
            {offer.data?.season_label ? " لـ" + offer.data.season_label : ""}: ابحث
            بالتخصص في كل الجامعات، وقارن بينها، واطّلع على النسب السابقة.
          </span>
          <Link className="btn primary compact" to="/student/subscription">
            اشترك{offer.data?.price_text ? " بـ" + offer.data.price_text : ""}
          </Link>
        </div>
      )}
      <main id="main" className="shell main">
        <Outlet />
      </main>
      <footer className="shell footer">
        <Link className="footer-brand" to="/">
          مُوجّه
        </Link>
        <span>قرارك الجامعي يبدأ بمعرفة خياراتك.</span>
        <nav className="footer-links" aria-label="روابط التذييل">
          <Link to="/privacy">الخصوصية</Link>
        </nav>
        <small>© {new Date().getFullYear()} مُوجّه</small>
      </footer>
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
