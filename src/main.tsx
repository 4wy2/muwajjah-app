import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BASE } from "./lib/config";
import { queryClient } from "./api/client";
import { AuthProvider } from "./auth/AuthProvider";
import { ToastProvider, ErrorBoundary, Loading, Empty } from "./components/ui";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import { Appearance } from "./components/Appearance";
import RequireUser from "./auth/RequireUser";
import "@fontsource/tajawal/arabic-400.css";
import "@fontsource/tajawal/arabic-500.css";
import "@fontsource/tajawal/arabic-700.css";
import "@fontsource/tajawal/arabic-800.css";
import "@fontsource/tajawal/latin-400.css";
import "./styles.css";
// Student-facing pages ship in the main bundle: no extra file is fetched while
// browsing, so a site update can never break a page that is already open.
import University from "./pages/University";
import Compare from "./pages/Compare";
import Upgrade from "./pages/Upgrade";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Auth from "./pages/Auth";
import Student, {
  Dashboard,
  Favorites,
  Scores,
  Subscription,
  StudentSettings as Settings,
} from "./pages/Student";
import { lazyWithReload } from "./lib/reload";
const Admin = lazyWithReload(() => import("./admin/AdminApp"));
function LegacyDetail() {
  const loc = useLocation();
  const id = new URLSearchParams(loc.search).get("id");
  return (
    <Navigate
      to={id ? "/universities/" + encodeURIComponent(id) : "/"}
      replace
    />
  );
}
// Browser cache for public content only (catalog, university pages). Never
// accounts, entitlements, paid data, team previews or empty answers (a
// private-site visitor gets none and must not keep that after launch).
const PERSISTED = new Set(["catalog", "university", "programs", "tracks", "sections"]);
const storage = (() => {
  try {
    const t = "__mowajeh";
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    return undefined;
  }
})();
const persister = createSyncStoragePersister({ storage, key: "mowajeh-cache" });
const persistOptions = {
  persister,
  maxAge: 6 * 60 * 60_000,
  buster: __BUILD_ID__,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: { queryKey: readonly unknown[]; state: { status: string; data: unknown } }) =>
      q.state.status === "success" &&
      PERSISTED.has(String(q.queryKey[0])) &&
      q.queryKey[2] !== true &&
      (Array.isArray(q.state.data) ? q.state.data.length > 0 : q.state.data != null),
  },
};
function App() {
  return (
    <BrowserRouter basename={BASE || undefined}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
              <Suspense fallback={<Loading />}>
                <Appearance />
                <Routes>
                  <Route path="admin/*" element={<Admin />} />
                  <Route element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="universities/:id" element={<University />} />
                    <Route path="compare" element={<Compare />} />
                    <Route path="upgrade" element={<Upgrade />} />
                    <Route path="privacy" element={<Privacy />} />
                    <Route path="terms" element={<Terms />} />
                    <Route path="auth/:mode" element={<Auth />} />
                    <Route element={<RequireUser />}>
                      <Route path="student" element={<Student />}>
                        <Route
                          index
                          element={<Navigate to="dashboard" replace />}
                        />
                        <Route path="dashboard" element={<Dashboard />} />
                        <Route path="favorites" element={<Favorites />} />
                        <Route path="scores" element={<Scores />} />
                        <Route path="subscription" element={<Subscription />} />
                        <Route path="settings" element={<Settings />} />
                      </Route>
                    </Route>
                    <Route
                      path="index.html"
                      element={<Navigate to="/" replace />}
                    />
                    <Route path="details.html" element={<LegacyDetail />} />
                    <Route
                      path="account.html"
                      element={<Navigate to="/student/dashboard" replace />}
                    />
                    <Route
                      path="compare.html"
                      element={<Navigate to="/compare" replace />}
                    />
                    <Route
                      path="admin.html"
                      element={<Navigate to="/admin" replace />}
                    />
                    <Route
                      path="*"
                      element={
                        <Empty title="الصفحة غير موجودة">
                          <a href={BASE + "/"}>العودة للرئيسية</a>
                        </Empty>
                      }
                    />
                  </Route>
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
