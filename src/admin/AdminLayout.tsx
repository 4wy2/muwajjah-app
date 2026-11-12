import { Suspense } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { useSiteHealth } from "./Health";
import { alerts, healthChecks } from "./health";
import { useAuth, useMember, useAssignments } from "../auth/AuthProvider";
import { Loading, ErrorState, Empty, ErrorBoundary, useActiveNavIntoView } from "../components/ui";
import { adminModules } from "./modules";
import { canOpenAdminModule } from "./access";
export default function AdminLayout() {
  const { user } = useAuth();
  const q = useMember();
  const assignments = useAssignments();
  const location = useLocation();
  const health = useSiteHealth(!!q.data?.is_owner && !!q.data?.is_enabled);
  const urgent = health.data ? alerts(healthChecks(health.data)) : [];
  useActiveNavIntoView(location.pathname + (q.data ? ":ready" : ""));
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data && user?.user_metadata?.guide_signup)
    return (
      <Empty title="طلبك قيد مراجعة المالك">
        <p>
          سيظهر لك قسم الإدارة بعد أن يعتمد مالك مُوجّه طلبك ويحدد الجامعات
          المسندة إليك وصلاحياتك.
        </p>
        <Link to="/">العودة للدليل</Link>
      </Empty>
    );
  if (!q.data?.is_enabled)
    return (
      <Empty title="هذا الحساب غير مخوّل لدخول الإدارة">
        <p>
          اطلب من مالك مُوجّه إضافتك إلى الفريق وتفعيل صلاحياتك، أو سجّل الخروج
          للدخول بحساب آخر.
        </p>
        <Link to="/">العودة للدليل</Link>
      </Empty>
    );
  if (!q.data.is_owner && assignments.isPending) return <Loading />;
  if (assignments.error)
    return (
      <ErrorState
        error={assignments.error}
        retry={() => assignments.refetch()}
      />
    );
  return (
    <div className="workspace admin-workspace">
      <aside className="workspace-nav">
        <span className="eyebrow">
          <ShieldCheck size={15} />{" "}
          {q.data.is_owner ? "حساب المالك" : "حساب مساهم"}
        </span>
        <h2>إدارة المحتوى</h2>
        <nav aria-label="أقسام لوحة الإدارة">
          {adminModules
            .filter(
              (module) =>
                !module.hidden && canOpenAdminModule(q.data, module.access),
            )
            .map((module) => (
              <NavLink key={module.path} to={"/admin/" + module.path}>
                <module.icon size={18} />
                {module.label}
              </NavLink>
            ))}
        </nav>
        <div className="admin-account">
          <small>الحساب الحالي</small>
          <span dir="ltr">{user?.email}</span>
          {!q.data.is_owner && (
            <small>{assignments.data?.length || 0} جامعة مسندة</small>
          )}
        </div>
      </aside>
      <section className="workspace-body">
        {urgent.length > 0 && !location.pathname.endsWith("/health") && (
          <Link
            to="/admin/health"
            className={"health-bar " + (urgent.some((c) => c.level === "bad") ? "bad" : "warn")}
          >
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              {urgent.length === 1 ? "تنبيه يحتاج انتباهك: " : urgent.length + " تنبيهات تحتاج انتباهك، أولها: "}
              <strong>{urgent[0].title}</strong>
            </span>
            <span className="health-go">افتحي صحة الموقع</span>
          </Link>
        )}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </section>
    </div>
  );
}
