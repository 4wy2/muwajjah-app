-- 023: split "كلية الجبيل وينبع الصناعية" into two colleges under the Royal
-- Commission for Jubail and Yanbu.
--  * The current record becomes كلية الجبيل الصناعية (الجبيل، المنطقة الشرقية)
--    and keeps its id, so saved favorites, scores and links stay on Jubail.
--  * A new record كلية ينبع الصناعية (ينبع، منطقة المدينة المنورة) with id
--    cdff6e19-74ed-4858-a4bf-c9953c84f40d gets copies of the 8 programs whose college is
--    كلية ينبع الصناعية; the originals move to Jubail's trash (restorable).
--  * The weighted track and the 7 sections are copied to Yanbu as they are,
--    to be edited by the team where Yanbu differs (housing, branches...).
--  * The 4 skills programs with no college stay with Jubail until decided.
--  * Both show "الهيئة الملكية للجبيل وينبع" as their type badge.
-- Nothing is permanently deleted. Backup: backup.*_023. Rollback: 023_split_jubail_yanbu_rollback.sql
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.guide_admins where is_owner and is_enabled limit 1),true);
create schema if not exists backup;
create table if not exists backup.guide_universities_023 as select * from public.guide_universities where id='c0c3a057-c9ab-45e3-8f18-f444045f2289';
create table if not exists backup.guide_programs_023 as select * from public.guide_programs where university_id='c0c3a057-c9ab-45e3-8f18-f444045f2289';
revoke all on backup.guide_universities_023, backup.guide_programs_023 from anon, authenticated;

insert into public.guide_universities
select (jsonb_populate_record(null::public.guide_universities, to_jsonb(u) || jsonb_build_object(
  'id','cdff6e19-74ed-4858-a4bf-c9953c84f40d','legacy_key',null,'created_at',now(),
  'name','كلية ينبع الصناعية','city','ينبع','region','منطقة المدينة المنورة',
  'type','الهيئة الملكية للجبيل وينبع',
  'website_url','https://www.rcjy.edu.sa/en/colleges-and-institutes-in-yanbu/yanbu-industrial-college/'))).*
from public.guide_universities u where u.id='c0c3a057-c9ab-45e3-8f18-f444045f2289'
on conflict (id) do nothing;

update public.guide_universities set name='كلية الجبيل الصناعية', city='الجبيل', region='المنطقة الشرقية',
  type='الهيئة الملكية للجبيل وينبع'
 where id='c0c3a057-c9ab-45e3-8f18-f444045f2289';

-- Records cannot change university (guide_guard_write), so Yanbu's programs
-- are copied to the new record and the originals go to Jubail's trash
-- (restorable, not deleted).
insert into public.guide_programs
select (jsonb_populate_record(null::public.guide_programs, to_jsonb(p) || jsonb_build_object(
  'id',gen_random_uuid(),'university_id','cdff6e19-74ed-4858-a4bf-c9953c84f40d','created_at',now()))).*
from public.guide_programs p
where p.university_id='c0c3a057-c9ab-45e3-8f18-f444045f2289' and p.deleted_at is null and p.college='كلية ينبع الصناعية'
  and not exists (select 1 from public.guide_programs x where x.university_id='cdff6e19-74ed-4858-a4bf-c9953c84f40d');
update public.guide_programs set deleted_at=now(), published=false
 where university_id='c0c3a057-c9ab-45e3-8f18-f444045f2289' and deleted_at is null and college='كلية ينبع الصناعية';

insert into public.guide_tracks
select (jsonb_populate_record(null::public.guide_tracks, to_jsonb(t) || jsonb_build_object(
  'id',gen_random_uuid(),'university_id','cdff6e19-74ed-4858-a4bf-c9953c84f40d','created_at',now()))).*
from public.guide_tracks t
where t.university_id='c0c3a057-c9ab-45e3-8f18-f444045f2289' and t.deleted_at is null
  and not exists (select 1 from public.guide_tracks x where x.university_id='cdff6e19-74ed-4858-a4bf-c9953c84f40d');

insert into public.guide_sections
select (jsonb_populate_record(null::public.guide_sections, to_jsonb(s) || jsonb_build_object(
  'id',gen_random_uuid(),'university_id','cdff6e19-74ed-4858-a4bf-c9953c84f40d','created_at',now()))).*
from public.guide_sections s
where s.university_id='c0c3a057-c9ab-45e3-8f18-f444045f2289' and s.deleted_at is null
  and not exists (select 1 from public.guide_sections x where x.university_id='cdff6e19-74ed-4858-a4bf-c9953c84f40d');
commit;
