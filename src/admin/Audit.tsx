import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db, rpc } from "../api/client";
import { useAuth, useMember } from "../auth/AuthProvider";
import { PageHeading, Loading, ErrorState, Empty } from "../components/ui";
import { specs } from "./specs";
import type { ContentKind } from "../lib/types";

interface Entry {
  id: number;
  changed_at: string;
  actor_email: string | null;
  table_name: string;
  row_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}
const PAGE = 40;
const IGNORED = new Set(["created_at"]);
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

// Owner-only review of guide_audit_log. Shows exactly what the database
// recorded; history from before the log existed is not reconstructed.
export default function Audit() {
  const member = useMember().data!;
  const [table, setTable] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(0);
  const { user } = useAuth();
  // Names of the people who edit: the team directory, plus the owner's own name.
  const people = useQuery({
    queryKey: ["audit-names"],
    enabled: member.is_owner,
    queryFn: async () => {
      const names = new Map<string, string>();
      const team = await rpc<{ email: string; display_name: string }[]>("guide_team_directory").catch(() => []);
      for (const t of team || []) if (t.email) names.set(t.email.toLowerCase(), t.display_name || t.email);
      const me = user?.user_metadata as { guide_name?: string; full_name?: string; name?: string } | undefined;
      const myName = (me?.guide_name || me?.full_name || me?.name || "").trim();
      if (user?.email) names.set(user.email.toLowerCase(), myName ? myName + " (أنت)" : "أنت");
      return names;
    },
  });
  const who = (email: string | null) => (email ? people.data?.get(email.toLowerCase()) || email : "النظام");
  const q = useQuery({
    queryKey: ["audit", table, actor, page, people.isSuccess],
    enabled: member.is_owner,
    queryFn: async () => {
      let r = db
        .from("guide_audit_log")
        .select("*", { count: "exact" })
        .order("changed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (table) r = r.eq("table_name", table);
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
  if (!member.is_owner) return <Empty title="سجل التغييرات متاح للمالك فقط" />;
  return (
    <>
      <PageHeading
        title="سجل التغييرات"
        description="من عدّل، ماذا عدّل، ومتى. يعرض ما سجّلته القاعدة فقط."
      />
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
    </>
  );
}
