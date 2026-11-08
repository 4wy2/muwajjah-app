import { useEffect, useMemo, useState } from "react";
import { UploadCloud, FileJson, RotateCcw } from "lucide-react";
import { useMember } from "../auth/AuthProvider";
import { useAdminRows, saveRecord, insertDrafts, invalidateContent } from "../api/admin";
import { Field, useToast, ErrorState, Loading } from "../components/ui";
import { friendly, downloadJson } from "../lib/utils";
import { specs } from "./specs";
import {
  parseBundle,
  previewBundle,
  universityMatches,
  statusLabels,
  CHILD_KINDS,
  BUNDLE_FORMAT,
  type Bundle,
  type MergeMode,
  type PreviewRow,
} from "./bundle";
import type { Row } from "../lib/types";

const actionable = (r: PreviewRow) => ["new", "changed", "review"].includes(r.status);
const fieldLabel = (kind: string, key: string) =>
  specs[kind as keyof typeof specs]?.fields.find((f) => f.key === key)?.label || key;
const show = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return s.length > 90 ? s.slice(0, 90) + "…" : s || "—";
};

export function bundleTemplate(name = "اسم الجامعة") {
  return {
    format: BUNDLE_FORMAT,
    university: {
      name,
      city: "",
      region: "",
      type: "",
      description: "",
      housing_status: "unknown",
      housing_note: "",
      website_url: "",
    },
    programs: [{ name: "", college: "", degree: "", gender: "", campus: "", page: "" }],
    tracks: [
      { name: "مسار موزون", academic_year: "", gender: "", school_weight: 30, aptitude_weight: 30, achievement_weight: 40, requirements: "", page: "" },
      { name: "مسار نصي (مثل SAT)", academic_year: "", school_weight: 0, aptitude_weight: 0, achievement_weight: 0, requirements: "الشروط كما وردت", page: "" },
    ],
    sections: [{ title: "التصنيف", content: "", page: "" }],
    cutoffs: [{ program_name: "", academic_year: "", gender: "", ratio: 0, page: "" }],
    source: { url: "" },
    uncertain: [{ note: "معلومة لم تتأكد منها", page: "" }],
  };
}

export default function BundleImporter({ university }: { university: Row }) {
  const member = useMember().data!;
  const toast = useToast();
  const programs = useAdminRows("programs");
  const tracks = useAdminRows("tracks");
  const sections = useAdminRows("sections");
  const cutoffs = useAdminRows("cutoffs");
  const queries = { programs, tracks, sections, cutoffs };
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<MergeMode>("fill");
  const [srcUrl, setSrcUrl] = useState("");
  const [reviewed, setReviewed] = useState("");
  const [applySource, setApplySource] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [outcome, setOutcome] = useState<{ saved: number; failed: { name: string; message: string }[] } | null>(null);
  const loading = Object.values(queries).some((q) => q.isPending);
  const loadError = Object.values(queries).find((q) => q.error)?.error;
  const preview = useMemo(() => {
    if (!bundle) return [];
    const of = (q: { data?: Row[] }) => (q.data || []).filter((r) => r.university_id === university.id);
    return previewBundle(
      bundle,
      university,
      { programs: of(programs), tracks: of(tracks), sections: of(sections), cutoffs: of(cutoffs) },
      mode,
      { url: srcUrl.trim(), reviewed_on: reviewed, apply: applySource && !!srcUrl.trim() },
    );
  }, [bundle, university, programs.data, tracks.data, sections.data, cutoffs.data, mode, srcUrl, reviewed, applySource]);
  // Pre-select confirmed new/changed rows once per uploaded file; uncertain
  // rows stay unselected until the owner ticks them deliberately.
  useEffect(() => {
    setSelected(
      new Set(preview.filter((r) => r.status === "new" || r.status === "changed").map((r) => r.key)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);
  const nameOk = !bundle || universityMatches(bundle.university.name, university.name);
  if (!member.is_owner && !member.can_edit)
    return <p className="muted">ليست لديك صلاحية تعديل هذه الجامعة.</p>;
  if (loadError) return <ErrorState error={loadError} />;
  if (loading) return <Loading />;
  const counts = (k: PreviewRow["status"]) => preview.filter((r) => r.status === k).length;
  const toSave = preview.filter((r) => selected.has(r.key) && actionable(r));
  const run = async () => {
    setBusy(true);
    setOutcome(null);
    let saved = 0;
    const failed: { name: string; message: string }[] = [];
    try {
      for (const kind of ["universities", ...CHILD_KINDS] as const) {
        const rows = toSave.filter((r) => r.kind === kind);
        const updates = rows.filter((r) => r.id);
        const inserts = rows.filter((r) => !r.id);
        for (const r of updates) {
          setProgress(`تحديث ${specs[kind].label}: ${r.name}`);
          try {
            await saveRecord(kind, r.payload, r.id);
            saved++;
          } catch (e) {
            failed.push({ name: r.name, message: friendly(e) });
          }
        }
        if (inserts.length) {
          setProgress(`إضافة ${specs[kind].label}…`);
          const res = await insertDrafts(
            kind,
            inserts.map((r) => ({ key: r.key, payload: r.payload })),
            (n) => setProgress(`إضافة ${specs[kind].label}: ${n} / ${inserts.length}`),
          );
          saved += res.ok.length;
          for (const f of res.failed)
            failed.push({ name: inserts.find((r) => r.key === f.key)!.name, message: friendly(f.error) });
        }
      }
    } finally {
      await invalidateContent();
      setBusy(false);
      setProgress("");
      setSelected(new Set());
      setOutcome({ saved, failed });
      toast(
        failed.length
          ? `حُفظ ${saved} وتعذر ${failed.length}. المعاينة محدّثة؛ ما حُفظ صار «مطابق»، وأعد المحاولة للمتبقي فقط.`
          : `حُفظ ${saved} سجل كمسودات. راجعها ثم انشر الجامعة ومحتواها.`,
        !!failed.length,
      );
    }
  };
  return (
    <div className="bundle">
      <p className="muted small">
        ارفع ملف JSON واحدًا لهذه الجامعة (الصيغة {BUNDLE_FORMAT} أو v1 القديمة). لا يُنشر شيء
        بالرفع: الجديد يُحفظ مسودة، والتحديثات تُطبّق فقط على ما تختاره. ملف PDF لا يُرفع هنا؛
        استخرج منه JSON أولًا.
      </p>
      <div className="import-controls">
        <label className="upload-zone compact">
          <UploadCloud size={24} />
          <strong>{fileName || "اختر ملف الجامعة (JSON)"}</strong>
          <span>حتى 5 ميجابايت</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError("");
              setOutcome(null);
              setConfirmed(false);
              try {
                if (file.size > 5 * 1024 * 1024) throw new Error("حجم الملف أكبر من 5 ميجابايت.");
                const b = parseBundle(await file.text());
                setBundle(b);
                setFileName(file.name);
                setSrcUrl(b.source.url);
                setApplySource(!!b.source.url);
                setReviewed("");
                setSelected(new Set());
              } catch (err) {
                setBundle(null);
                setError(friendly(err));
              }
            }}
          />
        </label>
        <button
          className="btn secondary compact"
          onClick={() => downloadJson("muwajjah-university-template.json", bundleTemplate(String(university.name)))}
        >
          <FileJson size={16} /> قالب الملف
        </button>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {bundle && (
        <>
          {bundle.converted_from && (
            <p className="notice">حُوّل الملف من الصيغة {bundle.converted_from}. راجع كل الحقول قبل الاعتماد.</p>
          )}
          {bundle.warnings.map((w) => (
            <p className="notice" key={w}>{w}</p>
          ))}
          {!nameOk && (
            <label className="notice error choice">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              اسم الجامعة في الملف «{String(bundle.university.name)}» لا يطابق «{String(university.name)}». أؤكد أن
              الملف يخص هذه الجامعة.
            </label>
          )}
          <div className="form-grid bundle-options">
            <Field label="طريقة التحديث للسجلات الموجودة">
              <select value={mode} onChange={(e) => setMode(e.target.value as MergeMode)}>
                <option value="fill">ملء الفارغ فقط (آمن)</option>
                <option value="replace">استبدال القيم المختلفة</option>
              </select>
            </Field>
            <Field label="رابط مصدر الملف (اختياري)">
              <input dir="ltr" type="url" value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} />
            </Field>
            <Field label="تاريخ مراجعتك البشرية (اختياري)">
              <input dir="ltr" type="date" value={reviewed} onChange={(e) => setReviewed(e.target.value)} />
            </Field>
            <label className="choice">
              <input
                type="checkbox"
                checked={applySource}
                disabled={!srcUrl.trim()}
                onChange={(e) => setApplySource(e.target.checked)}
              />
              طبّق رابط المصدر والتاريخ على السجلات التي ليس لها مصدر
            </label>
          </div>
          <p className="muted small">
            القيم الفارغة في الملف لا تمسح بياناتك أبدًا. تاريخ إنشاء الملف لا يُعتبر تاريخ تحقق؛ اتركه
            فارغًا ما لم تراجع المعلومات بنفسك. أرقام صفحات PDF تظهر في المعاينة فقط ولا تُحفظ.
          </p>
          <div className="import-summary">
            {(["new", "changed", "review", "same", "trashed", "error"] as const).map((s) => (
              <span className={"badge st-" + s} key={s}>
                {statusLabels[s]}: {counts(s)}
              </span>
            ))}
          </div>
          {bundle.uncertain.length > 0 && (
            <details className="uncertain" open>
              <summary>معلومات غير مؤكدة في الملف ({bundle.uncertain.length}) — لا تُحفظ</summary>
              <ul>
                {bundle.uncertain.map((u, i) => (
                  <li key={i}>
                    {u.note}
                    {u.page && <small> · صفحة {u.page}</small>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {(["universities", ...CHILD_KINDS] as const).map((kind) => {
            const rows = preview.filter((r) => r.kind === kind);
            if (!rows.length) return null;
            const act = rows.filter(actionable);
            return (
              <details className="bundle-kind" key={kind} open={act.length > 0 || rows.some((r) => r.status === "error")}>
                <summary>
                  {kind === "universities" ? "بيانات الجامعة" : specs[kind].label} ({rows.length})
                  {act.length > 0 && (
                    <button
                      type="button"
                      className="text-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        const all = act.every((r) => selected.has(r.key));
                        const next = new Set(selected);
                        act.forEach((r) => (all ? next.delete(r.key) : next.add(r.key)));
                        setSelected(next);
                      }}
                    >
                      {act.every((r) => selected.has(r.key)) ? "إلغاء التحديد" : "تحديد الكل"}
                    </button>
                  )}
                </summary>
                <ul className="bundle-rows">
                  {rows.map((r) => (
                    <li key={r.key} className={"st-" + r.status}>
                      <label className="choice">
                        <input
                          type="checkbox"
                          disabled={!actionable(r) || busy}
                          checked={selected.has(r.key)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(r.key);
                            else next.delete(r.key);
                            setSelected(next);
                          }}
                        />
                        <strong>{r.name}</strong>
                      </label>
                      <span className={"badge st-" + r.status}>{statusLabels[r.status]}</span>
                      {r.page && <small className="muted">صفحة {r.page}</small>}
                      {r.message && <small className="row-msg">{r.message}</small>}
                      {r.note && <small className="muted">{r.note}</small>}
                      {r.changes.length > 0 && (
                        <ul className="changes">
                          {r.changes.map((c) => (
                            <li key={c.field}>
                              {fieldLabel(r.kind, c.field)}: <del>{show(c.before)}</del> ← <ins>{show(c.after)}</ins>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
          <div className="bundle-actions">
            <button
              className="btn primary"
              disabled={busy || !toSave.length || (!nameOk && !confirmed)}
              onClick={run}
            >
              {busy ? progress || "جارٍ الحفظ…" : `اعتماد ${toSave.length} سجل كمسودات/تحديثات`}
            </button>
            {outcome?.failed.length ? (
              <span className="muted small">
                <RotateCcw size={14} /> حدّد المتبقي في المعاينة وأعد الاعتماد؛ ما حُفظ لن يتكرر.
              </span>
            ) : null}
          </div>
          {outcome && outcome.failed.length > 0 && (
            <div className="notice error">
              <strong>تعذر حفظ {outcome.failed.length}:</strong>
              <ul>
                {outcome.failed.slice(0, 30).map((f, i) => (
                  <li key={i}>
                    {f.name}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
