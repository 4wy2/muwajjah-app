import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useAuth, useMember } from "../auth/AuthProvider";
import { db } from "../api/client";
import { Loading } from "./ui";
import { TEAM_ONLY } from "../lib/config";

// Team-only mode (before launch): the site opens only for team members the
// owner has approved in Admin > Team. Sign-in and the legal pages stay open.
// This hides the site from the public; student data is protected by the
// database either way, and published university info is public by nature.
const OPEN = ["/auth", "/privacy", "/terms"];

export default function TeamGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const member = useMember();
  const { pathname, search } = useLocation();
  if (!TEAM_ONLY || OPEN.some((p) => pathname.startsWith(p))) return <>{children}</>;
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
