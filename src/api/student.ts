import { useOffer } from "./commerce";
import { useMutation, useQuery } from "@tanstack/react-query";
import { allRows, db, queryClient, rpc } from "./client";
import { useAuth } from "../auth/AuthProvider";
import type { Favorite, Score } from "../lib/types";
export function useFavorites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["favorites", user?.id],
    enabled: !!user,
    queryFn: () =>
      allRows<Favorite>("guide_student_favorites", (q) =>
        q
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .order("id"),
      ),
  });
}
export function useToggleFavorite() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      kind,
      id,
      existing,
    }: {
      kind: "university" | "program";
      id: string;
      existing?: Favorite;
    }) => {
      if (!user) throw new Error("سجّل دخولك لحفظ المفضلة.");
      const req = existing
        ? db
            .from("guide_student_favorites")
            .delete()
            .eq("id", existing.id)
            .eq("user_id", user.id)
        : db
            .from("guide_student_favorites")
            .insert({ user_id: user.id, [kind + "_id"]: id });
      const { error } = await req;
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["favorites", user?.id] }),
  });
}
export function useScores() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["scores", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("guide_student_scores")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Score[];
    },
  });
}
export async function saveScore(score: Omit<Score, "id" | "created_at">) {
  const { error } = await db.from("guide_student_scores").insert(score);
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: ["scores", score.user_id] });
}
export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("guide_student_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as { display_name: string };
      const membership = await db
        .from("guide_admins")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (membership.error) throw membership.error;
      if (membership.data) return null;
      const display_name = String(
        user!.user_metadata?.guide_student_name ||
          user!.user_metadata?.full_name ||
          user!.user_metadata?.name ||
          "طالب",
      )
        .trim()
        .slice(0, 100);
      const created = await db
        .from("guide_student_profiles")
        .upsert(
          {
            user_id: user!.id,
            display_name: display_name.length >= 2 ? display_name : "طالب",
          },
          { onConflict: "user_id", ignoreDuplicates: true },
        )
        .select("display_name")
        .maybeSingle();
      if (created.error) throw created.error;
      return created.data as { display_name: string } | null;
    },
  });
}
export function usePlus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["plus", user?.id],
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from("guide_plus_entitlements")
        .select("expires_at,starts_at,source")
        .eq("user_id", user!.id)
        .is("revoked_at", null)
        .lte("starts_at", now)
        .gt("expires_at", now)
        .order("expires_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] as
        | { expires_at: string; starts_at: string; source: string }
        | undefined;
    },
  });
}
// The subscription surface is shown only when it has meaning for this user:
// they already hold Plus (granted manually by the owner), or the owner has
// switched on the public offer for some feature (state "locked"). During the
// silent free launch both are false, so no pricing/plus hints appear.
// Names of the features that are Plus right now (state "locked" for others,
// "plus" for holders), so offers never mention a hidden or free feature.
const PLUS_LABELS: Record<string, string> = {
  program_search: "البحث بالتخصص في كل الجامعات",
  comparison: "مقارنة الجامعات",
  historical_cutoffs: "نسب القبول السابقة (تقديرية)",
};
export function usePlusFeatures(): string[] {
  const { user } = useAuth();
  const states = useQuery({
    queryKey: ["commercial-states", user?.id || "guest"],
    staleTime: 60_000,
    queryFn: () => featureStates(),
  });
  const keys = Object.keys(PLUS_LABELS);
  return keys
    .filter((_, i) => states.data?.[i] === "locked" || states.data?.[i] === "plus")
    .map((k) => PLUS_LABELS[k]);
}
const featureStates = () =>
  Promise.all(
    Object.keys(PLUS_LABELS).map((k) =>
      rpc<string>("guide_feature_state", { target_feature: k }).catch(() => "hidden"),
    ),
  );
export function useCommercialVisible() {
  const { user } = useAuth();
  const plus = usePlus();
  const states = useQuery({
    queryKey: ["commercial-states", user?.id || "guest"],
    staleTime: 60_000,
    queryFn: () => featureStates(),
  });
  const offer = useOffer();
  return (
    !!plus.data ||
    !!offer.data?.commercial_enabled ||
    !!states.data?.includes("locked")
  );
}

// Requires database/004_student_score_delete.sql (delete policy). Without it
// RLS silently matches no row, so report that instead of a false success.
export async function deleteScore(id: string) {
  const { data, error } = await db
    .from("guide_student_scores")
    .delete()
    .eq("id", id)
    .select("id, user_id");
  if (error?.code === "42501" || (!error && !data?.length))
    throw new Error("حذف النتائج غير مفعّل بعد. يحتاج تحديث القاعدة 004.");
  if (error) throw error;
  if (!data?.length)
    throw new Error("حذف النتائج غير مفعّل بعد. يحتاج تحديث القاعدة 004.");
  await queryClient.invalidateQueries({ queryKey: ["scores", data[0].user_id] });
}
