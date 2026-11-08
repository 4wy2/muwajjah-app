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
import { db } from "../api/client";
import { useToast } from "./ui";
import { friendly } from "../lib/utils";
import { ThemeToggle } from "./Appearance";
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
          <Link to="/admin/login">دخول فريق المحتوى</Link>
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
