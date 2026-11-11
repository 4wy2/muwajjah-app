import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  ArchiveRestore,
  Search,
  Download,
  FolderOpen,
  EyeOff,
  Eye,
  Rocket,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useMember } from "../auth/AuthProvider";
import {
  useAdminRows,
  saveRecord,
  changeState,
  describeState,
  invalidateContent,
  publishUniversityWithContent,
  describePublish,
  assertUnchanged,
} from "../api/admin";
import { specs, sanitize, fieldValueLabels, rowLabel } from "./specs";
import {
  Modal,
  Confirm,
  Field,
  PageHeading,
  Loading,
  ErrorState,
  Empty,
  useToast,
  useDebounce,
} from "../components/ui";
import { friendly, normalize, downloadJson } from "../lib/utils";
import type { ContentKind, Row } from "../lib/types";
const EXCLUDABLE: ContentKind[] = ["programs", "tracks", "sections"];
export function rowState(r: Row) {
  if (r.deleted_at) return { key: "trash", label: "في السلة", cls: "trash" };
  if (r.published) return { key: "published", label: "منشور", cls: "published" };
  if (r.publication_excluded)
    return { key: "excluded", label: "مخفي يدويًا", cls: "excluded" };
  return { key: "draft", label: "مسودة", cls: "" };
}
const actionLabels: Record<string, string> = {
  publish: "نشر",
  draft: "إخفاء عن الطلاب",
  unpublish: "إلغاء النشر",
  include: "إعادة إدراج (يُنشر مع الجامعة لاحقًا)",
  trash: "نقل للسلة",
  restore: "استعادة",
  publish_all: "نشر الجامعة ومحتواها",
};
export default function ContentManager({
  kind,
  universityLock,
}: {
  kind: ContentKind;
  universityLock?: string;
}) {
  return (
    <Manager
      key={kind + (universityLock || "")}
      kind={kind}
      universityLock={universityLock}
    />
  );
}
function Manager({
  kind,
  universityLock,
}: {
  kind: ContentKind;
  universityLock?: string;
}) {
  const excludable = EXCLUDABLE.includes(kind);
  const q = useAdminRows(kind);
  const universities = useAdminRows("universities");
  const member = useMember().data!;
  const spec = specs[kind];
  const [search, setSearch] = useState("");
  const term = useDebounce(search);
  const [status, setStatus] = useState("active");
  const [universityFilter, setUniversityId] = useState("");
  const universityId = universityLock || universityFilter;
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [action, setAction] = useState<{
    ids: string[];
    action: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  // Unsaved edits: warn before closing the form or leaving the page.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const closeForm = () => {
    if (busy) return;
    if (dirty && !window.confirm("عندك تعديلات ما انحفظت. تبي تقفل بدون حفظ؟")) return;
    setDirty(false);
    setEditing(undefined);
  };
  const [page, setPage] = useState(0);
  const toast = useToast();
  const edit = member.is_owner || member.can_edit;
  const publish = member.is_owner || member.can_publish;
  const remove = member.is_owner || member.can_delete;
  const rows = useMemo(
    () =>
      (q.data || []).filter(
        (r) =>
          (status === "trash" ? !!r.deleted_at : !r.deleted_at) &&
          (status === "active" ||
            status === "trash" ||
            rowState(r).key === status) &&
          (!universityId ||
            (kind === "universities" ? r.id : r.university_id) ===
              universityId) &&
          normalize(rowLabel(r)).includes(normalize(term)),
      ),
    [q.data, status, universityId, term],
  );
  const visible = rows.slice(page * 25, page * 25 + 25);
  const reset = () => {
    setSelected([]);
    setPage(0);
  };
  return (
    <>
      <PageHeading
        title={universityLock ? "" : spec.label}
        description={
          universityLock ? "" : "راجع المحتوى وحدّثه قبل نشره للطلاب."
        }
      >
        <div className="actions">
          <button
            className="btn secondary compact"
            disabled={!q.data}
            onClick={() =>
              downloadJson("muwajjah-" + kind + ".json", { [kind]: q.data })
            }
          >
            <Download size={16} /> تصدير
          </button>
          {edit &&
          (kind !== "universities" || (member.is_owner && !universityLock)) ? (
            <button
              className="btn primary compact"
              onClick={() => {
                setEditing(null);
                setFormError("");
              }}
            >
              <Plus size={17} /> إضافة {spec.singular}
            </button>
          ) : null}
        </div>
      </PageHeading>
      <div className="panel">
        <div className="admin-filters">
          <div className="input-icon">
            <Search size={17} />
            <input
              aria-label="بحث في المحتوى"
              value={search}
              placeholder="ابحث في السجلات…"
              onChange={(e) => {
                setSearch(e.target.value);
                reset();
              }}
            />
          </div>
          <select
            aria-label="حالة النشر"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              reset();
            }}
          >
            <option value="active">كل السجلات</option>
            <option value="published">منشور</option>
            <option value="draft">مسودة</option>
            {excludable && <option value="excluded">مخفي يدويًا</option>}
            <option value="trash">سلة المحذوفات</option>
          </select>
          {kind !== "universities" && !universityLock && (
            <select
              aria-label="تصفية حسب الجامعة"
              value={universityId}
              onChange={(e) => {
                setUniversityId(e.target.value);
                reset();
              }}
            >
              <option value="">كل الجامعات المسندة</option>
              {universities.data
                ?.filter((u) => !u.deleted_at)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {String(u.name)}
                  </option>
                ))}
            </select>
          )}
        </div>
        {selected.length > 0 && (
          <div className="bulk-bar">
            <strong>{selected.length} سجل محدد</strong>
            {publish && status !== "trash" && (
              <>
                <button
                  onClick={() =>
                    setAction({ ids: selected, action: "publish" })
                  }
                >
                  نشر المحدد
                </button>
                <button
                  onClick={() =>
                    setAction({
                      ids: selected,
                      action: excludable ? "draft" : "unpublish",
                    })
                  }
                >
                  {excludable ? "إخفاء عن الطلاب" : "إلغاء النشر"}
                </button>
                {excludable && (
                  <button
                    onClick={() =>
                      setAction({ ids: selected, action: "include" })
                    }
                  >
                    إعادة إدراج
                  </button>
                )}
              </>
            )}
            {remove && (
              <button
                onClick={() =>
                  setAction({
                    ids: selected,
                    action: status === "trash" ? "restore" : "trash",
                  })
                }
              >
                {status === "trash" ? "استعادة" : "حذف"} المحدد
              </button>
            )}
          </div>
        )}
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="لا توجد سجلات مطابقة" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="تحديد الصفحة"
                        checked={
                          visible.length > 0 &&
                          visible.every((r) => selected.includes(r.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [
                                  ...new Set([
                                    ...selected,
                                    ...visible.map((r) => r.id),
                                  ]),
                                ]
                              : selected.filter(
                                  (id) => !visible.some((r) => r.id === id),
                                ),
                          )
                        }
                      />
                    </th>
                    <th>الاسم</th>
                    {kind !== "universities" && !universityLock && (
                      <th>الجامعة</th>
                    )}
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={"تحديد " + rowLabel(r)}
                          checked={selected.includes(r.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, r.id]
                                : selected.filter((id) => id !== r.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>{rowLabel(r)}</strong>
                        {kind === "universities" && (
                          <small className="block muted">
                            {String(r.city || "")}
                          </small>
                        )}
                      </td>
                      {kind !== "universities" && !universityLock && (
                        <td>
                          {String(
                            universities.data?.find(
                              (u) => u.id === r.university_id,
                            )?.name || "—",
                          )}
                        </td>
                      )}
                      <td>
                        <span className={"badge " + rowState(r).cls}>
                          {rowState(r).label}
                        </span>
                      </td>
                      <td>
                        <div className="actions">
                          {kind === "universities" && !r.deleted_at && (
                            <Link
                              className="icon-btn"
                              aria-label={"فتح مساحة عمل " + rowLabel(r)}
                              title="مساحة عمل الجامعة"
                              to={"/admin/universities/" + r.id}
                            >
                              <FolderOpen size={16} />
                            </Link>
                          )}
                          {kind === "universities" &&
                            publish &&
                            edit &&
                            !r.deleted_at && (
                              <button
                                className="icon-btn"
                                title="نشر الجامعة ومحتواها"
                                aria-label={"نشر الجامعة ومحتواها: " + rowLabel(r)}
                                onClick={() =>
                                  setAction({ ids: [r.id], action: "publish_all" })
                                }
                              >
                                <Rocket size={16} />
                              </button>
                            )}
                          {/* The database only lets publishers edit published rows. */}
                          {edit && !r.deleted_at && (publish || !r.published) && (
                            <button
                              className="icon-btn"
                              aria-label={"تعديل " + rowLabel(r)}
                              onClick={() => {
                                setEditing(r);
                                setFormError("");
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {publish &&
                            !r.deleted_at &&
                            (rowState(r).key === "excluded" ? (
                              <button
                                className="icon-btn"
                                title="إعادة إدراج"
                                aria-label={"إعادة إدراج " + rowLabel(r)}
                                onClick={() =>
                                  setAction({ ids: [r.id], action: "include" })
                                }
                              >
                                <Eye size={16} />
                              </button>
                            ) : (
                              <button
                                className="icon-btn"
                                title={
                                  r.published
                                    ? excludable
                                      ? "إخفاء عن الطلاب"
                                      : "إلغاء النشر"
                                    : "نشر"
                                }
                                aria-label={
                                  (r.published ? "إلغاء نشر " : "نشر ") +
                                  rowLabel(r)
                                }
                                onClick={() =>
                                  setAction({
                                    ids: [r.id],
                                    action: r.published
                                      ? excludable
                                        ? "draft"
                                        : "unpublish"
                                      : "publish",
                                  })
                                }
                              >
                                {r.published ? (
                                  <EyeOff size={16} />
                                ) : (
                                  <Upload size={16} />
                                )}
                              </button>
                            ))}
                          {remove && (
                            <button
                              className="icon-btn"
                              aria-label={
                                (r.deleted_at ? "استعادة " : "حذف ") +
                                rowLabel(r)
                              }
                              onClick={() =>
                                setAction({
                                  ids: [r.id],
                                  action: r.deleted_at ? "restore" : "trash",
                                })
                              }
                            >
                              {r.deleted_at ? (
                                <ArchiveRestore size={16} />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                className="btn secondary compact"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                السابق
              </button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(rows.length / 25))} ·{" "}
                {rows.length} سجل
              </span>
              <button
                className="btn secondary compact"
                disabled={(page + 1) * 25 >= rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </button>
            </div>
          </>
        )}
      </div>
      <Modal
        open={editing !== undefined}
        title={(editing ? "تعديل " : "إضافة ") + spec.singular}
        onClose={closeForm}
      >
        {editing !== undefined && (
          <form
            key={editing?.id || "new"}
            onInput={() => setDirty(true)}
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setFormError("");
              const raw = Object.fromEntries(new FormData(e.currentTarget));
              if (editing && kind !== "universities")
                raw.university_id = String(editing.university_id);
              setBusy(true);
              try {
                const payload = sanitize(kind, raw);
                if (editing) await assertUnchanged(kind, editing, Object.keys(payload));
                await saveRecord(kind, payload, editing?.id);
                await invalidateContent();
                setDirty(false);
                setEditing(undefined);
                toast("تم حفظ السجل");
              } catch (err) {
                setFormError(friendly(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              {kind !== "universities" && universityLock && (
                <input type="hidden" name="university_id" value={universityLock} />
              )}
              {kind !== "universities" && !universityLock && (
                <Field label="الجامعة">
                  <select
                    name="university_id"
                    required
                    disabled={!!editing}
                    defaultValue={String(
                      editing?.university_id || universityId,
                    )}
                  >
                    <option value="">اختر الجامعة</option>
                    {universities.data
                      ?.filter((u) => !u.deleted_at)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {String(u.name)}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              {spec.fields.map((f) => (
                <Field key={f.key} label={f.label + (f.required ? " *" : "")}>
                  {f.type === "textarea" ? (
                    <textarea
                      name={f.key}
                      defaultValue={String(editing?.[f.key] ?? f.default ?? "")}
                      required={f.required}
                      rows={4}
                      maxLength={f.key === "content" ? 10000 : 20000}
                    />
                  ) : f.type === "select" ? (
                    <select
                      name={f.key}
                      defaultValue={String(editing?.[f.key] ?? f.default ?? "")}
                    >
                      {f.options?.map((o) => (
                        <option key={o} value={o}>
                          {fieldValueLabels[o] || o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={f.key}
                      type={f.type || "text"}
                      required={f.required}
                      min={f.min}
                      max={f.max}
                      step={f.key === "display_order" ? 1 : "0.01"}
                      defaultValue={String(editing?.[f.key] ?? f.default ?? "")}
                      dir={
                        ["url", "number", "date"].includes(f.type || "")
                          ? "ltr"
                          : undefined
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
            {formError && (
              <p role="alert" className="notice error">
                {formError}
              </p>
            )}
            <p className="muted small">
              السجلات الجديدة تُحفظ كمسودة. النشر من قائمة الإجراءات.
            </p>
            <button className="btn primary" disabled={busy}>
              {busy ? "جارٍ الحفظ…" : "حفظ المحتوى"}
            </button>
          </form>
        )}
      </Modal>
      <Confirm
        open={!!action}
        title="تأكيد الإجراء"
        body={
          action?.action === "publish_all"
            ? "ستُنشر الجامعة مع تخصصاتها ومساراتها وأقسامها غير المخفية يدويًا. المسارات الناقصة تبقى مسودة، والنسب السابقة لا تُنشر تلقائيًا."
            : `سيُطبق الإجراء (${actionLabels[action?.action || ""] || ""}) على ${action?.ids.length || 0} سجل.` +
              (action?.action === "trash"
                ? " النقل للسلة قابل للاستعادة، ويُخفي السجل عن الطلاب."
                : action?.action === "draft"
                  ? " لن يعود للظهور عند إعادة نشر الجامعة حتى تعيد إدراجه."
                  : action?.action === "restore"
                    ? " يعود السجل مخفيًا؛ أعد إدراجه أو انشره عندما يكون جاهزًا."
                    : "")
        }
        busy={busy}
        onClose={() => setAction(null)}
        onConfirm={async () => {
          if (!action) return;
          setBusy(true);
          try {
            if (action.action === "publish_all") {
              const report = await publishUniversityWithContent(action.ids[0]);
              toast(describePublish(report));
              setAction(null);
            } else {
              const serverAction =
                action.action === "unpublish" ? "draft" : action.action;
              const result = await changeState(kind, action.ids, serverAction);
              const ok = !result.failed.length;
              toast(describeState(result, action.ids.length), !ok);
              // Keep only the failed records selected so a retry touches nothing else.
              setSelected(result.failed);
              setAction(null);
            }
          } catch (err) {
            toast(friendly(err), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
