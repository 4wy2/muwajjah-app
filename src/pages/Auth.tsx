import { track } from "../lib/analytics";
import { GOOGLE_ONLY } from "../lib/config";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Compass, Mail, LockKeyhole, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "../api/client";
import {
  signIn,
  signUpStudent,
  signUpContributor,
  sendRecovery,
  changePassword,
  signInWithGoogle,
} from "../api/auth";
import { safeReturnTo, type Portal } from "../auth/redirects";
import { useAuth } from "../auth/AuthProvider";
import { Field, Loading } from "../components/ui";
import { friendly } from "../lib/utils";
const NEXT_KEY = "mowajeh-next";
function rememberNext(next: string | null) {
  try {
    if (next) sessionStorage.setItem(NEXT_KEY, next);
    else sessionStorage.removeItem(NEXT_KEY);
  } catch {
    /* private mode: fall back to the home page */
  }
}
function readNext() {
  try {
    return sessionStorage.getItem(NEXT_KEY);
  } catch {
    return null;
  }
}
export default function Auth({
  portal = "student",
  mode: requestedMode,
}: {
  portal?: Portal;
  mode?: string;
}) {
  const { mode: routeMode = "login" } = useParams();
  const mode = requestedMode || routeMode;
  const admin = portal === "admin";
  const base = admin ? "/admin" : "/auth";
  const [params] = useSearchParams();
  const { user, loading, recovering, error: sessionError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const google = useQuery({
    queryKey: ["google-enabled"],
    queryFn: () => rpc<boolean>("guide_google_enabled"),
  });
  // Where to go after signing in: the page the visitor came from, kept across
  // the Google round trip (which drops query strings), or the home page.
  const [storedNext] = useState(readNext);
  const target = safeReturnTo(params.get("next") || storedNext, portal);
  useEffect(() => {
    setMessage("");
    setError("");
  }, [mode]);
  // The remembered page is used once, by the sign-in that stored it.
  useEffect(() => {
    if (user && !recovering) rememberNext(null);
  }, [user?.id, recovering]);
  if (loading) return <Loading />;
  if (
    user &&
    mode !== "reset" &&
    mode !== "callback" &&
    mode !== "forgot" &&
    !recovering
  )
    return <Navigate to={target} replace />;
  if (mode === "callback")
    return user ? (
      <Navigate to={recovering ? base + "/reset" : target} replace />
    ) : (
      <Navigate to={base + "/login"} replace />
    );
  const reset = mode === "reset" || recovering;
  const signup = mode === "signup";
  const forgot = mode === "forgot";
  if (GOOGLE_ONLY && (signup || forgot))
    return <Navigate to={base + "/login"} replace />;
  const title = reset
    ? "كلمة مرور جديدة"
    : signup
      ? admin
        ? "طلب الانضمام لفريق المحتوى"
        : "ابدأ رحلتك مع مُوجّه"
      : forgot
        ? "استعادة كلمة المرور"
        : admin
          ? "تسجيل دخول الإدارة"
          : "حيّاك في مُوجّه";
  return (
    <div className="auth-wrap">
      <aside className="auth-story">
        {admin ? (
          <ShieldCheck size={66} strokeWidth={1} />
        ) : (
          <Compass size={66} strokeWidth={1} />
        )}
        <h2>
          {admin ? (
            <>
              محتوى أدق،
              <br />
              وخيارات أوضح.
            </>
          ) : (
            <>
              كل رحلة كبيرة
              <br />
              تبدأ بخيار واضح.
            </>
          )}
        </h2>
        <p>
          {admin
            ? "أدر الجامعات والتخصصات ومسارات القبول من مساحة واحدة لفريق مُوجّه."
            : "جامعاتك المفضلة، نسبتك الموزونة، وخياراتك القادمة… كلها في مكان واحد."}
        </p>
        <span>
          {admin ? "مُوجّه · مساحة فريق الإدارة" : "مُوجّه · بوصلتك للجامعة"}
        </span>
      </aside>
      <section className="auth-form panel">
        <span className="eyebrow">
          {admin ? "دخول الفريق" : "بوابة الطالب"}
        </span>
        <h1>{title}</h1>
        <p className="muted">
          {forgot
            ? "أدخل بريدك لنرسل لك رابط الاستعادة."
            : signup
              ? admin
                ? "سجّل بياناتك، وسيراجع مالك مُوجّه طلبك ويحدد الجامعات والصلاحيات. التسجيل وحده لا يمنح أي وصول."
                : "الحساب اختياري، ويحفظ لك المفضلة ونتائج الموزونة فقط. تصفح الجامعات متاح دون حساب. تفاصيل ما نحفظه في صفحة الخصوصية."
              : reset
                ? "اختر كلمة مرور قوية لحماية حسابك."
                : GOOGLE_ONLY
                  ? admin
                    ? "ادخل بحساب قوقل اللي أضافته مالكة مُوجّه للفريق."
                    : "ادخل بحساب قوقل لحفظ مفضلتك ونتائجك، والبحث بالتخصص ومقارنة الجامعات. تصفح الجامعات متاح بدون حساب."
                  : admin
                    ? "استخدم حسابك المضاف إلى فريق الإدارة."
                    : "سجّل دخولك لمتابعة خياراتك."}
        </p>
        {(!GOOGLE_ONLY || reset) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setMessage("");
            const form = new FormData(e.currentTarget);
            const email = String(form.get("email") || "").trim();
            const password = String(form.get("password") || "");
            const confirm = String(form.get("confirm") || "");
            if ((signup || reset) && password !== confirm) {
              setError("كلمتا المرور غير متطابقتين.");
              return;
            }
            setBusy(true);
            try {
              if (reset) {
                if (!user)
                  throw new Error(
                    "افتح رابط استعادة كلمة المرور المرسل إلى بريدك أولًا.",
                  );
                await changePassword(password);
                setMessage(
                  "تم تغيير كلمة المرور. سجّل دخولك بكلمة المرور الجديدة.",
                );
              } else if (forgot) {
                await sendRecovery(email, base + "/reset");
                setMessage("إذا كان البريد مسجّلًا، ستصلك رسالة الاستعادة.");
              } else if (signup) {
                const name = String(form.get("name") || "").trim();
                if (admin) await signUpContributor(email, password, name);
                else await signUpStudent(email, password, name);
                setMessage(
                  admin
                    ? "أُرسل الطلب. أكّد بريدك من الرسالة المرسلة، ثم انتظر اعتماد المالك."
                    : "راجع بريدك الإلكتروني لتأكيد حسابك.",
                );
              } else {
                await signIn(email, password);
              }
            } catch (err) {
              setError(friendly(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <Field label="الاسم">
              <input
                name="name"
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required
              />
            </Field>
          )}
          {!reset && (
            <Field label="البريد الإلكتروني">
              <input
                name="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                placeholder="name@example.com"
                required
              />
            </Field>
          )}
          {!forgot && (
            <Field label="كلمة المرور">
              <input
                name="password"
                type="password"
                dir="ltr"
                minLength={signup || reset ? 8 : 1}
                autoComplete={
                  signup || reset ? "new-password" : "current-password"
                }
                required
              />
            </Field>
          )}
          {(signup || reset) && (
            <Field label="تأكيد كلمة المرور">
              <input
                name="confirm"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          )}
          {Boolean(error || sessionError) && (
            <p className="notice error" role="alert">
              {error || friendly(sessionError)}
            </p>
          )}
          {message && (
            <p className="notice success" role="status">
              {message}
            </p>
          )}
          <button className="btn primary full" disabled={busy}>
            {busy
              ? "جارٍ المتابعة…"
              : reset
                ? "حفظ كلمة المرور"
                : signup
                  ? "إنشاء حساب"
                  : forgot
                    ? "إرسال رابط الاستعادة"
                    : "تسجيل الدخول"}
            {forgot ? <Mail size={18} /> : <LockKeyhole size={18} />}
          </button>
        </form>
        )}
        {!reset && !forgot && (GOOGLE_ONLY || google.data === true) && (
          <>
            {!GOOGLE_ONLY && (
              <div className="divider">
                <span>أو</span>
              </div>
            )}
            <button
              className={"btn full " + (GOOGLE_ONLY ? "primary" : "secondary")}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  if (!admin) track("login_click", { method: "google" });
                  rememberNext(params.get("next"));
                  await signInWithGoogle(base + "/callback");
                } catch (err) {
                  setError(friendly(err));
                  setBusy(false);
                }
              }}
            >
              المتابعة باستخدام Google
            </button>
          </>
        )}
        {admin && !reset && !forgot && (
          <p className="muted small">
            صلاحيات الإدارة تحددها مالكة مُوجّه بإيميل حسابك في قوقل. الدخول وحده
            لا يمنح وصولًا للإدارة.
          </p>
        )}
        {error && GOOGLE_ONLY && !reset && (
          <p className="error-text" role="alert">{error}</p>
        )}
        {!GOOGLE_ONLY && (
        <div className="auth-links">
          {!signup && !reset && !forgot && (
            <Link to={base + "/signup"}>
              {admin ? "طلب الانضمام كمساهم" : "إنشاء حساب جديد"}
            </Link>
          )}
          {(signup || forgot || reset) && (
            <Link to={base + "/login"}>تسجيل الدخول</Link>
          )}
          {!forgot && !signup && !reset && (
            <Link to={base + "/forgot"}>نسيت كلمة المرور؟</Link>
          )}
        </div>
        )}
      </section>
    </div>
  );
}
