import { create } from "zustand";
import { persist } from "zustand/middleware";
export const usePreferences = create<{
  theme: "system" | "light" | "dark";
  setTheme: (theme: "system" | "light" | "dark") => void;
  comparison: string[];
  toggleCompare: (id: string) => boolean;
  clearComparison: () => void;
  setComparison: (ids: string[]) => void;
  recent: string[];
  addRecent: (id: string) => void;
  clearRecent: () => void;
  grades: string[] | null;
  setGrades: (g: string[]) => void;
}>()(
  persist(
    (set, get) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
      comparison: [],
      toggleCompare: (id) => {
        const items = get().comparison;
        if (items.includes(id)) {
          set({ comparison: items.filter((x) => x !== id) });
          return true;
        }
        if (items.length >= 3) return false;
        set({ comparison: [...items, id] });
        return true;
      },
      clearComparison: () => set({ comparison: [] }),
      setComparison: (ids) => set({ comparison: ids.slice(0, 3) }),
      // Kept on this device only; never sent anywhere.
      recent: [],
      addRecent: (id) =>
        set({ recent: [id, ...get().recent.filter((x) => x !== id)].slice(0, 8) }),
      clearRecent: () => set({ recent: [] }),
      // The last grades typed in the calculator, on this device only, so the
      // next university opens with them filled in.
      grades: null,
      setGrades: (g) => set({ grades: g.slice(0, 3).map((x) => String(x).slice(0, 8)) }),
    }),
    { name: "muwajjah-preferences-v2" },
  ),
);

// The upgrade sheet: opened from a locked feature (that feature leads) or
// from a general prompt (no feature).
export const useUpgradeSheet = create<{
  open: boolean;
  feature: string | null;
  show: (feature?: string | null) => void;
  hide: () => void;
}>()((set) => ({
  open: false,
  feature: null,
  show: (feature = null) => set({ open: true, feature }),
  hide: () => set({ open: false }),
}));
