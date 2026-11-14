import { uniPath } from "../lib/slugs";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Eye, Rocket } from "lucide-react";
import { useMember } from "../auth/AuthProvider";
import {
  useAdminRows,
  publishUniversityWithContent,
  describePublish,
} from "../api/admin";
import { Loading, ErrorState, Empty, Confirm, useToast } from "../components/ui";
import { friendly } from "../lib/utils";
import { BASE } from "../lib/config";
import ContentManager, { rowState } from "./ContentManager";
import BundleImporter from "./BundleImporter";
import type { ContentKind, Row } from "../lib/types";

const tabs: [string, string][] = [
  ["info", "بيانات الجامعة"],
  ["programs", "التخصصات"],
  ["tracks", "مسارات القبول"],
  ["sections", "الأقسام"],
  ["cutoffs", "النسب السابقة"],
  ["import", "استيراد ملف الجامعة"],
];

function Counts({ rows }: { rows: Row[] }) {
  const live = rows.filter((r) => !r.deleted_at);
  const n = (k: string) => live.filter((r) => rowState(r).key === k).length;
  if (!rows.length) return <small className="muted">لا يوجد</small>;
  return (
    <small className="ws-counts">
      <span className="badge published">{n("published")} منشور</span>
      {n("draft") > 0 && <span className="badge">{n("draft")} مسودة</span>}
      {n("excluded") > 0 && <span className="badge excluded">{n("excluded")} مخفي</span>}
      {rows.length - live.length > 0 && <span className="badge trash">{rows.length - live.length} في السلة</span>}
    </small>
  );
}

// One place for everything that belongs to a university: its data, content,
// publication state and whole-file import.
export default function UniversityWorkspace() {
  const { id = "" } = useParams();
  const member = useMember().data!;
  const toast = useToast();
  const universities = useAdminRows("universities");
  const kinds: ContentKind[] = ["programs", "tracks", "sections", "cutoffs"];
  const content = {
    programs: useAdminRows("programs"),
    tracks: useAdminRows("tracks"),
    sections: useAdminRows("sections"),
    cutoffs: useAdminRows("cutoffs"),
  };
  const [tab, setTab] = useState("info");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (universities.isPending) return <Loading />;
  if (universities.error)
    return <ErrorState error={universities.error} retry={() => universities.refetch()} />;
  const uni = universities.data?.find((u) => u.id === id);
  if (!uni)
    return (
      <Empty title="الجامعة غير موجودة أو غير مسندة إليك">
        <Link to="/admin/universities">العودة للجامعات</Link>
      </Empty>
    );
  const of = (k: keyof typeof content) =>
    (content[k].data || []).filter((r) => r.university_id === id);
  const canPublish = (member.is_owner || (member.can_publish && member.can_edit)) && !uni.deleted_at;
  const state = rowState(uni);
  return (
    <div className="ws">
      <Link to="/admin/universities" className="ws-back">
        <ArrowRight size={15} /> كل الجامعات
      </Link>
      <header className="ws-head">
        <div>
          <h1>{String(uni.name)}</h1>
          <span className={"badge " + state.cls}>{state.label}</span>
        </div>
        <div className="actions">
          {uni.published && !uni.deleted_at ? (
            <a className="btn secondary compact" href={BASE + uniPath(id)} target="_blank" rel="noreferrer">
              <Eye size={16} /> كما يراها الطالب
            </a>
          ) : (
            <a className="btn secondary compact" href={BASE + uniPath(id) + "?preview=1"} target="_blank" rel="noreferrer">
              <Eye size={16} /> معاينة قبل النشر
            </a>
          )}
          {canPublish && (
            <button className="btn primary compact" onClick={() => setConfirm(true)}>
              <Rocket size={16} /> نشر الجامعة ومحتواها
            </button>
          )}
        </div>
      </header>
      <div className="ws-summary">
        {kinds.map((k) => (
          <button key={k} className="ws-stat" onClick={() => setTab(k)}>
            <span>{tabs.find(([t]) => t === k)![1]}</span>
            {content[k as keyof typeof content].isPending ? (
              <small className="muted">…</small>
            ) : (
              <Counts rows={of(k as keyof typeof content)} />
            )}
          </button>
        ))}
      </div>
      <nav className="ws-tabs" aria-label="أقسام مساحة عمل الجامعة">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="ws-body">
        {tab === "info" ? (
          <ContentManager kind="universities" universityLock={id} />
        ) : tab === "import" ? (
          <BundleImporter university={uni} />
        ) : (
          <ContentManager kind={tab as ContentKind} universityLock={id} />
        )}
      </div>
      <Confirm
        open={confirm}
        title="نشر الجامعة ومحتواها"
        body="ستُنشر الجامعة مع تخصصاتها ومساراتها وأقسامها غير المخفية يدويًا. المسارات الناقصة تبقى مسودة، والمحذوف والمخفي لا يعود، والنسب السابقة لا تُنشر تلقائيًا."
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const r = await publishUniversityWithContent(id);
            toast(describePublish(r));
            setConfirm(false);
          } catch (e) {
            toast(friendly(e), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
