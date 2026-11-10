import { useState } from "react";
import { UploadCloud, Check, FileJson } from "lucide-react";
import { useMember } from "../auth/AuthProvider";
import { useAdminRows, saveRecord, invalidateContent } from "../api/admin";
import { specs } from "./specs";
import { parseImport, makeDiff, type Diff } from "./import";
import {
  PageHeading,
  Field,
  Empty,
  Confirm,
  useToast,
  ErrorState,
} from "../components/ui";
import type { ContentKind } from "../lib/types";
import { friendly, downloadJson } from "../lib/utils";
export default function Importer() {
  const member = useMember().data!;
  const [kind, setKind] = useState<ContentKind>("universities");
  const existing = useAdminRows(kind);
  const unis = useAdminRows("universities");
  const [diff, setDiff] = useState<Diff[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);
  const toast = useToast();
  if (!member.is_owner && !member.can_edit)
    return <Empty title="ليس لديك إذن استيراد المحتوى" />;
  return (
    <>
      <PageHeading
        title="استيراد البيانات"
        description="ارفع الملف، راجع الفروقات، ثم اختر السجلات التي تريد اعتمادها."
      />
      <section className="panel">
        <div className="import-controls">
          <Field label="نوع المحتوى">
            <select
              value={kind}
              disabled={busy}
              onChange={(e) => {
                setKind(e.target.value as ContentKind);
                setDiff([]);
                setFileName("");
                setError("");
                setFailures([]);
              }}
            >
              {Object.entries(specs).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <button
            className="btn secondary"
            onClick={() =>
              downloadJson("muwajjah-" + kind + "-template.json", {
                [kind]: [
                  {
                    ...(kind === "universities"
                      ? {}
                      : { university_id: "ضع معرّف الجامعة" }),
                    ...Object.fromEntries(
                      specs[kind].fields.map((f) => [
                        f.key,
                        f.default ??
                          (f.type === "number"
                            ? 0
                            : f.type === "date"
                              ? null
                              : ""),
                      ]),
                    ),
                  },
                ],
              })
            }
          >
            <FileJson size={17} /> تنزيل قالب JSON
          </button>
        </div>
        <label className="upload-zone">
          <UploadCloud size={34} />
          <strong>{fileName || "اختر ملف JSON أو CSV"}</strong>
          <span>حتى 5 ميجابايت · 2000 سجل</span>
          <input
            aria-label="رفع ملف الاستيراد"
            type="file"
            accept=".json,.csv"
            disabled={
              busy ||
              existing.isPending ||
              unis.isPending ||
              !!existing.error ||
              !!unis.error
            }
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError("");
              setDiff([]);
              setSelected([]);
              setFileName(file.name);
              setProgress("");
              try {
                if (file.size > 5 * 1024 * 1024)
                  throw new Error("حجم الملف أكبر من 5 ميجابايت.");
                const rows = parseImport(await file.text(), file.name, kind);
                const result = makeDiff(
                  kind,
                  rows,
                  existing.data || [],
                  unis.data || [],
                ).map((d) =>
                  !member.is_owner &&
                  kind === "universities" &&
                  d.status === "new"
                    ? {
                        ...d,
                        status: "error" as const,
                        error: "إضافة جامعة جديدة متاحة للمالك فقط.",
                      }
                    : d,
                );
                setDiff(result);
                setSelected(
                  result
                    .filter((d) => ["new", "changed"].includes(d.status))
                    .map((d) => d.key),
                );
              } catch (err) {
                setError(friendly(err));
              }
              e.target.value = "";
            }}
          />
        </label>
        {(existing.error || unis.error) && (
          <ErrorState
            error={existing.error || unis.error}
            retry={() => {
              void existing.refetch();
              void unis.refetch();
            }}
          />
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {diff.length > 0 && (
          <>
            <div className="import-summary">
              {[
                ["new", "جديد"],
                ["changed", "معدّل"],
                ["same", "مطابق"],
                ["error", "بحاجة لمراجعة"],
              ].map(([s, label]) => (
                <span className="badge" key={s}>
                  {label}: {diff.filter((d) => d.status === s).length}
                </span>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>اعتماد</th>
                    <th>السجل</th>
                    <th>التغيير</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((d) => (
                    <tr key={d.key}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={"استيراد " + d.name}
                          disabled={
                            busy || !["new", "changed"].includes(d.status)
                          }
                          checked={selected.includes(d.key)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, d.key]
                                : selected.filter((x) => x !== d.key),
                            )
                          }
                        />
                      </td>
                      <td>
                        {d.name}
                        <small className="block">
                          {d.status === "new"
                            ? "سجل جديد"
                            : d.status === "same"
                              ? "دون تغيير"
                              : d.status === "changed"
                                ? "تحديث"
                                : "خطأ"}
                        </small>
                      </td>
                      <td>
                        {d.error ? (
                          <span className="error-text">{d.error}</span>
                        ) : d.changes.length ? (
                          <details>
                            <summary>{d.changes.length} حقل مختلف</summary>
                            {d.changes.map((c) => (
                              <div className="diff-item" key={c.field}>
                                <b>
                                  {specs[kind].fields.find(
                                    (f) => f.key === c.field,
                                  )?.label || c.field}
                                </b>
                                <del>{String(c.before ?? "—")}</del>
                                <ins>{String(c.after ?? "—")}</ins>
                              </div>
                            ))}
                          </details>
                        ) : (
                          <Check size={18} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              لن يُحذف محتوى أثناء الاستيراد. السجلات الجديدة تُنشأ كمسودات،
              وحالة نشر السجلات الحالية تبقى كما هي.
            </p>
            <button
              className="btn primary"
              disabled={busy || selected.length === 0}
              onClick={() => setConfirm(true)}
            >
              اعتماد {selected.length} سجل
            </button>
            <p role="status">{progress}</p>
            {failures.length > 0 && (
              <div className="import-failures" role="alert">
                <strong>لم تُحفظ {failures.length} سجلات:</strong>
                <ul>
                  {failures.map((f, i) => (
                    <li key={i}>
                      <b>{f.name || "سجل بدون اسم"}</b>: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
      <Confirm
        open={confirm}
        busy={busy}
        title="اعتماد الاستيراد"
        body={`سيتم حفظ ${selected.length} سجلًا. راجع الفروقات قبل المتابعة. لا تدعم القاعدة الحالية التراجع الجماعي عن الاستيراد.`}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          setConfirm(false);
          setError("");
          setFailures([]);
          const chosen = diff.filter((d) => selected.includes(d.key));
          const completed: string[] = [];
          const failed: { name: string; reason: string }[] = [];
          try {
            // Each record is saved on its own: one bad row is reported with
            // its reason and does not stop the rest.
            for (const d of chosen) {
              try {
                await saveRecord(kind, d.payload, d.id);
                completed.push(d.key);
              } catch (err) {
                failed.push({ name: d.name, reason: friendly(err) });
              }
              setProgress(
                `تمت معالجة ${completed.length + failed.length} من ${chosen.length}`,
              );
            }
            if (!failed.length) {
              toast("اكتمل الاستيراد: " + completed.length + " سجل");
              setDiff([]);
              setFileName("");
            } else {
              toast(
                `نجح ${completed.length} وفشل ${failed.length} من ${chosen.length}. السجلات الفاشلة باقية محددة لإعادة المحاولة.`,
                true,
              );
              setFailures(failed);
            }
          } finally {
            setSelected((s) => s.filter((x) => !completed.includes(x)));
            setDiff((ds) =>
              ds.map((d) =>
                completed.includes(d.key)
                  ? { ...d, status: "same", changes: [] }
                  : d,
              ),
            );
            await invalidateContent();
            setBusy(false);
          }
        }}
      />
    </>
  );
}
