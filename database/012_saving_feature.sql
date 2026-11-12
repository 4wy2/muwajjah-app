-- 012: "Saving" (favorites + saved weighted scores) becomes an owner-controlled
-- feature like comparison or program search: hidden, free for all, free for
-- signed-in students, or upgraded accounts only.
--
-- Behaviour today is kept: the new flag starts as 'members' (any signed-in
-- student can save), exactly what the site does now.
-- Saving is enforced in the database, not only hidden in the page: new
-- favorites and scores are refused when the feature is not open to the caller.
-- Already-saved data stays readable and deletable by its owner in every mode.
--
-- Backup: the flags table is copied to backup.guide_feature_flags_20261112.
-- Rollback: 012_saving_feature_rollback.sql
begin;
create schema if not exists backup;
create table if not exists backup.guide_feature_flags_20261112 as
  select * from public.guide_feature_flags;
revoke all on backup.guide_feature_flags_20261112 from anon, authenticated;

insert into public.guide_feature_flags (feature_key, access_mode, show_offer)
values ('saving', 'members', false)
on conflict (feature_key) do nothing;

create or replace function public.guide_owner_set_feature(target_feature text, target_mode text, offer_visible boolean)
 returns void language plpgsql security definer set search_path to ''
as $function$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير المميزات' using errcode='42501'; end if;
 if target_feature not in ('historical_cutoffs','comparison','program_search','saving')
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

drop policy if exists "Saving feature gate" on public.guide_student_favorites;
create policy "Saving feature gate" on public.guide_student_favorites
  as restrictive for insert to authenticated
  with check ((select public.guide_feature_state('saving')) in ('free', 'plus'));
drop policy if exists "Saving feature gate" on public.guide_student_scores;
create policy "Saving feature gate" on public.guide_student_scores
  as restrictive for insert to authenticated
  with check ((select public.guide_feature_state('saving')) in ('free', 'plus'));
commit;
