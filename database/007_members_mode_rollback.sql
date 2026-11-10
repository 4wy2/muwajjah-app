-- الرجوع عن 007: الميزات «للمسجلين» تصبح مخفية، وتعود الدوال والقيد كما كانت.
begin;
update public.guide_feature_flags set access_mode='hidden', show_offer=false where access_mode='members';
alter table public.guide_feature_flags drop constraint if exists guide_feature_flags_access_mode_check;
alter table public.guide_feature_flags add constraint guide_feature_flags_access_mode_check
 check (access_mode in ('hidden','free','plus'));
create or replace function public.guide_feature_state(target_feature text)
returns text language sql stable security definer set search_path='' as $$
 select case
  when f.access_mode='free' then 'free'
  when f.access_mode='plus' and auth.uid() is not null and public.guide_has_plus() then 'plus'
  when f.access_mode='plus' and f.show_offer then 'locked'
  else 'hidden'
 end
 from public.guide_feature_flags f where f.feature_key=target_feature
$$;
commit;
-- guide_owner_set_feature: أعد تشغيل database/005_commerce.sql (القسم 5) إذا لزم.
