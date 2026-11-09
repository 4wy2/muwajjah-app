import { useQuery } from "@tanstack/react-query";
import { db, rpc } from "./client";

export interface OfferSettings {
  commercial_enabled: boolean;
  season_label: string;
  price_text: string;
  purchase_url: string;
  season_ends_at: string | null;
  note: string;
}

// Requires database/005_commerce.sql. Before it exists the offer reads as off,
// so the site stays in its silent free mode instead of breaking.
export function useOffer() {
  return useQuery({
    queryKey: ["offer"],
    staleTime: 60_000,
    queryFn: async (): Promise<OfferSettings | null> => {
      const { data, error } = await db
        .from("guide_offer_settings")
        .select(
          "commercial_enabled,season_label,price_text,purchase_url,season_ends_at,note",
        )
        .maybeSingle();
      if (error) return null;
      return data as OfferSettings | null;
    },
  });
}

export interface ProgramHit {
  program_id: string;
  program_name: string;
  college: string;
  degree: string;
  gender: string;
  campus: string;
  university_id: string;
  university_name: string;
  city: string;
}

export function useProgramSearch(term: string, enabled: boolean) {
  return useQuery({
    queryKey: ["program-search", term],
    enabled: enabled && term.trim().length >= 2,
    staleTime: 60_000,
    queryFn: () =>
      rpc<ProgramHit[]>("guide_search_programs", {
        search_query: term.trim(),
        max_rows: 120,
      }),
  });
}

// A payment made in the store before the student signed up is attached to the
// confirmed email; claiming is idempotent and silent when nothing is pending.
export async function claimPendingPlus(): Promise<number> {
  try {
    return (await rpc<number>("guide_claim_pending_plus")) || 0;
  } catch {
    return 0;
  }
}
