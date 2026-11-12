import { track } from "../lib/analytics";
import { useOffer } from "../api/commerce";
import { useState } from "react";
import { NavLink, Link, Outlet, Navigate, useLocation } from "react-router-dom";
import {
  Star,
  LayoutDashboard,
  Calculator,
  Settings,
  Crown,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import {
  useFavorites,
  useProfile,
  useScores,
  usePlus,
  usePlusFeatures,
  useCommercialVisible,
  deleteScore,
} from "../api/student";
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
  useActiveNavIntoView,
} from "../components/ui";
import UniversityCard, { FavoriteButton } from "../components/UniversityCard";
import type { Program } from "../lib/types";
import { date, friendly } from "../lib/utils";
export default function Student() {
  const commercial = useCommercialVisible();
  useActiveNavIntoView(useLocation().pathname);
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
          ]
            .filter(([route]) => route !== "subscription" || commercial)
            .map(([route, label, Icon]) => {
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
  const commercial = useCommercialVisible();
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
        {commercial && (
          <Link to="/student/subscription" className="stat-card purple">
            <Crown />
            <span>حالة الحساب</span>
            <strong>
              {plus.isSuccess ? (plus.data ? "بلس" : "مجاني") : "—"}
            </strong>
          </Link>
        )}
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
  const toast = useToast();
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
        <div className="panel table-wrap stack">
          <table>
            <thead>
              <tr>
                <th>الجامعة</th>
                <th>المسار</th>
                <th>الثانوية</th>
                <th>القدرات</th>
                <th>التحصيلي</th>
                <th>الموزونة</th>
                <th>التاريخ</th>
                <th>
                  <span className="sr-only">حذف</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td className="cell-main">
                    <Link
                      to={
                        "/universities/" + s.university_id + "#admission"
                      }
                    >
                      {universities.data?.find((u) => u.id === s.university_id)
                        ?.name ||
                        s.university_name ||
                        "عرض الجامعة"}
                    </Link>
                  </td>
                  <td className="cell-full" data-label="المسار">{s.track_name}</td>
                  <td data-label="الثانوية">{s.school}</td>
                  <td data-label="القدرات">{s.aptitude}</td>
                  <td data-label="التحصيلي">{s.achievement}</td>
                  <td className="accent cell-full" data-label="الموزونة">
                    <b>{s.result}%</b>
                  </td>
                  <td data-label="التاريخ">{date(s.created_at)}</td>
                  <td className="cell-actions">
                    <button
                      className="icon-btn"
                      aria-label="حذف هذه النتيجة"
                      title="حذف"
                      onClick={async () => {
                        try {
                          await deleteScore(s.id);
                          toast("حُذفت النتيجة");
                        } catch (e) {
                          toast(friendly(e), true);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
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
  const plusFeatures = usePlusFeatures();
  const { user } = useAuth();
  const offer = useOffer();
  const commercial = useCommercialVisible();
  if (q.isSuccess && offer.isSuccess && !commercial)
    return <Navigate to="/student/dashboard" replace />;
  const o = offer.data;
  return (
    <>
      <PageHeading title="اشتراكي" />
      {q.isPending || offer.isPending ? (
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
            {q.data
              ? "اشتراكك مفعّل"
              : "مُوجّه بلس" + (o?.season_label ? " لـ" + o.season_label : "")}
          </h2>
          {q.data ? (
            <p>اشتراكك مفعّل حتى {date(q.data.expires_at)}.</p>
          ) : (
            <>
              <ul className="plus-features">
                {plusFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {o?.price_text && <p className="price">{o.price_text}</p>}
              {o?.season_ends_at && (
                <p className="muted">
                  الاشتراك موسمي وينتهي في {date(o.season_ends_at)}.
                </p>
              )}
              {o?.purchase_url ? (
                <>
                  <a
                    className="btn primary"
                    onClick={() => track("subscribe_click", { from: "subscription_page" })}
                    href={o.purchase_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    اشترك الآن
                  </a>
                  <p className="notice">
                    مهم: ادفع بنفس الإيميل المسجل في حسابك
                    {user?.email ? (
                      <>
                        {" "}
                        (<span dir="ltr">{user.email}</span>)
                      </>
                    ) : null}
                    ، وبيتفعل اشتراكك تلقائيًا بعد الدفع.
                  </p>
                </>
              ) : (
                <p className="notice">
                  {o?.note ||
                    "للاشتراك تواصل مع إدارة مُوجّه، ويتفعل اشتراكك على حسابك بعد التحويل."}
                </p>
              )}
              {o?.purchase_url && o?.note && <p className="muted">{o.note}</p>}
            </>
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
