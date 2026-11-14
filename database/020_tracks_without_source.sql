-- 020: let admission tracks be published before their source link and check
-- date are filled in. Students see the weights with a clear note asking them
-- to confirm on the university's official site. The weights rule stays: a
-- published track's three weights must add up to 100% (or all be zero).
-- Changes: the check constraint guide_track_publish_valid (source/date part
-- removed) and guide_publish_university_with_content (same condition removed).
-- Nothing is published by this file; publishing stays your action in the admin.
-- Backup: backup.guide_tracks_020 (id, published, source_url, verified_on).
-- Rollback: 020_tracks_without_source_rollback.sql
begin;
create schema if not exists backup;
create table if not exists backup.guide_tracks_020 as
  select id, published, source_url, verified_on from public.guide_tracks;
revoke all on backup.guide_tracks_020 from anon, authenticated;

alter table public.guide_tracks drop constraint if exists guide_track_publish_valid;
alter table public.guide_tracks add constraint guide_track_publish_valid check (
  not published
  or school_weight + aptitude_weight + achievement_weight = 0
  or abs(school_weight + aptitude_weight + achievement_weight - 100) <= 0.01
);

create or replace function public.guide_publish_university_with_content(target_id uuid)
returns jsonb language plpgsql set search_path to ''
as $function$
declare
  programs_count integer := 0;
  tracks_count integer := 0;
  sections_count integer := 0;
  pending_tracks integer := 0;
  hidden_count integer := 0;
begin
  if not public.guide_allowed(target_id,'edit') or not public.guide_allowed(target_id,'publish') then
    raise exception 'لا تملك صلاحية نشر الجامعة ومحتواها' using errcode='42501';
  end if;
  perform 1 from public.guide_universities where id=target_id and deleted_at is null for update;
  if not found then raise exception 'الجامعة غير موجودة أو في السلة'; end if;
  update public.guide_universities set published=true where id=target_id and not published;

  update public.guide_programs set published=true
    where university_id=target_id and deleted_at is null and not published and not publication_excluded;
  get diagnostics programs_count=row_count;

  update public.guide_tracks set published=true
    where university_id=target_id and deleted_at is null and not published and not publication_excluded
      and (abs(school_weight+aptitude_weight+achievement_weight-100)<=.01
        or (school_weight+aptitude_weight+achievement_weight=0 and length(trim(requirements))>0));
  get diagnostics tracks_count=row_count;

  update public.guide_sections set published=true
    where university_id=target_id and deleted_at is null and not published and not publication_excluded;
  get diagnostics sections_count=row_count;

  select count(*) into pending_tracks from public.guide_tracks
    where university_id=target_id and deleted_at is null and not published and not publication_excluded;
  select (select count(*) from public.guide_programs where university_id=target_id and deleted_at is null and publication_excluded)
       + (select count(*) from public.guide_tracks where university_id=target_id and deleted_at is null and publication_excluded)
       + (select count(*) from public.guide_sections where university_id=target_id and deleted_at is null and publication_excluded)
    into hidden_count;
  return pg_catalog.jsonb_build_object('programs',programs_count,'tracks',tracks_count,
    'sections',sections_count,'pending_tracks',pending_tracks,'hidden',hidden_count);
end $function$;
commit;
