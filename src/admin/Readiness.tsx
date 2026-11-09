import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, FolderOpen } from "lucide-react";
import { useAdminRows } from "../api/admin";
import { PageHeading, Loading, ErrorState, Empty } from "../components/ui";
import { rowState } from "./ContentManager";
import { assess } from "./readiness";

// Shows, per university, what is complete and what is missing, so data work
// can be planned university by university. Contributors see only their own.
export default function Readiness() {
  const universities = useAdminRows("universities");
  const programs = useAdminRows("programs");
  const tracks = useAdminRows("tracks");
  const sections = useAdminRows("sections");
  const [filter, setFilter] = useState("all");
  const queries = [universities, programs, tracks, sections];
  const loading = queries.some((q) => q.isPending);
  const error = queries.find((q) => q.error)?.error;
  const list = useMemo(() => {
    if (loading || error) return [];
    return (universities.data || [])
      .filter((u) => !u.deleted_at)
      .map((u) =>
        assess(u, {
          programs: programs.data || [],
          tracks: tracks.data || [],
          sections: sections.data || [],
        }),
      )
      .sort((a, b) => Number(!!b.university.published) - Number(!!a.university.published) || b.score - a.score);
  }, [universities.data, programs.data, tracks.data, sections.data, loading, error]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  const counts = {
    ready: list.filter((r) => r.ready && !r.university.published).length,
    incomplete: list.filter((r) => !r.ready).length,
    warnings: list.filter((r) => r.warnings.length).length,
    published: list.filter((r) => r.university.published).length,
  };
  const shown = list.filter((r) =>
    filter === "ready"
      ? r.ready && !r.university.published
      : filter === "incomplete"
        ? !r.ready
        : filter === "warnings"
          ? r.warnings.length > 0
          : filter === "published"
            ? !!r.university.published
            : true,
  );
  return (
    <>
      <PageHeading
        title="جاهزية البيانات"
        description="ما المكتمل وما الناقص في كل جامعة. الأساسيات تحدد هل الجامعة جاهزة للنشر، والباقي يجعل صفحتها أغنى."
      />
      <div className="readiness-summary">
        {[
          ["all", "كل الجامعات", list.length],
          ["published", "منشورة", counts.published],
          ["ready", "جاهزة للنشر", counts.ready],
          ["incomplete", "تنقصها أساسيات", counts.incomplete],
          ["warnings", "منشورة وبها تنبيه", counts.warnings],
        ].map(([key, label, n]) => (
          <button
            key={String(key)}
            className={"ws-stat" + (filter === key ? " active" : "")}
            aria-pressed={filter === key}
            onClick={() => setFilter(String(key))}
          >
            <span>{label}</span>
            <strong>{n}</strong>
          </button>
        ))}
      </div>
      {!shown.length ? (
        <Empty title="لا توجد جامعات في هذا التصنيف" />
      ) : (
        <ul className="readiness-list">
          {shown.map((r) => {
            const state = rowState(r.university);
            const missingCore = r.checks.filter((c) => c.core && !c.ok);
            const missingExtra = r.checks.filter((c) => !c.core && !c.ok);
            return (
              <li key={r.university.id} className="panel">
                <div className="readiness-head">
                  <div>
                    <strong>{String(r.university.name)}</strong>{" "}
                    <span className={"badge " + state.cls}>{state.label}</span>{" "}
                    {r.ready ? (
                      <span className="badge st-new">
                        <CheckCircle2 size={13} /> الأساسيات مكتملة
                      </span>
                    ) : (
                      <span className="badge st-review">ينقصها {missingCore.length} من الأساسيات</span>
                    )}
                    <small className="block muted">
                      {r.counts.programs} تخصص ({r.counts.programsLive} منشور) · {r.counts.tracks} مسار ·{" "}
                      {r.counts.sections} قسم
                    </small>
                  </div>
                  <div className="readiness-score" title="نسبة اكتمال الملف">
                    <span className="meter" aria-hidden="true">
                      <i style={{ width: r.score + "%" }} />
                    </span>
                    <b dir="ltr">{r.score}%</b>
                    <Link className="btn secondary compact" to={"/admin/universities/" + r.university.id}>
                      <FolderOpen size={15} /> فتح
                    </Link>
                  </div>
                </div>
                {r.warnings.map((w) => (
                  <p className="notice" key={w}>
                    <AlertTriangle size={14} /> {w}
                  </p>
                ))}
                {missingCore.length > 0 && (
                  <div className="missing">
                    <small>أساسيات ناقصة:</small>
                    {missingCore.map((c) => (
                      <span className="chip warn" key={c.key} title={c.hint}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
                {missingExtra.length > 0 && (
                  <div className="missing">
                    <small>لإثراء الصفحة:</small>
                    {missingExtra.map((c) => (
                      <span className="chip" key={c.key} title={c.hint}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
