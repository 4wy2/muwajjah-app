-- 014: owner-only site health summary for the admin "صحة الموقع" section.
-- Read-only: one function that counts and measures; it changes no data,
-- tables or permissions. Only the owner gets an answer; everyone else gets
-- a permission error. Rollback: 014_site_health_rollback.sql
begin;
create or replace function public.guide_owner_site_health()
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare result jsonb;
begin
 if not public.guide_is_owner() then
  raise exception 'المالك فقط يشوف صحة الموقع' using errcode = '42501';
 end if;
 select jsonb_build_object(
  'db_bytes', pg_database_size(current_database()),
  'users_total', (select count(*) from auth.users),
  'active_month', (select count(*) from auth.users where last_sign_in_at >= date_trunc('month', now())),
  'new_today', (select count(*) from auth.users where created_at >= date_trunc('day', now())),
  'new_week', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
  'new_month', (select count(*) from auth.users where created_at >= date_trunc('month', now())),
  'views', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'hits', h) order by d)
     from (select event_day d, sum(hits)::bigint h from public.guide_daily_interest
           where event_day >= current_date - 29 group by event_day) v), '[]'::jsonb),
  'views_month', coalesce((select sum(hits) from public.guide_daily_interest
     where event_day >= date_trunc('month', now())::date), 0),
  'universities', (select count(*) from public.guide_universities where deleted_at is null and published),
  'programs', (select count(*) from public.guide_programs where deleted_at is null),
  'programs_sourced', (select count(*) from public.guide_programs where deleted_at is null and coalesce(source_url, '') <> ''),
  'sections', (select count(*) from public.guide_sections where deleted_at is null),
  'sections_sourced', (select count(*) from public.guide_sections where deleted_at is null and coalesce(source_url, '') <> ''),
  'tracks', (select count(*) from public.guide_tracks where deleted_at is null),
  'tracks_published', (select count(*) from public.guide_tracks where deleted_at is null and published),
  'cutoffs', (select count(*) from public.guide_cutoffs where deleted_at is null and published),
  'private', (select private from public.guide_site_settings where singleton),
  'commercial', (select commercial_enabled from public.guide_offer_settings where singleton),
  'season_label', (select season_label from public.guide_offer_settings where singleton),
  'season_ends_at', (select season_ends_at from public.guide_offer_settings where singleton),
  'has_purchase_url', (select coalesce(purchase_url, '') <> '' from public.guide_offer_settings where singleton),
  'today', current_date
 ) into result;
 return result;
end $function$;
revoke all on function public.guide_owner_site_health() from public, anon;
grant execute on function public.guide_owner_site_health() to authenticated;
commit;
