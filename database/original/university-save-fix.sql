-- إصلاح حفظ الجامعة: يحدّث دالة الحماية فقط، بلا حذف بيانات أو تغيير صلاحيات.
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
notify pgrst, 'reload schema';
