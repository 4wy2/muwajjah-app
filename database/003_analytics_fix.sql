-- مُوجّه 003: إصلاح تسجيل التحليلات + مفتاح يملكه المالك لإيقافها من الخادم.
--
-- لماذا: في المرجع database/original/schema.sql تتعارض أسماء معاملات الدالتين
-- (event_kind وsearch_term) مع أسماء الأعمدة، فيرفض PostgreSQL التنفيذ بخطأ
-- "column reference ... is ambiguous". الواجهة تتجاهل هذا الخطأ بصمت، فإذا كان
-- الإنتاج مطابقًا للمرجع فالتحليلات لا تُسجّل شيئًا. تحقق بالاستعلام 11 في ملف
-- الفحص قبل التشغيل. الإصلاح: التوجيه #variable_conflict use_column مع إبقاء
-- أسماء المعاملات كما هي حتى لا يتغير استدعاء الواجهة.
--
-- الأثر:
--   * يضيف صفًا واحدًا analytics_collection إلى guide_feature_flags
--     (free = التسجيل يعمل، hidden = متوقف). القيمة الافتراضية: يعمل.
--   * يعيد تعريف guide_record_interest وguide_record_missing_search بالمنطق
--     نفسه الموجود في database/original/schema.sql مع فحص المفتاح في أولها.
--     إذا كانت نسختك في الإنتاج معدّلة عن المرجع، قارنها قبل التشغيل.
--   * يضيف guide_owner_set_analytics(enabled) للمالك فقط، ويسجل التغيير.
--   * لا يحذف أي بيانات. إيقاف التسجيل لا يؤثر على تصفح الجامعات.
--
-- قبل التشغيل: نسخة احتياطية. قابل لإعادة التشغيل. الاسترجاع في آخر الملف.
begin;
insert into public.guide_feature_flags(feature_key, access_mode, show_offer)
values ('analytics_collection', 'free', false)
on conflict (feature_key) do nothing;

create or replace function public.guide_analytics_enabled() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select f.access_mode = 'free' from public.guide_feature_flags f
  where f.feature_key = 'analytics_collection'), true) $$;
revoke all on function public.guide_analytics_enabled() from public, anon, authenticated;

create or replace function public.guide_record_interest(event_kind text, record_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.guide_analytics_enabled() then return; end if;
  if event_kind = 'university' and exists (
    select 1 from public.guide_universities u where u.id=record_id and u.published and u.deleted_at is null
  ) or event_kind = 'program' and exists (
    select 1 from public.guide_programs p join public.guide_universities u on u.id=p.university_id
    where p.id=record_id and p.published and p.deleted_at is null and u.published and u.deleted_at is null
  ) then
    insert into public.guide_daily_interest(event_day,event_kind,entity_id,hits)
    values (current_date,event_kind,record_id,1)
    on conflict (event_day,event_kind,entity_id) do update
      set hits=public.guide_daily_interest.hits+1;
  end if;
end $$;
revoke all on function public.guide_record_interest(text,uuid) from public;
grant execute on function public.guide_record_interest(text,uuid) to anon,authenticated;

create or replace function public.guide_record_missing_search(search_term text)
returns void language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare term text;
begin
  if not public.guide_analytics_enabled() then return; end if;
  term:=lower(trim(regexp_replace(coalesce(search_term,''),'\s+',' ','g')));
  if char_length(term) not between 3 and 80 or term ~ '[@/:\\]' or term ~ '[0-9]{6,}' then return; end if;
  if not exists(select 1 from public.guide_daily_missing_search where event_day=current_date and search_term=term)
    and (select count(*) from public.guide_daily_missing_search where event_day=current_date)>=500 then return; end if;
  insert into public.guide_daily_missing_search(event_day,search_term,hits) values(current_date,term,1)
  on conflict (event_day,search_term) do update set hits=public.guide_daily_missing_search.hits+1;
end $$;
revoke all on function public.guide_record_missing_search(text) from public;
grant execute on function public.guide_record_missing_search(text) to anon,authenticated;

create or replace function public.guide_owner_set_analytics(enabled boolean) returns void
language plpgsql security definer set search_path = ''
as $$ begin
  if not public.guide_is_owner() then raise exception 'المالك فقط يدير التحليلات' using errcode='42501'; end if;
  if enabled is null then raise exception 'اختر حالة التسجيل'; end if;
  update public.guide_feature_flags
    set access_mode = case when enabled then 'free' else 'hidden' end, show_offer = false, updated_at = now()
    where feature_key = 'analytics_collection';
  if not found then raise exception 'شغّل database/003_analytics_fix.sql أولًا'; end if;
  insert into public.guide_access_events(actor_id, action, note)
  values (auth.uid(), 'analytics_collection', case when enabled then 'enabled' else 'disabled' end);
end $$;
revoke all on function public.guide_owner_set_analytics(boolean) from public, anon, authenticated;
grant execute on function public.guide_owner_set_analytics(boolean) to authenticated;
commit;
notify pgrst, 'reload schema';

-- الاسترجاع: أعد تشغيل تعريفي guide_record_interest وguide_record_missing_search
-- من database/original/analytics.sql، ثم:
-- drop function if exists public.guide_owner_set_analytics(boolean);
-- drop function if exists public.guide_analytics_enabled();
-- delete from public.guide_feature_flags where feature_key = 'analytics_collection';
