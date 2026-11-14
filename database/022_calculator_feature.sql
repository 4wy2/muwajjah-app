-- 022: the weighted-score calculator becomes an owner-controlled feature
-- ("calculator"), like comparison or filters. It starts as "free" so nothing
-- changes for students until the owner picks another mode. The weights
-- themselves stay free on every university page; only the calculator tool
-- follows this setting. Saving results keeps its own setting (score_saving).
-- Backup: backup.guide_feature_flags_022. Rollback: 022_calculator_feature_rollback.sql
begin;
create schema if not exists backup;
create table if not exists backup.guide_feature_flags_022 as
  select * from public.guide_feature_flags;
revoke all on backup.guide_feature_flags_022 from anon, authenticated;
insert into public.guide_feature_flags (feature_key, access_mode, show_offer)
values ('calculator', 'free', false)
on conflict (feature_key) do nothing;
create or replace function public.guide_owner_set_feature(target_feature text, target_mode text, offer_visible boolean)
 returns void language plpgsql security definer set search_path to ''
as $function$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير المميزات' using errcode='42501'; end if;
 if target_feature not in ('historical_cutoffs','comparison','program_search','saving','filters','compare_share','score_saving','calculator')
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
end $function$;
commit;
