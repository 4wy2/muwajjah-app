-- 005: تشغيل الاشتراكات من زر واحد، البحث بالتخصص كميزة مدفوعة،
-- اشتراك موسمي (يدوي أو تلقائي من متجر زد)، واشتراكات معلّقة بالبريد.
-- إضافي بالكامل: لا يحذف جدولًا أو عمودًا أو بيانات، وقابل لإعادة التشغيل.
-- الرجوع: انظر database/005_commerce_rollback.sql
begin;

-- 1) ميزة البحث بالتخصص: للمشتركين، ومخفية عن غيرهم ما دام زر الاشتراكات مطفأ.
insert into public.guide_feature_flags(feature_key,access_mode,show_offer)
values ('program_search','plus',false)
on conflict (feature_key) do nothing;

-- 2) إعدادات العرض (صف واحد). القراءة عامة لأن صفحة الاشتراك تعرضها.
create table if not exists public.guide_offer_settings (
 singleton boolean primary key default true check (singleton),
 commercial_enabled boolean not null default false,
 season_label text not null default '',
 price_text text not null default '',
 purchase_url text not null default '' check (purchase_url = '' or purchase_url ~ '^https://'),
 season_ends_at date,
 note text not null default '',
 updated_at timestamptz not null default now()
);
insert into public.guide_offer_settings(singleton) values (true) on conflict do nothing;
alter table public.guide_offer_settings enable row level security;
revoke all on public.guide_offer_settings from public,anon,authenticated;
grant select on public.guide_offer_settings to anon,authenticated;
drop policy if exists "Guide offer read" on public.guide_offer_settings;
create policy "Guide offer read" on public.guide_offer_settings for select to anon,authenticated using (true);

-- 3) اشتراكات مدفوعة قبل أن ينشئ الطالب حسابه، تُربط ببريده.
create table if not exists public.guide_pending_plus (
 id uuid primary key default gen_random_uuid(),
 email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
 source text not null default 'zid',
 external_order_id text,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 claimed_by uuid references auth.users(id) on delete set null
);
create unique index if not exists guide_pending_plus_order_uq
 on public.guide_pending_plus(source, external_order_id) where external_order_id is not null;
create index if not exists guide_pending_plus_email_idx on public.guide_pending_plus(email) where claimed_at is null;
alter table public.guide_pending_plus enable row level security;
revoke all on public.guide_pending_plus from public,anon,authenticated;

-- منع تكرار تفعيل الطلب نفسه من زد.
create unique index if not exists guide_plus_order_uq
 on public.guide_plus_entitlements(source, external_order_id) where external_order_id is not null;

-- 4) المالك يضبط العرض. زر التشغيل يُظهر أو يخفي عرض الاشتراك لكل ميزة مدفوعة دفعة واحدة.
create or replace function public.guide_owner_set_offer(
 enabled boolean, season_label text, price_text text, purchase_url text, season_ends_at date, note text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير الاشتراكات' using errcode='42501'; end if;
 if enabled is null then raise exception 'إعداد غير صحيح'; end if;
 if coalesce(purchase_url,'') <> '' and purchase_url !~ '^https://' then
  raise exception 'رابط الشراء يجب أن يبدأ بـ https://'; end if;
 if enabled and (season_ends_at is null or season_ends_at <= current_date) then
  raise exception 'حدد تاريخ نهاية الموسم (بعد اليوم) قبل تشغيل الاشتراكات'; end if;
 update public.guide_offer_settings set
  commercial_enabled=enabled,
  season_label=left(coalesce(guide_owner_set_offer.season_label,''),80),
  price_text=left(coalesce(guide_owner_set_offer.price_text,''),80),
  purchase_url=coalesce(guide_owner_set_offer.purchase_url,''),
  season_ends_at=guide_owner_set_offer.season_ends_at,
  note=left(coalesce(guide_owner_set_offer.note,''),500),
  updated_at=now()
 where singleton;
 update public.guide_feature_flags set show_offer=enabled, updated_at=now() where access_mode='plus';
 insert into public.guide_access_events(actor_id,action,note)
  values(auth.uid(),'commercial', case when enabled then 'تشغيل الاشتراكات' else 'إيقاف الاشتراكات' end);
end $$;
revoke all on function public.guide_owner_set_offer(boolean,text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.guide_owner_set_offer(boolean,text,text,text,date,text) to authenticated;

-- 5) السماح بإدارة ميزة البحث بالتخصص من صفحة الوصول. عرض الاشتراك يتبع الزر الرئيسي.
create or replace function public.guide_owner_set_feature(target_feature text,target_mode text,offer_visible boolean)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير المميزات' using errcode='42501'; end if;
 if target_feature not in ('historical_cutoffs','comparison','program_search') or target_mode not in ('hidden','free','plus')
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

-- 6) منح بلس: نفس المدد السابقة، وإضافة «حتى نهاية الموسم».
create or replace function public.guide_owner_manage_plus(target_user uuid,operation text,days_count integer default 30,reason text default '')
returns timestamptz language plpgsql security definer set search_path='' as $$
declare previous_end timestamptz; next_end timestamptz; season_end date; begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير بلس' using errcode='42501'; end if;
 if target_user is null or not exists(select 1 from auth.users u where u.id=target_user
   and (u.raw_user_meta_data->>'guide_account_kind'='student' or exists(select 1 from public.guide_student_profiles p where p.user_id=u.id))
   and not exists(select 1 from public.guide_admins a where a.user_id=u.id))
  then raise exception 'حساب الطالب غير موجود'; end if;
 if operation in ('grant','season') then
  perform 1 from auth.users where id=target_user for update;
  select max(expires_at) into previous_end from public.guide_plus_entitlements
   where user_id=target_user and revoked_at is null and expires_at>now();
  if operation='season' then
   select s.season_ends_at into season_end from public.guide_offer_settings s where s.singleton;
   if season_end is null or season_end <= current_date then raise exception 'حدد تاريخ نهاية الموسم أولًا'; end if;
   next_end:=greatest((season_end + 1)::timestamptz, coalesce(previous_end, now()));
  else
   if days_count is null or days_count not in (7,30,90,365) then raise exception 'اختر مدة صحيحة'; end if;
   next_end:=greatest(now(),coalesce(previous_end,now()))+make_interval(days=>days_count);
  end if;
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

-- 7) الطالب يستلم اشتراكًا دُفع ببريده قبل التسجيل. البريد يجب أن يكون مؤكدًا.
create or replace function public.guide_claim_pending_plus()
returns integer language plpgsql security definer set search_path='' as $$
declare my_email text; n integer := 0; r record; begin
 if auth.uid() is null then return 0; end if;
 select lower(trim(u.email)) into my_email from auth.users u
  where u.id=auth.uid() and u.email_confirmed_at is not null;
 if my_email is null then return 0; end if;
 for r in select * from public.guide_pending_plus p
   where p.email=my_email and p.claimed_at is null and p.expires_at>now() for update
 loop
  insert into public.guide_plus_entitlements(user_id,source,external_order_id,starts_at,expires_at,note)
   values(auth.uid(),r.source,r.external_order_id,now(),r.expires_at,'تفعيل تلقائي بعد الدفع')
   on conflict do nothing;
  update public.guide_pending_plus set claimed_at=now(), claimed_by=auth.uid() where id=r.id;
  insert into public.guide_access_events(actor_id,target_user_id,action,note)
   values(auth.uid(),auth.uid(),'claim',coalesce(r.external_order_id,''));
  n := n + 1;
 end loop;
 return n;
end $$;
revoke all on function public.guide_claim_pending_plus() from public,anon,authenticated;
grant execute on function public.guide_claim_pending_plus() to authenticated;

-- 8) البحث بالتخصص عبر الجامعات: يرفض الطلب من الخادم إذا لم تكن الميزة متاحة للزائر.
create or replace function public.guide_search_programs(search_query text, max_rows integer default 60)
returns table(program_id uuid, program_name text, college text, degree text, gender text, campus text,
 university_id uuid, university_name text, city text)
language plpgsql stable security definer set search_path='' as $$
declare term text := trim(coalesce(search_query,'')); begin
 if coalesce(public.guide_feature_state('program_search'),'hidden') not in ('free','plus') then
  raise exception 'البحث بالتخصص متاح للمشتركين' using errcode='42501'; end if;
 if length(term) < 2 then return; end if;
 return query
  select p.id, p.name, p.college, p.degree, p.gender, p.campus, u.id, u.name, u.city
  from public.guide_programs p join public.guide_universities u on u.id=p.university_id
  where p.published and p.deleted_at is null and u.published and u.deleted_at is null
   and (p.name ilike '%'||term||'%' or p.college ilike '%'||term||'%')
  order by (p.name ilike term||'%') desc, u.name, p.name
  limit least(greatest(coalesce(max_rows,60),1),200);
end $$;
revoke all on function public.guide_search_programs(text,integer) from public,anon,authenticated;
grant execute on function public.guide_search_programs(text,integer) to anon,authenticated;

commit;
