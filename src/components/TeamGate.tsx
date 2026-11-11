import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useAuth, useMember } from "../auth/AuthProvider";
import { db } from "../api/client";
import { Loading } from "./ui";
import { useSitePrivate } from "../api/catalog";

// Private site (owner's switch in Admin > Access, database/011): the site opens
// only for team members the owner approved in Admin > Team. Sign-in and the
// legal pages stay open. The database itself refuses content to everyone else.
const OPEN = ["/auth", "/privacy", "/terms"];

export default function TeamGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const member = useMember();
  const { pathname, search } = useLocation();
  const priv = useSitePrivate();
  if (OPEN.some((p) => pathname.startsWith(p))) return <>{children}</>;
  if (priv.isPending) return <Loading />;
  if (!priv.data) return <>{children}</>;
  if (loading || (user && member.isPending)) return <Loading />;
  if (member.data?.is_enabled) return <>{children}</>;
  const next = encodeURIComponent(pathname + search);
  return (
    <div className="panel team-gate">
      <LockKeyhole size={34} aria-hidden="true" />
      <h1>مُوجّه قيد التجهيز</h1>
      {user ? (
        <>
          <p>
            حسابك <bdi dir="ltr">{user.email}</bdi> مو ضمن فريق مُوجّه. اطلب من
            المالك يضيف هذا الإيميل من لوحة الإدارة، ثم حدّث الصفحة.
          </p>
          <button
            className="btn secondary"
            onClick={async () => {
              await db.auth.signOut();
              location.reload();
            }}
          >
            الدخول بحساب ثاني
          </button>
        </>
      ) : (
        <>
          <p>الموقع متاح حاليًا لفريق مُوجّه فقط. سجّل دخولك بحساب Google المعتمد.</p>
          <Link className="btn primary" to={"/auth/login?next=" + next}>
            تسجيل الدخول
          </Link>
        </>
      )}
    </div>
  );
}
