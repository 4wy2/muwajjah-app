import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ArrowUpRight, ShieldCheck, LogOut } from "lucide-react";
import { useAuth, useMember } from "../auth/AuthProvider";
import RequireUser from "../auth/RequireUser";
import { db } from "../api/client";
import { Empty, ErrorBoundary, Loading, useToast } from "../components/ui";
import { ThemeToggle } from "../components/Appearance";
import { friendly } from "../lib/utils";
import AdminLayout from "./AdminLayout";
import { adminModules } from "./modules";
import { canOpenAdminModule, type AdminAccess } from "./access";
import "./admin.css";
const Auth = lazy(() => import("../pages/Auth"));
function ModuleAccess({
  access,
  children,
}: {
  access: AdminAccess;
  children: ReactNode;
}) {
  const member = useMember();
  return canOpenAdminModule(member.data, access) ? (
    children
  ) : (
    <Empty title="ليست لديك صلاحية لهذا القسم">
      <Link to="/admin/universities">العودة للجامعات</Link>
    </Empty>
  );
}
export default function AdminApp() {
  const { user } = useAuth();
  const location = useLocation();
  const toast = useToast();
  useEffect(() => {
    document.title = "إدارة مُوجّه";
    window.scrollTo(0, 0);
    return () => {
      document.title = "مُوجّه | دليلك للجامعة";
    };
  }, [location.pathname]);
  return (
    <div className="admin-app">
      <a className="skip-link" href="#admin-main">
        انتقل إلى محتوى الإدارة
      </a>
      <header className="admin-topbar">
        <div className="admin-container admin-topbar-inner">
          <Link to="/admin" className="admin-brand">
            <span className="admin-brand-icon">
              <ShieldCheck size={25} />
            </span>
            <span>
              مُوجّه<small>مساحة الإدارة</small>
            </span>
          </Link>
          <div className="actions">
            <Link to="/" className="btn secondary compact">
              عرض الموقع <ArrowUpRight size={16} />
            </Link>
            <ThemeToggle />
            {user && (
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
            )}
          </div>
        </div>
      </header>
      <main id="admin-main" className="admin-container admin-main">
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<Loading />}>
            <Routes>
              {["login", "signup", "forgot", "reset", "callback"].map((mode) => (
                <Route
                  key={mode}
                  path={mode}
                  element={<Auth portal="admin" mode={mode} />}
                />
              ))}
              <Route
                element={
                  <RequireUser
                    loginPath="/admin/login"
                    resetPath="/admin/reset"
                  />
                }
              >
                <Route element={<AdminLayout />}>
                  <Route
                    index
                    element={<Navigate to="universities" replace />}
                  />
                  {adminModules.map((module) => (
                    <Route
                      key={module.path}
                      path={module.path}
                      element={
                        <ModuleAccess access={module.access}>
                          {module.element}
                        </ModuleAccess>
                      }
                    />
                  ))}
                  <Route
                    path="*"
                    element={
                      <Empty title="قسم الإدارة غير موجود">
                        <Link to="/admin">العودة للإدارة</Link>
                      </Empty>
                    }
                  />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
