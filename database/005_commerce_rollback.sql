-- الرجوع عن 005. يعيد الدوال لنسختها السابقة ويخفي العرض، ويحتفظ بالجداول الجديدة
-- وبياناتها (لا حذف بيانات). احذف الجداول يدويًا فقط بعد التأكد أنها فارغة ولا تحتاجها.
begin;
update public.guide_feature_flags set show_offer=false;
update public.guide_feature_flags set access_mode='hidden' where feature_key='program_search';
drop function if exists public.guide_search_programs(text,integer);
drop function if exists public.guide_claim_pending_plus();
drop function if exists public.guide_owner_set_offer(boolean,text,text,text,date,text);
create or replace function public.guide_owner_set_feature(target_feature text,target_mode text,offer_visible boolean)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير المميزات' using errcode='42501'; end if;
 if target_feature not in ('historical_cutoffs','comparison') or target_mode not in ('hidden','free','plus')
  or target_feature is null or target_mode is null or offer_visible is null
  then raise exception 'الميزة لم تجهز أو الإعداد غير صحيح'; end if;
 update public.guide_feature_flags set access_mode=target_mode,
  show_offer=(target_mode='plus' and offer_visible),updated_at=now()
 where feature_key=target_feature;
 if not found then raise exception 'تحديث المميزات غير مكتمل؛ شغّل db/plus.sql'; end if;
 insert into public.guide_access_events(actor_id,action,note)
 values(auth.uid(),'feature_change',target_feature || ': ' || target_mode);
end $$;
-- guide_owner_manage_plus: العملية 'season' تبقى متاحة ولا تؤثر على grant/revoke.
commit;
