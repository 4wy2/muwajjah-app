import { createClient } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { projectConfig } from "../lib/config";
const env = import.meta.env;
export const db = createClient(
  env.VITE_SUPABASE_URL || projectConfig.url,
  env.VITE_SUPABASE_ANON_KEY || projectConfig.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      retry: 1,
      refetchOnWindowFocus: true,
      // Offline: fail and show the retry message instead of loading forever.
      networkMode: "always",
    },
    mutations: { retry: false, networkMode: "always" },
  },
});
export async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data as T;
}
// Pagination prevents silent truncation at Supabase's default row limit.
export async function allRows<T>(
  table: string,
  configure: (q: any) => any = (q) => q,
  columns = "*",
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const { data, error } = await configure(
      db.from(table).select(columns),
    ).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
  throw new Error("عدد السجلات كبير جدًا. ضيّق نطاق البحث.");
}
