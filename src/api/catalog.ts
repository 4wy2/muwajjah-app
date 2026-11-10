import { useQuery } from "@tanstack/react-query";
import { allRows, db, rpc } from "./client";
import type {
  University,
  Program,
  Track,
  Section,
  Cutoff,
  FeatureState,
} from "../lib/types";
export const getUniversities = () =>
  allRows<University>("guide_universities", (q) =>
    q.eq("published", true).is("deleted_at", null).order("name").order("id"),
  );
export const useCatalog = () =>
  useQuery({
    queryKey: ["catalog"],
    queryFn: getUniversities,
    staleTime: 300_000,
  });
export function useUniversity(id: string) {
  return useQuery({
    queryKey: ["university", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("guide_universities")
        .select("*")
        .eq("id", id)
        .eq("published", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as University | null;
    },
    enabled: !!id,
  });
}
export function useUniversityContent<T>(
  kind: "programs" | "tracks" | "sections",
  id: string,
) {
  return useQuery({
    queryKey: [kind, id],
    queryFn: () =>
      allRows<T>("guide_" + kind, (q) =>
        q
          .eq("university_id", id)
          .eq("published", true)
          .is("deleted_at", null)
          .order(kind === "sections" ? "display_order" : "name")
          .order("id"),
      ),
    enabled: !!id,
  });
}
export function useFeature(key: string, userId?: string) {
  return useQuery({
    queryKey: ["feature", key, userId || "guest"],
    queryFn: () =>
      rpc<FeatureState>("guide_feature_state", { target_feature: key }),
    // Re-checked when the tab regains focus or after login (invalidated in
    // Layout), not on a timer for every open tab.
    staleTime: 60_000,
  });
}
export function useCutoffs(id: string, allowed: boolean, userId?: string) {
  return useQuery({
    queryKey: ["cutoffs", id, userId || "guest"],
    queryFn: () =>
      allRows<Cutoff>("guide_cutoffs", (q) =>
        q
          .eq("university_id", id)
          .eq("published", true)
          .is("deleted_at", null)
          .order("academic_year", { ascending: false })
          .order("id"),
      ),
    enabled: allowed,
    staleTime: 0,
  });
}
const recorded = new Set<string>();
export async function interest(kind: "university" | "program", id: string) {
  const key = new Date().toISOString().slice(0, 10) + kind + id;
  if (recorded.has(key)) return;
  recorded.add(key);
  try {
    await rpc("guide_record_interest", { event_kind: kind, record_id: id });
  } catch {
    recorded.delete(key);
  }
}
export async function missingSearch(term: string) {
  if (term.length < 3 || term.length > 80 || /[@/:\\]|\d{6,}/.test(term))
    return;
  const key = new Date().toISOString().slice(0, 10) + term;
  if (recorded.has(key)) return;
  recorded.add(key);
  try {
    await rpc("guide_record_missing_search", { search_term: term });
  } catch {
    recorded.delete(key);
  }
}
export type { Program, Track, Section };
