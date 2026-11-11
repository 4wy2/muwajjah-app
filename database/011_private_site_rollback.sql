-- Rollback 011: site always public again, as before 011.
begin;
do $$
declare t text;
begin
  foreach t in array array['guide_universities','guide_programs','guide_tracks','guide_sections','guide_cutoffs'] loop
    execute format('drop policy if exists "Guide private site" on public.%I', t);
  end loop;
end $$;
create or replace function public.guide_feature_state(target_feature text)
returns text language sql stable security definer set search_path = '' as $$
 select case
  when f.access_mode='free' then 'free'
  when f.access_mode='members' and auth.uid() is not null then 'free'
  when f.access_mode='members' then 'login'
  when f.access_mode='plus' and auth.uid() is not null and public.guide_has_plus() then 'plus'
  when f.access_mode='plus' and f.show_offer then 'locked'
  else 'hidden'
 end
 from public.guide_feature_flags f where f.feature_key=target_feature
$$;
create or replace function public.guide_public_program_counts()
returns table(university_id uuid, program_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.university_id, count(*)::bigint
  from public.guide_programs p join public.guide_universities u on u.id=p.university_id
  where p.published and p.deleted_at is null and u.published and u.deleted_at is null
  group by p.university_id
$$;
drop function if exists public.guide_owner_set_private(boolean);
drop function if exists public.guide_site_private();
drop table if exists public.guide_site_settings;
commit;
