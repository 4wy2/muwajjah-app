-- 007: وضع «للمسجلين»: الميزة مجانية لمن سجّل دخوله، والزائر يُطلب منه تسجيل الدخول.
-- إضافي وقابل لإعادة التشغيل. الرجوع: database/007_members_mode_rollback.sql
begin;

alter table public.guide_feature_flags drop constraint if exists guide_feature_flags_access_mode_check;
alter table public.guide_feature_flags add constraint guide_feature_flags_access_mode_check
 check (access_mode in ('hidden','free','members','plus'));

create or replace function public.guide_feature_state(target_feature text)
returns text language sql stable security definer set search_path='' as $$
 select case
  when f.access_mode='free' then 'free'
  when f.access_mode='members' and auth.uid() is not null then 'free'
  when f.access_mode='members' then 'login'
  when f.access_mode='plus' and auth.uid() is not null and public.guide_has_plus() then 'plus'
  when f.access_mode='plus' and f.show_offer then 'locked'
  else 'hidden'
 end
 from public.guide_feature_flags f where f.feature_key=target_feature
$$;

create or replace function public.guide_owner_set_feature(target_feature text,target_mode text,offer_visible boolean)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير المميزات' using errcode='42501'; end if;
 if target_feature not in ('historical_cutoffs','comparison','program_search')
  or target_mode not in ('hidden','free','members','plus')
  or target_feature is null or target_mode is null or offer_visible is null
  then raise exception 'الميزة لم تجهز أو الإعداد غير صحيح'; end if;
 update public.guide_feature_flags set access_mode=target_mode,
  show_offer=(target_mode='plus' and (offer_visible or coalesce((select commercial_enabled from public.guide_offer_settings where singleton),false))),
  updated_at=now()
 where feature_key=target_feature;
 if not found then raise exception 'تحديث المميزات غير مكتمل'; end if;
 insert into public.guide_access_events(actor_id,action,note)
 values(auth.uid(),'feature_change',target_feature || ': ' || target_mode);
end $$;

commit;
