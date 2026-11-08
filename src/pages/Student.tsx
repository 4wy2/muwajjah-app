import { useState } from "react";
import { NavLink, Link, Outlet, Navigate, useLocation } from "react-router-dom";
import {
  Star,
  LayoutDashboard,
  Calculator,
  Settings,
  Crown,
  ArrowLeft,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useFavorites, useProfile, useScores, usePlus } from "../api/student";
import { useCatalog } from "../api/catalog";
import { allRows, db, queryClient } from "../api/client";
import { usePreferences } from "../lib/store";
import {
  PageHeading,
  Loading,
  ErrorState,
  Empty,
  Field,
  useToast,
} from "../components/ui";
import UniversityCard, { FavoriteButton } from "../components/UniversityCard";
import type { Program } from "../lib/types";
import { date, friendly } from "../lib/utils";
export default function Student() {
  return (
    <div className="workspace">
      <aside className="workspace-nav">
        <span className="eyebrow">مساحتك الشخصية</span>
        <h2>بوابة الطالب</h2>
        <nav aria-label="أقسام بوابة الطالب">
          {[
            ["dashboard", "لوحتي", LayoutDashboard],
            ["favorites", "المفضلة", Star],
            ["scores", "سجل الموزونة", Calculator],
            ["subscription", "اشتراكي", Crown],
            ["settings", "الإعدادات", Settings],
          ].map(([route, label, Icon]) => {
            const I = Icon as typeof Star;
            return (
              <NavLink to={"/student/" + route} key={String(route)}>
                <I size={19} />
                {String(label)}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <section className="workspace-body">
        <Outlet />
      </section>
    </div>
  );
}
export function Dashboard() {
  const { user } = useAuth();
  const profile = useProfile();
  const scores = useScores();
  const favorites = useFavorites();
  const plus = usePlus();
  return (
    <>
      <PageHeading
        title={
          "حيّاك، " +
          (profile.data?.display_name ||
            user?.user_metadata?.guide_student_name ||
            user?.user_metadata?.full_name ||
            "طالب")
        }
        description="هنا تبدأ خطوتك الجامعية القادمة."
      />
      <div className="stat-grid">
        <Link to="/student/favorites" className="stat-card">
          <Star />
          <span>خياراتك المفضلة</span>
          <strong>{favorites.data?.length ?? "—"}</strong>
        </Link>
        <Link to="/student/scores" className="stat-card">
          <Calculator />
          <span>آخر موزونة محفوظة</span>
          <strong>
            {scores.data?.[0] ? scores.data[0].result + "%" : "—"}
          </strong>
        </Link>
        <Link to="/student/subscription" className="stat-card purple">
          <Crown />
          <span>حالة الحساب</span>
          <strong>
            {plus.isSuccess ? (plus.data ? "بلس" : "مجاني") : "—"}
          </strong>
        </Link>
      </div>
      {[profile, scores, favorites, plus].some((q) => q.error) && (
        <p className="notice">
          تعذر تحميل بعض بيانات حسابك. افتح القسم المطلوب لإعادة المحاولة.
        </p>
      )}
      <div className="panel dashboard-next">
        <span className="eyebrow">خطوتك التالية</span>
        <h2>قرّب الصورة، واستكشف خياراتك.</h2>
        <p>تصفح الجامعة، تعرّف على تخصصاتها، واحسب موزونتك.</p>
        <Link className="btn primary" to="/">
          استكشف الجامعات <ArrowLeft size={18} />
        </Link>
      </div>
    </>
  );
}
export function Favorites() {
  const q = useFavorites();
  const universities = useCatalog();
  const ids = (q.data || [])
    .map((f) => f.program_id)
    .filter(Boolean) as string[];
  const programs = useQuery({
    queryKey: ["favorite-programs", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: () =>
      allRows<Program>("guide_programs", (r) =>
        r
          .in("id", ids)
          .eq("published", true)
          .is("deleted_at", null)
          .order("id"),
      ),
  });
  if (q.isPending || universities.isPending) return <Loading />;
  if (q.error || universities.error)
    return (
      <ErrorState
        error={q.error || universities.error}
        retry={() => {
          void q.refetch();
          void universities.refetch();
        }}
      />
    );
  const unis =
    universities.data?.filter((u) =>
      q.data?.some((f) => f.university_id === u.id),
    ) || [];
  return (
    <>
      <PageHeading
        title="المفضلة"
        description="جامعات وتخصصات تستحق ترجع لها."
      />
      {!q.data?.length ? (
        <Empty title="قائمتك بانتظار خياراتك">
          <Link to="/" className="btn primary">
            تصفح الجامعات
          </Link>
        </Empty>
      ) : (
        <>
          <div className="university-grid">
            {unis.map((u) => (
              <UniversityCard key={u.id} university={u} compare={false} />
            ))}
          </div>
          {programs.isPending && ids.length > 0 ? (
            <Loading />
          ) : programs.error ? (
            <ErrorState
              error={programs.error}
              retry={() => programs.refetch()}
            />
          ) : (
            programs.data?.map((p) => (
              <article className="panel program-item" key={p.id}>
                <div>
                  <Link
                    to={"/universities/" + p.university_id + "?tab=programs"}
                  >
                    <h3>{p.name}</h3>
                  </Link>
                  <p>{p.college}</p>
                </div>
                <FavoriteButton id={p.id} kind="program" label={p.name} />
              </article>
            ))
          )}
          {q.data
            ?.filter(
              (f) =>
                (f.university_id &&
                  !unis.some((u) => u.id === f.university_id)) ||
                (f.program_id &&
                  programs.isSuccess &&
                  !programs.data?.some((p) => p.id === f.program_id)),
            )
            .map((f) => (
              <div className="panel program-item" key={f.id}>
                <p>هذا الخيار لم يعد منشورًا في الدليل.</p>
                <FavoriteButton
                  kind={f.university_id ? "university" : "program"}
                  id={(f.university_id || f.program_id)!}
                  label="الخيار غير المنشور"
                />
              </div>
            ))}
        </>
      )}
    </>
  );
}
export function Scores() {
  const q = useScores();
  const universities = useCatalog();
  return (
    <>
      <PageHeading
        title="سجل الموزونة"
        description="آخر 50 عملية حساب محفوظة في حسابك."
      />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <Empty title="لم تحسب موزونتك بعد">
          <Link to="/">اختر جامعة للبدء</Link>
        </Empty>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>الجامعة</th>
                <th>الثانوية</th>
                <th>القدرات</th>
                <th>التحصيلي</th>
                <th>الموزونة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      to={
                        "/universities/" + s.university_id + "?tab=calculator"
                      }
                    >
                      {universities.data?.find((u) => u.id === s.university_id)
                        ?.name || "عرض الجامعة"}
                    </Link>
                  </td>
                  <td>{s.school}</td>
                  <td>{s.aptitude}</td>
                  <td>{s.achievement}</td>
                  <td className="accent">
                    <b>{s.result}%</b>
                  </td>
                  <td>{date(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export function Subscription() {
  const q = usePlus();
  return (
    <>
      <PageHeading title="اشتراكي" />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <div className="panel subscription">
          <Crown size={40} />
          <span className="badge plus">
            {q.data ? "مُوجّه بلس" : "الحساب المجاني"}
          </span>
          <h2>
            {q.data ? "تفاصيل أكثر، قرار أوضح." : "اكتشف مزايا مُوجّه بلس"}
          </h2>
          <p>
            {q.data
              ? "اشتراكك مفعّل حتى " + date(q.data.expires_at)
              : "النسب السابقة ومقارنة الجامعات تتاح بحسب إعدادات الوصول في المنصة."}
          </p>
          {!q.data && (
            <p className="notice">
              لتفعيل بلس، تواصل مع إدارة مُوجّه عبر وسيلة التواصل التي سجّلت من
              خلالها. لا يوجد دفع إلكتروني داخل المنصة حاليًا.
            </p>
          )}
        </div>
      )}
    </>
  );
}
export function StudentSettings() {
  const { user } = useAuth();
  const q = useProfile();
  const prefs = usePreferences();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <>
      <PageHeading title="إعدادات الحساب" />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <form
          className="panel form-narrow"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const { error } = await db
                .from("guide_student_profiles")
                .upsert(
                  {
                    user_id: user!.id,
                    display_name: String(f.get("name")).trim(),
                  },
                  { onConflict: "user_id" },
                );
              if (error) throw error;
              await queryClient.invalidateQueries({ queryKey: ["profile"] });
              toast("تم حفظ بياناتك");
            } catch (err) {
              toast(friendly(err), true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="الاسم">
            <input
              name="name"
              minLength={2}
              maxLength={100}
              defaultValue={
                q.data?.display_name ||
                user?.user_metadata?.guide_student_name ||
                user?.user_metadata?.full_name ||
                ""
              }
              required
            />
          </Field>
          <Field label="البريد الإلكتروني">
            <input value={user?.email || ""} readOnly dir="ltr" />
          </Field>
          <Field label="المظهر">
            <select
              value={prefs.theme}
              onChange={(e) =>
                prefs.setTheme(e.target.value as typeof prefs.theme)
              }
            >
              <option value="system">حسب الجهاز</option>
              <option value="light">نهاري</option>
              <option value="dark">ليلي</option>
            </select>
          </Field>
          <button className="btn primary" disabled={busy}>
            {busy ? "جارٍ الحفظ…" : "حفظ التغييرات"}
          </button>
          <Link className="text-btn" to="/auth/forgot">
            تغيير كلمة المرور
          </Link>
        </form>
      )}
    </>
  );
}
