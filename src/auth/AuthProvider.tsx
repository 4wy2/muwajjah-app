import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { db, queryClient, allRows } from "../api/client";
import type { Member } from "../lib/types";
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  error: unknown;
  recovering: boolean;
}>({ user: null, loading: true, error: null, recovering: false });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    user: null as User | null,
    loading: true,
    error: null as unknown,
    recovering: false,
  });
  useEffect(() => {
    let active = true;
    let current: string | undefined;
    let first = true;
    const sync = (user: User | null, recovery = false) => {
      if (!active) return;
      // Clear on a real account switch only, not on the first check at page
      // load: that would throw away the restored public content cache.
      if (!first && current !== user?.id) queryClient.clear();
      current = user?.id;
      first = false;
      setState((s) => ({
        user,
        loading: false,
        error: null,
        recovering: recovery || s.recovering,
      }));
    };
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, session) => {
      sync(session?.user || null, event === "PASSWORD_RECOVERY");
      if (event === "SIGNED_OUT")
        setState((s) => ({ ...s, recovering: false }));
      if (event === "USER_UPDATED")
        void queryClient.invalidateQueries({ queryKey: ["profile"] });
    });
    db.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setState((s) => ({ ...s, loading: false, error }));
        else sync(data.session?.user || null);
      })
      .catch((error) => {
        if (active) setState((s) => ({ ...s, loading: false, error }));
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
export function useMember() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["member", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("guide_admins")
        .select("user_id,is_owner,is_enabled,can_edit,can_publish,can_delete")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Member | null;
    },
  });
}
export function useAssignments() {
  const { user } = useAuth();
  const member = useMember();
  return useQuery({
    queryKey: ["assignments", user?.id],
    enabled: !!user && !!member.data?.is_enabled && !member.data?.is_owner,
    queryFn: () =>
      allRows<{ university_id: string }>("guide_assignments", (q) =>
        q.eq("user_id", user!.id).order("university_id"),
      ),
  });
}
