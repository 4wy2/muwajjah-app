-- Undo 023: Yanbu's programs go back, the copies and the Yanbu record go to
-- the trash (not deleted), and the original name/city/region/type return.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.guide_admins where is_owner and is_enabled limit 1),true);
update public.guide_programs p set deleted_at=null, published=b.published
 from backup.guide_programs_023 b where p.id=b.id and b.deleted_at is null and p.deleted_at is not null;
update public.guide_programs set deleted_at=now(), published=false where university_id='cdff6e19-74ed-4858-a4bf-c9953c84f40d' and deleted_at is null;
update public.guide_tracks set deleted_at=now(), published=false where university_id='cdff6e19-74ed-4858-a4bf-c9953c84f40d' and deleted_at is null;
update public.guide_sections set deleted_at=now(), published=false where university_id='cdff6e19-74ed-4858-a4bf-c9953c84f40d' and deleted_at is null;
update public.guide_universities set deleted_at=now(), published=false where id='cdff6e19-74ed-4858-a4bf-c9953c84f40d';
update public.guide_universities u set name=b.name, city=b.city, region=b.region, type=b.type
 from backup.guide_universities_023 b where u.id=b.id;
commit;
