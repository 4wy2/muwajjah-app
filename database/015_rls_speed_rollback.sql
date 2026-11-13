-- Undo 015: put back the policy expressions exactly as they were.
begin;
do $$ begin
 if to_regclass('public.guide_assignments') is not null then
  alter policy "Guide assignment read" on public.guide_assignments
   using (user_id = auth.uid() or (select public.guide_is_owner()));
 end if;
 if to_regclass('public.guide_admins') is not null then
  alter policy "Guide admins read own membership" on public.guide_admins
   using (user_id = auth.uid() or (select public.guide_is_owner()));
 end if;
 if to_regclass('public.guide_member_profiles') is not null then
  alter policy "Guide owner profile read" on public.guide_member_profiles
   using (public.guide_is_owner() or user_id = auth.uid());
 end if;
 if to_regclass('public.guide_plus_entitlements') is not null then
  alter policy "Guide own plus read" on public.guide_plus_entitlements
   using (user_id = auth.uid() or (select public.guide_is_owner()));
 end if;
 if to_regclass('public.guide_student_profiles') is not null then
  alter policy "Guide student profile read" on public.guide_student_profiles
   using (user_id = auth.uid() or (select public.guide_is_owner()));
  alter policy "Guide student profile insert" on public.guide_student_profiles
   with check (user_id = auth.uid() and not public.guide_is_admin());
  alter policy "Guide student profile update" on public.guide_student_profiles
   using (user_id = auth.uid() and not public.guide_is_admin())
   with check (user_id = auth.uid() and not public.guide_is_admin());
 end if;
end $$;
commit;
