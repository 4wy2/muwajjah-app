import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
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
const University = lazy(() => import("./pages/University"));
const Compare = lazy(() => import("./pages/Compare"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Auth = lazy(() => import("./pages/Auth"));
const Student = lazy(() => import("./pages/Student"));
const Dashboard = lazy(() =>
  import("./pages/Student").then((m) => ({ default: m.Dashboard })),
);
const Favorites = lazy(() =>
  import("./pages/Student").then((m) => ({ default: m.Favorites })),
);
const Scores = lazy(() =>
  import("./pages/Student").then((m) => ({ default: m.Scores })),
);
const Subscription = lazy(() =>
  import("./pages/Student").then((m) => ({ default: m.Subscription })),
);
const Settings = lazy(() =>
  import("./pages/Student").then((m) => ({ default: m.StudentSettings })),
);
const Admin = lazy(() => import("./admin/AdminApp"));
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
function App() {
  return (
    <BrowserRouter basename={BASE || undefined}>
      <QueryClientProvider client={queryClient}>
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
                    <Route path="privacy" element={<Privacy />} />
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
      </QueryClientProvider>
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
