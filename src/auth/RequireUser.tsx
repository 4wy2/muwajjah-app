import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { Loading, ErrorState } from "../components/ui";
export default function RequireUser({
  loginPath = "/auth/login",
  resetPath = "/auth/reset",
}: {
  loginPath?: string;
  resetPath?: string;
}) {
  const { user, loading, error, recovering } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (recovering && user) return <Navigate to={resetPath} replace />;
  return user ? (
    <Outlet />
  ) : (
    <Navigate
      to={loginPath + "?next=" + encodeURIComponent(loc.pathname + loc.search)}
      replace
    />
  );
}
