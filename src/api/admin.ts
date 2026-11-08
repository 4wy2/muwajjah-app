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
  const q = id
    ? db
        .from("guide_" + kind)
        .update(payload)
        .eq("id", id)
    : db.from("guide_" + kind).insert({ ...payload, published: false });
  const { data, error } = await q.select("id");
  if (error) throw error;
  if (data?.length !== 1)
    throw new Error("لم يُحفظ السجل. تحقق من صلاحيتك وحدّث الصفحة.");
  return data[0];
}
export async function changeState(
  kind: ContentKind,
  ids: string[],
  action: string,
) {
  let done = 0;
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const batch = ids.slice(i, i + 50);
      const rows = await rpc<Row[]>("guide_change_record_state", {
        target_table: "guide_" + kind,
        target_ids: batch,
        target_action: action,
      });
      done += rows.length;
      if (rows.length !== batch.length)
        throw new Error("بعض السجلات غير متاحة أو تغيّرت حالتها.");
    } catch (e) {
      await invalidateContent();
      throw new Error(
        `نُفّذ الإجراء على ${done} من ${ids.length} سجل. ` +
          ((e as Error).message || "راجع صلاحياتك."),
      );
    }
  }
  await invalidateContent();
  return done;
}
