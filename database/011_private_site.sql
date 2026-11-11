-- 011: الوضع الخاص (private site). مفتاح واحد في القاعدة يملكه المالك.
-- وهو شغّال: محتوى الجامعات لا يُقرأ إلا لأعضاء الفريق المفعّلين، والزائر
-- والطالب وأي سكربت لا يأخذون شيئًا (ولا عبر دوال البحث والمقارنة).
-- لا يحذف ولا ينقل أي بيانات. إضافي وقابل لإعادة التشغيل.
-- الرجوع: database/011_private_site_rollback.sql
begin;

create table if not exists public.guide_site_settings (
  singleton boolean primary key default true check (singleton),
  private boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.guide_site_settings (singleton, private) values (true, true)
  on conflict (singleton) do nothing;
alter table public.guide_site_settings enable row level security;
drop policy if exists "Site settings public read" on public.guide_site_settings;
create policy "Site settings public read" on public.guide_site_settings
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.guide_site_settings from anon, authenticated;
grant select on public.guide_site_settings to anon, authenticated;

create or replace function public.guide_site_private()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private from public.guide_site_settings where singleton), false)
$$;
grant execute on function public.guide_site_private() to anon, authenticated;

create or replace function public.guide_owner_set_private(make_private boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.guide_is_owner() then
    raise exception 'المالك فقط يقفل الموقع أو يفتحه' using errcode = '42501';
  end if;
  if make_private is null then raise exception 'الإعداد غير صحيح'; end if;
  update public.guide_site_settings set private = make_private, updated_at = now() where singleton;
  insert into public.guide_access_events (actor_id, action, note)
  values (auth.uid(), 'site_private', case when make_private then 'closed' else 'opened' end);
end $$;
revoke execute on function public.guide_owner_set_private(boolean) from anon, public;
grant execute on function public.guide_owner_set_private(boolean) to authenticated;

-- Restrictive read rule on every content table: ANDed with the existing rules,
-- so nothing else about who can read what changes.
do $$
declare t text;
begin
  foreach t in array array['guide_universities','guide_programs','guide_tracks','guide_sections','guide_cutoffs'] loop
    execute format('drop policy if exists "Guide private site" on public.%I', t);
    execute format('create policy "Guide private site" on public.%I as restrictive for select to anon, authenticated using ((select not public.guide_site_private()) or (select public.guide_is_admin()))', t);
  end loop;
end $$;

-- Server-side search/compare run with owner rights (they skip table rules),
-- so they read the switch through the feature state: hidden while private.
create or replace function public.guide_feature_state(target_feature text)
returns text language sql stable security definer set search_path = '' as $$
 select case
  when public.guide_site_private() and not public.guide_is_admin() then 'hidden'
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
    and (not public.guide_site_private() or public.guide_is_admin())
  group by p.university_id
$$;

commit;
