-- Undo 020. Tracks published without a source link or check date go back to
-- draft first (the old rule does not allow them), then the old rule returns.
begin;
update public.guide_tracks set published=false
 where published and (coalesce(length(trim(source_url)),0)=0 or verified_on is null);
alter table public.guide_tracks drop constraint if exists guide_track_publish_valid;
alter table public.guide_tracks add constraint guide_track_publish_valid check (
  not published or (length(trim(source_url)) > 0 and verified_on is not null
  and (school_weight + aptitude_weight + achievement_weight = 0
       or abs(school_weight + aptitude_weight + achievement_weight - 100) <= 0.01))
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
      and length(trim(source_url))>0 and verified_on is not null
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
