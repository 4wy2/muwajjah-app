-- 015: same permissions, evaluated once per query instead of once per row.
-- Supabase's performance check flagged 7 policies that call auth.uid() or
-- guide_is_owner()/guide_is_admin() directly; wrapping each call in
-- (select ...) lets Postgres compute it once. Who can read or write what
-- does not change. ALTER POLICY keeps each policy's command and roles.
-- Rollback: 015_rls_speed_rollback.sql restores the exact old expressions.
begin;
do $$ begin
 if to_regclass('public.guide_assignments') is not null then
  alter policy "Guide assignment read" on public.guide_assignments
   using (user_id = (select auth.uid()) or (select public.guide_is_owner()));
 end if;
 if to_regclass('public.guide_admins') is not null then
  alter policy "Guide admins read own membership" on public.guide_admins
   using (user_id = (select auth.uid()) or (select public.guide_is_owner()));
 end if;
 if to_regclass('public.guide_member_profiles') is not null then
  alter policy "Guide owner profile read" on public.guide_member_profiles
   using ((select public.guide_is_owner()) or user_id = (select auth.uid()));
 end if;
 if to_regclass('public.guide_plus_entitlements') is not null then
  alter policy "Guide own plus read" on public.guide_plus_entitlements
   using (user_id = (select auth.uid()) or (select public.guide_is_owner()));
 end if;
 if to_regclass('public.guide_student_profiles') is not null then
  alter policy "Guide student profile read" on public.guide_student_profiles
   using (user_id = (select auth.uid()) or (select public.guide_is_owner()));
  alter policy "Guide student profile insert" on public.guide_student_profiles
   with check (user_id = (select auth.uid()) and not (select public.guide_is_admin()));
  alter policy "Guide student profile update" on public.guide_student_profiles
   using (user_id = (select auth.uid()) and not (select public.guide_is_admin()))
   with check (user_id = (select auth.uid()) and not (select public.guide_is_admin()));
 end if;
end $$;
commit;
