-- مُوجّه: حساب الطالب والتحكم العام بمزايا الموقع.
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor بعد db/schema.sql.
-- الملف قابل لإعادة التشغيل، ويحتفظ بإعداداتك واشتراكاتك الموجودة.
begin;

create table if not exists public.guide_feature_flags (
 feature_key text primary key,
 access_mode text not null default 'hidden' check (access_mode in ('hidden','free','plus')),
 show_offer boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.guide_feature_flags(feature_key,access_mode,show_offer)
values ('historical_cutoffs','hidden',false),
 ('comparison','hidden',false),
 ('personalized_ranking','hidden',false),
 ('booking','hidden',false)
on conflict (feature_key) do nothing;
alter table public.guide_feature_flags enable row level security;
revoke all on public.guide_feature_flags from public,anon,authenticated;
grant select on public.guide_feature_flags to authenticated;
drop policy if exists "Guide owner feature read" on public.guide_feature_flags;
create policy "Guide owner feature read" on public.guide_feature_flags
 for select to authenticated using ((select public.guide_is_owner()));

-- هوية الطالب مستقلة عن طريقة دخوله: بريد وكلمة مرور أو Google.
create table if not exists public.guide_student_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (length(trim(display_name)) between 2 and 100),
 created_at timestamptz not null default now()
);
alter table public.guide_student_profiles enable row level security;
revoke all on public.guide_student_profiles from public,anon,authenticated;
grant select,insert,update on public.guide_student_profiles to authenticated;
drop policy if exists "Guide student profile read" on public.guide_student_profiles;
create policy "Guide student profile read" on public.guide_student_profiles for select to authenticated
 using (user_id=auth.uid() or (select public.guide_is_owner()));
drop policy if exists "Guide student profile insert" on public.guide_student_profiles;
create policy "Guide student profile insert" on public.guide_student_profiles for insert to authenticated
 with check (user_id=auth.uid() and not public.guide_is_admin());
drop policy if exists "Guide student profile update" on public.guide_student_profiles;
create policy "Guide student profile update" on public.guide_student_profiles for update to authenticated
 using (user_id=auth.uid() and not public.guide_is_admin())
 with check (user_id=auth.uid() and not public.guide_is_admin());

create table if not exists public.guide_auth_settings (
 singleton boolean primary key default true check (singleton),
 google_enabled boolean not null default false
);
insert into public.guide_auth_settings(singleton,google_enabled) values (true,false)
 on conflict (singleton) do nothing;
alter table public.guide_auth_settings enable row level security;
revoke all on public.guide_auth_settings from public,anon,authenticated;
grant select on public.guide_auth_settings to authenticated;
drop policy if exists "Guide owner auth settings read" on public.guide_auth_settings;
create policy "Guide owner auth settings read" on public.guide_auth_settings for select to authenticated
 using ((select public.guide_is_owner()));

create or replace function public.guide_google_enabled() returns boolean
language sql stable security definer set search_path=''
as $$ select coalesce((select s.google_enabled from public.guide_auth_settings s where s.singleton),false) $$;
revoke all on function public.guide_google_enabled() from public,anon,authenticated;
grant execute on function public.guide_google_enabled() to anon,authenticated;

create table if not exists public.guide_plus_entitlements (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check (source in ('manual','zid')),
 external_order_id text,
 starts_at timestamptz not null default now(),
 expires_at timestamptz not null check (expires_at > starts_at),
 revoked_at timestamptz,
 note text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists guide_plus_user_active on public.guide_plus_entitlements(user_id,expires_at desc)
 where revoked_at is null;
create unique index if not exists guide_plus_zid_order on public.guide_plus_entitlements(external_order_id)
 where source='zid' and external_order_id is not null;
alter table public.guide_plus_entitlements enable row level security;
revoke all on public.guide_plus_entitlements from public,anon,authenticated;
grant select on public.guide_plus_entitlements to authenticated;
drop policy if exists "Guide own plus read" on public.guide_plus_entitlements;
create policy "Guide own plus read" on public.guide_plus_entitlements for select to authenticated
 using (user_id=auth.uid() or (select public.guide_is_owner()));

create table if not exists public.guide_access_events (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 target_user_id uuid references auth.users(id) on delete set null,
 action text not null,
 note text not null default '',
 occurred_at timestamptz not null default now()
);
alter table public.guide_access_events enable row level security;
revoke all on public.guide_access_events from public,anon,authenticated;
grant select on public.guide_access_events to authenticated;
drop policy if exists "Guide owner access audit" on public.guide_access_events;
create policy "Guide owner access audit" on public.guide_access_events for select to authenticated
 using ((select public.guide_is_owner()));

create or replace function public.guide_has_plus() returns boolean
language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.guide_plus_entitlements e
  where e.user_id=auth.uid() and e.revoked_at is null
   and e.starts_at<=now() and e.expires_at>now()
 )
$$;
revoke all on function public.guide_has_plus() from public,anon,authenticated;
grant execute on function public.guide_has_plus() to authenticated;

-- إخفاء العرض يعني ألا يرى الزائر أي تلميح للاشتراك، حتى لو أُعدّت الميزة كبلس.
create or replace function public.guide_feature_state(target_feature text) returns text
language sql stable security definer set search_path=''
as $$
 select case
  when f.access_mode='free' then 'free'
  when f.access_mode='plus' and auth.uid() is not null and public.guide_has_plus() then 'plus'
  when f.access_mode='plus' and f.show_offer then 'locked'
  else 'hidden'
 end
 from public.guide_feature_flags f where f.feature_key=target_feature
$$;
revoke all on function public.guide_feature_state(text) from public,anon,authenticated;
grant execute on function public.guide_feature_state(text) to anon,authenticated;

-- المحتوى نفسه محمي، حتى لو طلب أحد النسب من واجهة Supabase مباشرة.
drop policy if exists "Guide published read" on public.guide_cutoffs;
drop policy if exists "Guide cutoff feature read" on public.guide_cutoffs;
create policy "Guide cutoff feature read" on public.guide_cutoffs for select to anon,authenticated
 using (
  published and deleted_at is null
  and exists(select 1 from public.guide_universities u
    where u.id=university_id and u.published and u.deleted_at is null)
  and (select public.guide_feature_state('historical_cutoffs')) in ('free','plus')
 );

-- قد تحتوي الأقسام المرنة أيضًا على «نسب القبول»؛ احمها بنفس الإعداد.
alter table public.guide_sections add column if not exists feature_key text not null default 'general';
alter table public.guide_sections drop constraint if exists guide_section_feature_key;
alter table public.guide_sections add constraint guide_section_feature_key
 check (feature_key in ('general','historical_cutoffs'));
update public.guide_sections set feature_key='historical_cutoffs'
 where title ~* '(نسب(ة|ه)?[[:space:]]*القبول|معدلات?[[:space:]]*القبول|[اأ]قل[[:space:]]*موزون|حد[[:space:]]*القبول)'
 and feature_key='general';
drop policy if exists "Guide section published read" on public.guide_sections;
create policy "Guide section published read" on public.guide_sections for select to anon,authenticated
 using (published and deleted_at is null and exists (
  select 1 from public.guide_universities u where u.id=university_id and u.published and u.deleted_at is null
 ) and (
  (feature_key<>'historical_cutoffs' and title !~* '(نسب(ة|ه)?[[:space:]]*القبول|معدلات?[[:space:]]*القبول|[اأ]قل[[:space:]]*موزون|حد[[:space:]]*القبول)')
  or (select public.guide_feature_state('historical_cutoffs')) in ('free','plus')
 ));

create or replace function public.guide_owner_set_feature(target_mode text, offer_visible boolean)
returns void language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير المميزات' using errcode='42501'; end if;
 if target_mode is null or target_mode not in ('hidden','free','plus') or offer_visible is null
  then raise exception 'إعداد الميزة غير صحيح'; end if;
 update public.guide_feature_flags set access_mode=target_mode,
  show_offer=(target_mode='plus' and offer_visible),updated_at=now()
 where feature_key='historical_cutoffs';
 insert into public.guide_access_events(actor_id,action,note)
 values(auth.uid(),'feature_change',target_mode || case when offer_visible and target_mode='plus' then ' + offer' else '' end);
end $$;
revoke all on function public.guide_owner_set_feature(text,boolean) from public,anon,authenticated;
grant execute on function public.guide_owner_set_feature(text,boolean) to authenticated;

-- أي ميزة جديدة تُبنى ثم تُضاف هنا؛ الميزة المخطط لها لا يمكن فتحها قبل وجود صفحتها.
create or replace function public.guide_owner_set_feature(target_feature text,target_mode text,offer_visible boolean)
returns void language plpgsql security definer set search_path=''
as $$ begin
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
revoke all on function public.guide_owner_set_feature(text,text,boolean) from public,anon,authenticated;
grant execute on function public.guide_owner_set_feature(text,text,boolean) to authenticated;

create or replace function public.guide_owner_google_login(enabled boolean) returns void
language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير تسجيل الدخول' using errcode='42501'; end if;
 if enabled is null then raise exception 'اختر حالة الربط'; end if;
 update public.guide_auth_settings set google_enabled=enabled where singleton;
 insert into public.guide_access_events(actor_id,action,note)
 values(auth.uid(),'google_login',case when enabled then 'enabled' else 'disabled' end);
end $$;
revoke all on function public.guide_owner_google_login(boolean) from public,anon,authenticated;
grant execute on function public.guide_owner_google_login(boolean) to authenticated;

-- لا تُرسل مقارنة الجامعات إلا عند إتاحة الميزة، وبحد ثلاث جامعات منشورة.
create or replace function public.guide_compare_universities(target_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=''
as $$ declare result jsonb; begin
 if coalesce(public.guide_feature_state('comparison'),'hidden') not in ('free','plus')
  then raise exception 'المقارنة غير متاحة لهذا الحساب' using errcode='42501'; end if;
 if coalesce(array_length(target_ids,1),0) not between 2 and 3
  or (select count(distinct chosen.id) from unnest(target_ids) as chosen(id))<>array_length(target_ids,1)
  then raise exception 'اختر جامعتين أو ثلاث جامعات مختلفة'; end if;
 select jsonb_agg(jsonb_build_object(
  'id',u.id,'name',u.name,'city',u.city,'region',u.region,'type',u.type,
  'housing_status',u.housing_status,'housing_note',u.housing_note,
  'description',u.description,'website_url',u.website_url,
  'program_count',(select count(*) from public.guide_programs p
   where p.university_id=u.id and p.published and p.deleted_at is null),
  'track_count',(select count(*) from public.guide_tracks t
   where t.university_id=u.id and t.published and t.deleted_at is null)
 ) order by array_position(target_ids,u.id)) into result
 from public.guide_universities u
 where u.id=any(target_ids) and u.published and u.deleted_at is null;
 if coalesce(jsonb_array_length(result),0)<>array_length(target_ids,1)
  then raise exception 'إحدى الجامعات غير منشورة أو غير موجودة'; end if;
 return result;
end $$;
revoke all on function public.guide_compare_universities(uuid[]) from public,anon,authenticated;
grant execute on function public.guide_compare_universities(uuid[]) to anon,authenticated;

create or replace function public.guide_owner_students(search_query text default '')
returns table(user_id uuid,email text,display_name text,registered_at timestamptz,plus_until timestamptz)
language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يرى حسابات الطلاب' using errcode='42501'; end if;
 return query
 select u.id,u.email::text,
  coalesce(nullif(trim(p.display_name),''),nullif(trim(u.raw_user_meta_data->>'guide_student_name'),''),u.email)::text,
  u.created_at,
  (select max(e.expires_at) from public.guide_plus_entitlements e
   where e.user_id=u.id and e.revoked_at is null and e.expires_at>now())
 from auth.users u left join public.guide_student_profiles p on p.user_id=u.id
 where (p.user_id is not null or u.raw_user_meta_data->>'guide_account_kind'='student')
  and not exists(select 1 from public.guide_admins a where a.user_id=u.id)
  and (coalesce(trim(search_query),'')='' or u.email ilike '%'||left(trim(search_query),100)||'%'
   or p.display_name ilike '%'||left(trim(search_query),100)||'%'
   or u.raw_user_meta_data->>'guide_student_name' ilike '%'||left(trim(search_query),100)||'%')
 order by u.created_at desc limit 50;
end $$;
revoke all on function public.guide_owner_students(text) from public,anon,authenticated;
grant execute on function public.guide_owner_students(text) to authenticated;

create or replace function public.guide_owner_manage_plus(target_user uuid,operation text,days_count integer default 30,reason text default '')
returns timestamptz language plpgsql security definer set search_path=''
as $$ declare previous_end timestamptz; next_end timestamptz; begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير بلس' using errcode='42501'; end if;
 if target_user is null or not exists(select 1 from auth.users u where u.id=target_user
   and (u.raw_user_meta_data->>'guide_account_kind'='student' or exists(select 1 from public.guide_student_profiles p where p.user_id=u.id))
   and not exists(select 1 from public.guide_admins a where a.user_id=u.id))
  then raise exception 'حساب الطالب غير موجود'; end if;
 if operation='grant' then
  if days_count is null or days_count not in (7,30,90,365) then raise exception 'اختر مدة صحيحة'; end if;
  -- منع تزامن منح مدتين للحساب نفسه واحتساب المدة الجديدة بعد انتهاء الحالية.
  perform 1 from auth.users where id=target_user for update;
  select max(expires_at) into previous_end from public.guide_plus_entitlements
   where user_id=target_user and revoked_at is null and expires_at>now();
  next_end:=greatest(now(),coalesce(previous_end,now()))+make_interval(days=>days_count);
  insert into public.guide_plus_entitlements(user_id,source,starts_at,expires_at,note)
   values(target_user,'manual',now(),next_end,left(coalesce(reason,''),300));
 elsif operation='revoke' then
  update public.guide_plus_entitlements set revoked_at=now()
   where user_id=target_user and revoked_at is null and expires_at>now();
  next_end:=null;
 else raise exception 'العملية غير معروفة'; end if;
 insert into public.guide_access_events(actor_id,target_user_id,action,note)
  values(auth.uid(),target_user,operation,left(coalesce(reason,''),300));
 return next_end;
end $$;
revoke all on function public.guide_owner_manage_plus(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.guide_owner_manage_plus(uuid,text,integer,text) to authenticated;

create or replace function public.guide_owner_access_events()
returns table(action text,note text,occurred_at timestamptz,target_email text)
language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يرى سجل بلس' using errcode='42501'; end if;
 return query select e.action,e.note,e.occurred_at,u.email::text
 from public.guide_access_events e left join auth.users u on u.id=e.target_user_id
 order by e.occurred_at desc limit 40;
end $$;
revoke all on function public.guide_owner_access_events() from public,anon,authenticated;
grant execute on function public.guide_owner_access_events() to authenticated;

commit;
notify pgrst, 'reload schema';
