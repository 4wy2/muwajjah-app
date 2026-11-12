-- Undo 012: remove the saving gate and flag; restore the owner feature list.
begin;
drop policy if exists "Saving feature gate" on public.guide_student_favorites;
drop policy if exists "Saving feature gate" on public.guide_student_scores;
create or replace function public.guide_owner_set_feature(target_feature text, target_mode text, offer_visible boolean)
 returns void language plpgsql security definer set search_path to ''
as $function$ begin
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
end $function$;
delete from public.guide_feature_flags where feature_key = 'saving';
commit;
