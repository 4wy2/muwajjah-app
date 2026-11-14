import { friendly } from "../lib/utils";
import { useQuery } from "@tanstack/react-query";
import { allRows, db, rpc, queryClient } from "./client";
import { useAuth, useMember, useAssignments } from "../auth/AuthProvider";
import type { ContentKind, Row } from "../lib/types";
export function useAdminRows(kind: ContentKind) {
  const { user } = useAuth();
  const member = useMember();
  const assignments = useAssignments();
  return useQuery({
    queryKey: [
      "admin",
      kind,
      user?.id,
      assignments.data?.map((x) => x.university_id).join(","),
    ],
    enabled:
      !!member.data?.is_enabled &&
      (member.data.is_owner || assignments.isSuccess),
    queryFn: () => {
      if (!member.data?.is_owner && !assignments.data?.length)
        return Promise.resolve([]);
      return allRows<Row>("guide_" + kind, (q) => {
        q = q.order("created_at", { ascending: false }).order("id");
        if (!member.data?.is_owner)
          q = q.in(
            kind === "universities" ? "id" : "university_id",
            assignments.data!.map((x) => x.university_id),
          );
        return q;
      });
    },
  });
}
export async function invalidateContent() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin"] }),
    queryClient.invalidateQueries({ queryKey: ["catalog"] }),
    ...["university", "programs", "tracks", "sections", "cutoffs"].map((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    ),
  ]);
}
export async function saveRecord(
  kind: ContentKind,
  payload: Record<string, unknown>,
  id?: string,
) {
  if (id) {
    // Edits go through a POST function (database/008) instead of PATCH:
    // some browsers, extensions and antivirus tools block PATCH requests.
    // The function runs with the user's own rights, so every rule still applies.
    const { data, error } = await db.rpc("guide_update_record", {
      target_kind: kind,
      record_id: id,
      changes: payload,
    });
    if (error) throw error;
    if (!data) throw new Error("لم يُحفظ السجل. تحقق من صلاحيتك وحدّث الصفحة.");
    return { id: data as string };
  }
  const { data, error } = await db
    .from("guide_" + kind)
    .insert({ ...payload, published: false })
    .select("id");
  if (error) throw error;
  if (data?.length !== 1)
    throw new Error("لم يُحفظ السجل. تحقق من صلاحيتك وحدّث الصفحة.");
  return data[0];
}
export interface StateResult {
  done: string[];
  failed: string[];
  message?: string;
}
// Every batch is attempted; the result lists which ids really changed so the UI
// can report partial success and retry only the failed ones.
export async function changeState(
  kind: ContentKind,
  ids: string[],
  action: string,
): Promise<StateResult> {
  const done: string[] = [];
  const failed: string[] = [];
  let message: string | undefined;
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const rows = await rpc<Row[]>("guide_change_record_state", {
        target_table: "guide_" + kind,
        target_ids: batch,
        target_action: action,
      });
      const changed = new Set((rows || []).map((r) => r.id));
      for (const id of batch) (changed.has(id) ? done : failed).push(id);
    } catch (e) {
      failed.push(...batch);
      message = friendly(e);
    }
  }
  await invalidateContent();
  return { done, failed, message };
}
export function describeState(r: StateResult, total: number) {
  if (!r.failed.length) return `تم تحديث ${r.done.length} سجل`;
  return (
    `نُفّذ الإجراء على ${r.done.length} من ${total} سجل. ` +
    `تعذر ${r.failed.length}: ` +
    (r.message || "قد تكون حالتها تغيّرت، أو أن الجامعة غير منشورة، أو أنها خارج صلاحيتك.")
  );
}
export interface PublishReport {
  programs: number;
  tracks: number;
  sections: number;
  pending_tracks: number;
  hidden: number;
}
// Publishes the university and its non-excluded content in one server
// transaction (guide_publish_university_with_content). Cutoffs are untouched.
export async function publishUniversityWithContent(id: string) {
  const report = await rpc<PublishReport>(
    "guide_publish_university_with_content",
    { target_id: id },
  );
  await invalidateContent();
  return report;
}
export function describePublish(r: PublishReport) {
  const parts = [
    `نُشرت الجامعة مع ${r.programs} تخصص و${r.tracks} مسار و${r.sections} قسم جديد.`,
  ];
  if (r.pending_tracks)
    parts.push(
      `بقي ${r.pending_tracks} مسار مسودة لأن رابط المصدر أو تاريخ التحقق ناقص، أو لأن أوزانه لا تساوي 100% ولا توجد له شروط نصية.`,
    );
  if (r.hidden)
    parts.push(`لم يُنشر ${r.hidden} عنصر مخفي يدويًا، كما طلبت.`);
  parts.push("النسب السابقة لا تُنشر تلقائيًا.");
  return parts.join(" ");
}
// Inserts drafts in chunks; when a chunk fails, its rows are retried one by
// one so a single bad record never blocks the rest. Returns per-row outcome.
export async function insertDrafts(
  kind: ContentKind,
  payloads: { key: string; payload: Record<string, unknown> }[],
  onProgress?: (done: number) => void,
) {
  const ok: string[] = [];
  const failed: { key: string; error: unknown }[] = [];
  for (let i = 0; i < payloads.length; i += 50) {
    const chunk = payloads.slice(i, i + 50);
    const { error } = await db
      .from("guide_" + kind)
      .insert(chunk.map((c) => ({ ...c.payload, published: false })));
    // An insert is atomic: no error means every row of the chunk was written.
    if (!error) ok.push(...chunk.map((c) => c.key));
    else
      for (const c of chunk) {
        try {
          await saveRecord(kind, c.payload);
          ok.push(c.key);
        } catch (e) {
          failed.push({ key: c.key, error: e });
        }
      }
    onProgress?.(ok.length + failed.length);
  }
  return { ok, failed };
}
// Before saving an edit, make sure nobody changed the same fields since the
// form was opened; otherwise their change would be overwritten silently.
export function changedSince(
  opened: Record<string, unknown>,
  current: Record<string, unknown>,
  fields: string[],
): string[] {
  const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return fields.filter((f) => f in current && norm(opened[f]) !== norm(current[f]));
}
export async function assertUnchanged(
  kind: ContentKind,
  opened: Row,
  fields: string[],
) {
  const { data, error } = await db
    .from("guide_" + kind)
    .select(fields.join(","))
    .eq("id", opened.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("السجل ما عاد موجود. حدّث الصفحة.");
  const changed = changedSince(opened, data as unknown as Record<string, unknown>, fields);
  if (changed.length)
    throw new Error(
      "عدّل شخص آخر هذا السجل بعد ما فتحته. انسخ تعديلاتك، وحدّث الصفحة، ثم أعد المحاولة.",
    );
}
