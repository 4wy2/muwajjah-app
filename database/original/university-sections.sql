-- أقسام مرنة لكل جامعة؛ شغّله في Supabase SQL Editor مرة واحدة.
begin;
-- مسارات مثل SAT أو الأولمبياد لا تحتاج اختراع أوزان أو سنة قبول.
alter table public.guide_tracks drop constraint if exists guide_track_publish_valid;
alter table public.guide_tracks add constraint guide_track_publish_valid check (
  not published or (
    length(trim(source_url)) > 0 and verified_on is not null
    and (school_weight+aptitude_weight+achievement_weight = 0
      or abs(school_weight+aptitude_weight+achievement_weight-100) <= .01)
  )
);
-- أبقِ دالة حفظ الجامعة متوافقة أيضًا مع الأقسام الجديدة.
create or replace function public.guide_guard_write()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare uid uuid;
begin
  if TG_TABLE_NAME = 'guide_universities' then
    uid := new.id;
  else
    uid := (to_jsonb(new)->>'university_id')::uuid;
  end if;

  if TG_OP = 'INSERT' then
    if not public.guide_allowed(uid,'edit') or (new.published and not public.guide_allowed(uid,'publish')) then
      raise exception 'لا تملك صلاحية إضافة السجل' using errcode = '42501';
    end if;
  else
    if (to_jsonb(new)-'published'-'deleted_at'-'publication_excluded') is distinct from (to_jsonb(old)-'published'-'deleted_at'-'publication_excluded')
       and not public.guide_allowed(uid,'edit') then
      raise exception 'لا تملك صلاحية تعديل المحتوى' using errcode = '42501';
    end if;
    if to_jsonb(new)->>'publication_excluded' is distinct from to_jsonb(old)->>'publication_excluded'
       and not public.guide_allowed(uid,'publish')
       and not (old.deleted_at is not null and new.deleted_at is null and not new.published
         and to_jsonb(new)->>'publication_excluded'='true' and public.guide_allowed(uid,'delete')) then
      raise exception 'لا تملك صلاحية إخفاء المحتوى' using errcode = '42501';
    end if;
    if new.published is distinct from old.published and not public.guide_allowed(uid,'publish') then
      if not (old.published and not new.published and new.deleted_at is distinct from old.deleted_at
              and public.guide_allowed(uid,'delete')) then
        raise exception 'لا تملك صلاحية النشر' using errcode = '42501';
      end if;
    end if;
    if new.deleted_at is distinct from old.deleted_at and not public.guide_allowed(uid,'delete') then
      raise exception 'لا تملك صلاحية الحذف أو الاستعادة' using errcode = '42501';
    end if;
    if new.id is distinct from old.id or
       (TG_TABLE_NAME <> 'guide_universities' and
        to_jsonb(new)->>'university_id' is distinct from to_jsonb(old)->>'university_id') then
      raise exception 'لا يمكن نقل السجل لجامعة أخرى' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create table if not exists public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.guide_universities(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  content text not null check (length(trim(content)) between 2 and 10000),
  display_order integer not null default 0,
  source_url text not null default '',
  verified_on date,
  published boolean not null default false,
  publication_excluded boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint guide_section_publication_state check (not (published and publication_excluded))
);
alter table public.guide_sections add column if not exists publication_excluded boolean not null default false;
alter table public.guide_sections drop constraint if exists guide_section_publication_state;
alter table public.guide_sections add constraint guide_section_publication_state check (not (published and publication_excluded));
create index if not exists guide_sections_university_order on public.guide_sections(university_id,display_order,created_at);
alter table public.guide_sections enable row level security;
revoke all on public.guide_sections from anon,authenticated;
grant select on public.guide_sections to anon,authenticated;
grant insert,update,delete on public.guide_sections to authenticated;
drop policy if exists "Guide section published read" on public.guide_sections;
create policy "Guide section published read" on public.guide_sections for select to anon,authenticated
using (published and deleted_at is null and exists (
  select 1 from public.guide_universities u where u.id=university_id and u.published and u.deleted_at is null
));
drop policy if exists "Guide section team read" on public.guide_sections;
create policy "Guide section team read" on public.guide_sections for select to authenticated
using (public.guide_allowed(university_id,'read'));
drop policy if exists "Guide section team insert" on public.guide_sections;
create policy "Guide section team insert" on public.guide_sections for insert to authenticated
with check (public.guide_allowed(university_id,'edit') and (not published or public.guide_allowed(university_id,'publish')) and deleted_at is null);
drop policy if exists "Guide section team update" on public.guide_sections;
create policy "Guide section team update" on public.guide_sections for update to authenticated
using (public.guide_allowed(university_id,'edit') or public.guide_allowed(university_id,'delete'))
with check ((public.guide_allowed(university_id,'edit') or public.guide_allowed(university_id,'delete'))
 and (not published or public.guide_allowed(university_id,'publish')));
drop policy if exists "Guide section owner delete" on public.guide_sections;
create policy "Guide section owner delete" on public.guide_sections for delete to authenticated
using ((select public.guide_is_owner()));
drop trigger if exists guide_write_guard on public.guide_sections;
create trigger guide_write_guard before insert or update on public.guide_sections
for each row execute function public.guide_guard_write();
drop trigger if exists guide_audit_change on public.guide_sections;
create trigger guide_audit_change after insert or update or delete on public.guide_sections
for each row execute function public.guide_record_audit();
commit;
notify pgrst, 'reload schema';
