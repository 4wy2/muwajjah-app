import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db, rpc } from "../api/client";
import { useAuth, useMember } from "../auth/AuthProvider";
import { PageHeading, Loading, ErrorState, Empty, Confirm, useToast } from "../components/ui";
import { useAdminRows } from "../api/admin";
import { friendly } from "../lib/utils";
import { specs } from "./specs";
import type { ContentKind } from "../lib/types";

interface Entry {
  id: number;
  changed_at: string;
  actor_id?: string | null;
  actor_email: string | null;
  table_name: string;
  row_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}
const PAGE = 40;
const IGNORED = new Set(["created_at", "updated_at"]);
// The university a log entry belongs to (the row itself for universities).
const uniOf = (e: Entry) =>
  e.table_name === "guide_universities"
    ? e.row_id
    : String((e.after_data || e.before_data || {}).university_id || "");
const kindOf = (t: string) => t.replace(/^guide_/, "") as ContentKind;
const label = (t: string) => specs[kindOf(t)]?.label || t;
const fieldLabel = (t: string, k: string) =>
  specs[kindOf(t)]?.fields.find((f) => f.key === k)?.label ||
  ({ published: "النشر", deleted_at: "السلة", publication_excluded: "الإخفاء اليدوي" } as Record<string, string>)[k] ||
  k;
const nameOf = (e: Entry) => {
  const d = e.after_data || e.before_data || {};
  return String(d.name || d.title || d.program_name || String(e.row_id || "").slice(0, 8));
};
// Describe what an UPDATE did in owner language, based only on what was stored.
function describe(e: Entry) {
  if (e.action === "INSERT") return "إضافة";
  if (e.action === "DELETE") return "حذف نهائي";
  const b = e.before_data || {};
  const a = e.after_data || {};
  if (!b.deleted_at && a.deleted_at) return "نقل للسلة";
  if (b.deleted_at && !a.deleted_at) return "استعادة من السلة";
  if (!b.published && a.published) return "نشر";
  if (b.published && !a.published) return a.publication_excluded ? "إخفاء يدوي" : "إلغاء نشر";
  if (b.publication_excluded && !a.publication_excluded) return "إعادة إدراج";
  return "تعديل";
}
function changed(e: Entry) {
  if (e.action !== "UPDATE") return [];
  const b = e.before_data || {};
  const a = e.after_data || {};
  return Object.keys(a).filter(
    (k) => !IGNORED.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
}
const short = (v: unknown) => {
  const s = v === null || v === undefined || v === "" ? "—" : String(v);
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
};

// Review of guide_audit_log: the owner sees everything, a partner sees what
// they and their team changed (the database decides which rows come back).
// Shows exactly what was recorded; older history is not reconstructed.
export default function Audit() {
  const member = useMember().data!;
  const [table, setTable] = useState("");
  const [actor, setActor] = useState("");
  const [uni, setUni] = useState("");
  const [page, setPage] = useState(0);
  const [undoing, setUndoing] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const allowed = member.is_owner || !!member.is_partner;
  const unis = useAdminRows("universities");
  const uniName = (id: string) => String(unis.data?.find((u) => u.id === id)?.name || "");
  const { user } = useAuth();
  // Names of the people who edit: the team directory, plus the owner's own name.
  const people = useQuery({
    queryKey: ["audit-names", member.is_owner],
    enabled: allowed,
    queryFn: async () => {
      const names = new Map<string, string>();
      const team = await rpc<{ email: string; display_name: string }[]>(
        member.is_owner ? "guide_team_directory" : "guide_partner_team",
      ).catch(() => []);
      for (const t of team || []) if (t.email) names.set(t.email.toLowerCase(), t.display_name || t.email);
      const me = user?.user_metadata as { guide_name?: string; full_name?: string; name?: string } | undefined;
      const myName = (me?.guide_name || me?.full_name || me?.name || "").trim();
      if (user?.email) names.set(user.email.toLowerCase(), myName ? myName + " (أنت)" : "أنت");
      return names;
    },
  });
  const who = (email: string | null) => (email ? people.data?.get(email.toLowerCase()) || email : "النظام");
  const q = useQuery({
    queryKey: ["audit", table, actor, uni, page, people.isSuccess],
    enabled: allowed,
    queryFn: async () => {
      let r = db
        .from("guide_audit_log")
        .select("*", { count: "exact" })
        .order("changed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (table) r = r.eq("table_name", table);
      if (uni)
        r = r.or(
          `row_id.eq.${uni},after_data->>university_id.eq.${uni},before_data->>university_id.eq.${uni}`,
        );
      const text = actor.trim();
      if (text) {
        // Match the typed text against names too, not only emails.
        const byName = [...(people.data || [])]
          .filter(([, n]) => n.includes(text))
          .map(([e]) => '"' + e.replace(/"/g, "") + '"');
        const like = "actor_email.ilike.*" + text.replace(/[,()*]/g, "") + "*";
        r = byName.length ? r.or(like + ",actor_email.in.(" + byName.join(",") + ")") : r.ilike("actor_email", "%" + text + "%");
      }
      const { data, error, count } = await r;
      if (error) throw error;
      return { rows: (data || []) as Entry[], count: count || 0 };
    },
  });
  // Last 7 days, per person: how many changes and in how many universities.
  const week = useQuery({
    queryKey: ["audit-week"],
    enabled: allowed,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await db
        .from("guide_audit_log")
        .select("actor_email,table_name,row_id,a:after_data->>university_id,b:before_data->>university_id")
        .gte("changed_at", since)
        .limit(5000);
      if (error) throw error;
      return data as { actor_email: string | null; table_name: string; row_id: string; a: string | null; b: string | null }[];
    },
  });
  const summary = useMemo(() => {
    const by = new Map<string, { n: number; unis: Set<string> }>();
    for (const r of week.data || []) {
      const k = r.actor_email || "";
      const s = by.get(k) || { n: 0, unis: new Set<string>() };
      s.n++;
      const u = r.table_name === "guide_universities" ? r.row_id : r.a || r.b;
      if (u) s.unis.add(u);
      by.set(k, s);
    }
    return [...by.entries()].sort((x, y) => y[1].n - x[1].n);
  }, [week.data]);
  // Put back the values from before an edit, only if nothing changed them since.
  async function undo(e: Entry) {
    const fields = changed(e);
    const { data: now, error } = await db.from(e.table_name).select(fields.join(",")).eq("id", e.row_id).maybeSingle();
    if (error) throw error;
    if (!now) throw new Error("السجل ما عاد موجود، أو ما عندك صلاحية عليه.");
    const cur = now as unknown as Record<string, unknown>;
    if (fields.some((k) => JSON.stringify(cur[k] ?? null) !== JSON.stringify(e.after_data?.[k] ?? null)))
      throw new Error("انعدّل هذا السجل بعد هالتعديل. تراجع عن التعديلات الأحدث أول.");
    const patch = Object.fromEntries(fields.map((k) => [k, e.before_data?.[k] ?? null]));
    const { data: done, error: err2 } = await db.from(e.table_name).update(patch).eq("id", e.row_id).select("id");
    if (err2) throw err2;
    if (!done?.length) throw new Error("ما عندك صلاحية تعدّل هذا السجل.");
  }
  if (!allowed) return <Empty title="سجل التغييرات متاح للمالك والشركاء فقط" />;
  return (
    <>
      <PageHeading
        title="سجل التغييرات"
        description={
          member.is_owner
            ? "من عدّل، ماذا عدّل، ومتى. يعرض ما سجّلته القاعدة فقط."
            : "تعديلاتك وتعديلات فريقك: مين عدّل، وش عدّل، ومتى."
        }
      />
      {summary.length > 0 && (
        <section className="panel audit-summary">
          <h2>آخر 7 أيام</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الشخص</th>
                  <th>التعديلات</th>
                  <th>الجامعات</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(([email, s]) => (
                  <tr key={email}>
                    <td>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => {
                          setActor(email);
                          setPage(0);
                        }}
                      >
                        <bdi>{who(email || null)}</bdi>
                      </button>
                    </td>
                    <td>{s.n}</td>
                    <td>{s.unis.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="panel">
        <div className="admin-filters">
          <select
            aria-label="نوع المحتوى"
            value={table}
            onChange={(e) => {
              setTable(e.target.value);
              setPage(0);
            }}
          >
            <option value="">كل المحتوى</option>
            {(["universities", "programs", "tracks", "sections", "cutoffs"] as ContentKind[]).map((k) => (
              <option key={k} value={"guide_" + k}>
                {specs[k].label}
              </option>
            ))}
          </select>
          <select
            aria-label="الجامعة"
            value={uni}
            onChange={(e) => {
              setUni(e.target.value);
              setPage(0);
            }}
          >
            <option value="">كل الجامعات</option>
            {(unis.data || [])
              .filter((u) => !u.deleted_at)
              .map((u) => (
                <option key={String(u.id)} value={String(u.id)}>
                  {String(u.name)}
                </option>
              ))}
          </select>
          <input
            aria-label="اسم المعدِّل أو بريده"
            placeholder="اسم المعدِّل أو بريده"
            autoComplete="off"
            spellCheck={false}
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data.rows.length ? (
          <Empty title="لا توجد تغييرات مسجلة بهذه التصفية" />
        ) : (
          <>
            <ul className="audit-list">
              {q.data.rows.map((e) => {
                const fields = changed(e).filter(
                  (k) => !["published", "deleted_at", "publication_excluded"].includes(k),
                );
                return (
                  <li key={e.id}>
                    <div className="audit-head">
                      <strong>{describe(e)}</strong>
                      <span>
                        {label(e.table_name)}: {nameOf(e)}
                        {e.table_name !== "guide_universities" && uniName(uniOf(e)) && (
                          <small className="muted"> · {uniName(uniOf(e))}</small>
                        )}
                      </span>
                      <small className="muted">
                        <bdi title={e.actor_email || undefined}>{who(e.actor_email)}</bdi> ·{" "}
                        {new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          calendar: "gregory",
                        }).format(new Date(e.changed_at))}
                      </small>
                    </div>
                    {e.action === "UPDATE" && changed(e).length > 0 && (member.is_owner || member.can_edit) && (
                      <button type="button" className="text-btn audit-undo" onClick={() => setUndoing(e)}>
                        تراجع عن هذا التعديل
                      </button>
                    )}
                    {fields.length > 0 && (
                      <details>
                        <summary>{fields.length} حقل تغيّر</summary>
                        <ul className="changes">
                          {fields.map((k) => (
                            <li key={k}>
                              {fieldLabel(e.table_name, k)}: <del>{short(e.before_data?.[k])}</del> ←{" "}
                              <ins>{short(e.after_data?.[k])}</ins>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="pagination">
              <button className="btn secondary compact" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                الأحدث
              </button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(q.data.count / PAGE))}
              </span>
              <button
                className="btn secondary compact"
                disabled={(page + 1) * PAGE >= q.data.count}
                onClick={() => setPage((p) => p + 1)}
              >
                الأقدم
              </button>
            </div>
          </>
        )}
      </div>
      <Confirm
        open={!!undoing}
        busy={busy}
        title="تراجع عن التعديل"
        body={
          undoing
            ? `ترجع «${nameOf(undoing)}» مثل ما كان قبل تعديل ${who(undoing.actor_email)}؟ (${changed(undoing)
                .map((k) => fieldLabel(undoing.table_name, k))
                .join("، ")})`
            : ""
        }
        onClose={() => setUndoing(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await undo(undoing!);
            toast("رجع مثل ما كان");
            setUndoing(null);
            await Promise.all([q.refetch(), week.refetch()]);
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
