import { useEffect } from "react";
import { track } from "../lib/analytics";
import { Link, Navigate } from "react-router-dom";
import { X, GitCompareArrows } from "lucide-react";
import { useCatalog, useFeature } from "../api/catalog";
import { usePreferences } from "../lib/store";
import { useAuth } from "../auth/AuthProvider";
import {
  PageHeading,
  Loading,
  ErrorState,
  Empty,
  useToast,
} from "../components/ui";
import { UniversityLogo } from "../components/UniversityCard";
import { housing, safeUrl } from "../lib/utils";
export default function Compare() {
  const { user } = useAuth();
  const feature = useFeature("comparison", user?.id);
  const q = useCatalog();
  const ids = usePreferences((s) => s.comparison);
  const toggle = usePreferences((s) => s.toggleCompare);
  const toast = useToast();
  const selected = (q.data || []).filter((u) => ids.includes(u.id));
  const canCompare = feature.data === "free" || feature.data === "plus";
  useEffect(() => {
    if (canCompare && selected.length >= 2)
      track("compare_open", { count: selected.length });
  }, [canCompare, selected.length]);
  if (feature.isPending || q.isPending) return <Loading />;
  if (feature.error || q.error)
    return (
      <ErrorState
        error={feature.error || q.error}
        retry={() => {
          void feature.refetch();
          void q.refetch();
        }}
      />
    );
  // A hidden feature does not exist for visitors, even by direct URL.
  if (feature.data === "hidden") return <Navigate to="/" replace />;
  if (feature.data === "login")
    return (
      <Empty title="سجّل دخولك لمقارنة الجامعات">
        <p>المقارنة متاحة مجانًا لكل من يسجل دخوله.</p>
        <Link className="btn primary" to="/auth/login?next=%2Fcompare">
          تسجيل الدخول
        </Link>
      </Empty>
    );
  if (feature.data === "locked")
    return (
      <Empty title="مقارنة الجامعات ضمن مزايا بلس">
        <Link
          className="btn primary"
          to={user ? "/student/subscription" : "/auth/login?next=%2Fcompare"}
        >
          عرض حسابي
        </Link>
      </Empty>
    );
  const rows = [
    ["المدينة", (u: any) => u.city || "—"],
    ["المنطقة", (u: any) => u.region || "—"],
    ["نوع الجامعة", (u: any) => u.type || "—"],
    ["السكن الجامعي", (u: any) => housing(u.housing_status) || "—"],
    ["معلومات السكن", (u: any) => u.housing_note || "—"],
    ["نبذة", (u: any) => u.description || "—"],
  ] as const;
  return (
    <>
      <PageHeading
        eyebrow="خياراتك جنبًا إلى جنب"
        title="قارن، ثم قرّر."
        description="اختر حتى 3 جامعات منشورة للمقارنة."
      />
      <section className="panel">
        <div className="compare-picker">
          <GitCompareArrows />
          <label htmlFor="compare-add">أضف جامعة للمقارنة</label>
          <select
            id="compare-add"
            value=""
            disabled={selected.length >= 3}
            onChange={(e) => {
              if (e.target.value && !toggle(e.target.value))
                toast("الحد الأقصى 3 جامعات.", true);
            }}
          >
            <option value="">اختر الجامعة…</option>
            {q.data
              ?.filter((u) => !ids.includes(u.id))
              .map((u) => (
                <option value={u.id} key={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </div>
        {selected.length ? (
          <div className="table-wrap">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>المعيار</th>
                  {selected.map((u) => (
                    <th key={u.id}>
                      <button
                        className="icon-btn"
                        aria-label={"إزالة " + u.name}
                        onClick={() => toggle(u.id)}
                      >
                        <X size={16} />
                      </button>
                      <UniversityLogo university={u} />
                      <Link to={"/universities/" + u.id}>{u.name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, get]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {selected.map((u) => (
                      <td key={u.id}>{get(u)}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th>القبول والتخصصات</th>
                  {selected.map((u) => (
                    <td key={u.id}>
                      <Link to={"/universities/" + u.id + "?tab=admission"}>
                        عرض مسارات القبول
                      </Link>
                      <br />
                      <Link to={"/universities/" + u.id + "?tab=programs"}>
                        عرض التخصصات
                      </Link>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>الموقع الرسمي</th>
                  {selected.map((u) => (
                    <td key={u.id}>
                      {safeUrl(u.website_url) ? (
                        <a
                          href={safeUrl(u.website_url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          زيارة الموقع ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="المقارنة تبدأ بخياراتك">
            <p>اختر الجامعة الأولى من القائمة أعلاه.</p>
          </Empty>
        )}
      </section>
    </>
  );
}
