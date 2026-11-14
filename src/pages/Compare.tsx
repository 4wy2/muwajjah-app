import { uniPath } from "../lib/slugs";
import { useUpgradeSheet } from "../lib/store";
import { useEffect, useRef } from "react";
import { track } from "../lib/analytics";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { X, GitCompareArrows, Share2, Lock } from "lucide-react";
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
  const shareState = useFeature("compare_share", user?.id).data || "hidden";
  const setComparison = usePreferences((s) => s.setComparison);
  const [params, setParams] = useSearchParams();
  const loc = useLocation();
  // A shared link (?u=id,id) opens that comparison once the visitor may compare.
  const shared = params.get("u");
  const opened = useRef(false);
  useEffect(() => {
    if (!shared || !canCompare || !q.data || opened.current) return;
    const valid = shared
      .split(",")
      .filter((id) => q.data!.some((u) => u.id === id))
      .slice(0, 3);
    opened.current = true;
    if (valid.length) {
      setComparison(valid);
      track("compare_shared_open", { count: valid.length });
      toast("فتحنا لك المقارنة اللي وصلتك");
    }
    setParams(
      (p) => {
        p.delete("u");
        return p;
      },
      { replace: true },
    );
  }, [shared, canCompare, q.data]);
  const share = async () => {
    const url = location.origin + "/compare?u=" + selected.map((u) => u.id).join(",");
    const text = "مقارنة: " + selected.map((u) => u.name).join(" و ");
    track("compare_share", { count: selected.length });
    try {
      if (navigator.share) {
        await navigator.share({ title: "مقارنة الجامعات | مُوجّه", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("نسخنا رابط المقارنة، أرسله لمن تبي");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast("ما قدرنا ننسخ الرابط. انسخه من هنا: " + url, true);
    }
  };
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
        <Link className="btn primary" to={"/auth/login?next=" + encodeURIComponent(loc.pathname + loc.search)}>
          تسجيل الدخول
        </Link>
      </Empty>
    );
  if (feature.data === "locked")
    return (
      <Empty title="مقارنة الجامعات من مزايا الحساب المُرقّى">
        <button className="btn primary" onClick={() => useUpgradeSheet.getState().show("comparison")}>
          اعرف المميزات
        </button>
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
        {selected.length >= 2 && shareState !== "hidden" && (
          <div className="compare-share">
            {shareState === "free" || shareState === "plus" ? (
              <button className="btn secondary compact" onClick={share}>
                <Share2 size={16} aria-hidden="true" /> شارك المقارنة
              </button>
            ) : shareState === "locked" ? (
              <button className="btn secondary compact" onClick={() => useUpgradeSheet.getState().show("compare_share")}>
                <Lock size={15} aria-hidden="true" /> شارك المقارنة
              </button>
            ) : (
              <Link className="btn secondary compact" to={"/auth/login?next=" + encodeURIComponent("/compare")}>
                <Share2 size={16} aria-hidden="true" /> سجّل دخولك للمشاركة
              </Link>
            )}
          </div>
        )}
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
                      <Link to={uniPath(u.id)}>{u.name}</Link>
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
                      <Link to={uniPath(u.id) + "?tab=admission"}>
                        عرض مسارات القبول
                      </Link>
                      <br />
                      <Link to={uniPath(u.id) + "?tab=programs"}>
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
