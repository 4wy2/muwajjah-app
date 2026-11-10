-- 008: تعديل سجلات المحتوى عبر POST بدل PATCH.
-- بعض المتصفحات والإضافات وبرامج الحماية تحجب طلبات PATCH، فيظهر «تعذر الاتصال»
-- عند الحفظ. الدالة تعمل بصلاحيات المستخدم نفسه (SECURITY INVOKER)، فقواعد
-- الحماية (RLS) والقيود والمحفزات تنطبق تمامًا كما في التعديل المباشر.
-- إضافي وقابل لإعادة التشغيل. الرجوع: drop function public.guide_update_record(text,uuid,jsonb);
begin;

create or replace function public.guide_update_record(target_kind text, record_id uuid, changes jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
 tbl text;
 col text;
 sets text := '';
 result uuid;
begin
 if target_kind not in ('universities','programs','tracks','sections','cutoffs') then
  raise exception 'نوع المحتوى غير معروف';
 end if;
 if record_id is null or changes is null or jsonb_typeof(changes) <> 'object' then
  raise exception 'بيانات التعديل غير صالحة';
 end if;
 tbl := 'guide_' || target_kind;
 for col in select jsonb_object_keys(changes) loop
  if col in ('id','created_at') or not exists (
    select 1 from pg_attribute a
    where a.attrelid = ('public.' || tbl)::regclass and a.attname = col
      and a.attnum > 0 and not a.attisdropped)
  then raise exception 'حقل غير معروف: %', col; end if;
  sets := sets || case when sets = '' then '' else ', ' end
   || format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', col, tbl, col);
 end loop;
 if sets = '' then raise exception 'لا توجد تغييرات'; end if;
 execute format('update public.%I set %s where id = $2 returning id', tbl, sets)
  into result using changes, record_id;
 return result; -- null = no row changed (not found or not permitted)
end $$;
revoke all on function public.guide_update_record(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.guide_update_record(text,uuid,jsonb) to authenticated;

commit;
