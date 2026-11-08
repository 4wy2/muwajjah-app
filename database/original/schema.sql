-- مُوجّه: إعداد وتحديث قاعدة البيانات. يمكن تشغيل الملف كاملًا مجددًا في Supabase SQL Editor.
-- الجداول القديمة لا تُحذف ولا تُعدّل.
begin;

create table if not exists public.guide_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.guide_universities (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  name text not null check (length(trim(name)) > 0),
  city text not null default '',
  region text not null default '',
  type text not null default '',
  housing_status text not null default 'unknown'
    check (housing_status in ('unknown','available','limited','unavailable')),
  housing_note text not null default '',
  housing_source_url text not null default '',
  housing_verified_on date,
  description text not null default '',
  website_url text not null default '',
  logo_url text not null default '',
  source_url text not null default '',
  verified_on date,
  published boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.guide_programs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.guide_universities(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  college text not null default '',
  degree text not null default 'غير محدد',
  gender text not null default 'غير محدد',
  campus text not null default '',
  admission_route text not null default '',
  source_url text not null default '',
  verified_on date,
  published boolean not null default false,
  publication_excluded boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint guide_program_unique unique (university_id,name,college,degree,gender,campus),
  constraint guide_program_publication_state check (not (published and publication_excluded))
);

create table if not exists public.guide_tracks (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.guide_universities(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  academic_year text not null check (length(trim(academic_year)) > 0),
  gender text not null default 'عام',
  school_weight numeric(5,2) not null default 0 check (school_weight between 0 and 100),
  aptitude_weight numeric(5,2) not null default 0 check (aptitude_weight between 0 and 100),
  achievement_weight numeric(5,2) not null default 0 check (achievement_weight between 0 and 100),
  requirements text not null default '',
  source_url text not null default '',
  verified_on date,
  published boolean not null default false,
  publication_excluded boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint guide_track_unique unique (university_id,name,academic_year,gender),
  constraint guide_track_publication_state check (not (published and publication_excluded)),
  constraint guide_track_publish_valid check
    (not published or (
      length(trim(source_url)) > 0 and verified_on is not null
      and (school_weight+aptitude_weight+achievement_weight = 0
        or abs(school_weight+aptitude_weight+achievement_weight-100) <= .01)
    ))
);

create table if not exists public.guide_cutoffs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.guide_universities(id) on delete restrict,
  program_name text not null check (length(trim(program_name)) > 0),
  academic_year text not null check (length(trim(academic_year)) > 0),
  gender text not null default 'عام',
  ratio numeric(5,2) not null check (ratio between 0 and 100),
  source_url text not null default '',
  verified_on date,
  published boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint guide_cutoff_unique unique (university_id,program_name,academic_year,gender),
  constraint guide_cutoff_source_required check
    (not published or (length(trim(source_url)) > 0 and verified_on is not null))
);

-- تحديث آمن للجداول الموجودة، مع إبقاء السجلات المنشورة والمسودات كما هي.
alter table public.guide_universities add column if not exists deleted_at timestamptz;
alter table public.guide_universities add column if not exists housing_source_url text not null default '';
alter table public.guide_universities add column if not exists housing_verified_on date;
alter table public.guide_programs add column if not exists deleted_at timestamptz;
alter table public.guide_programs add column if not exists publication_excluded boolean not null default false;
alter table public.guide_tracks add column if not exists deleted_at timestamptz;
alter table public.guide_tracks add column if not exists publication_excluded boolean not null default false;
alter table public.guide_cutoffs add column if not exists deleted_at timestamptz;
alter table public.guide_universities drop constraint if exists guide_university_source_required;
alter table public.guide_programs drop constraint if exists guide_program_source_required;
alter table public.guide_programs alter column degree set default 'غير محدد';
alter table public.guide_programs alter column gender set default 'غير محدد';
alter table public.guide_tracks drop constraint if exists guide_track_publish_valid;
alter table public.guide_tracks add constraint guide_track_publish_valid check (
  not published or (
    length(trim(source_url)) > 0 and verified_on is not null
    and (school_weight+aptitude_weight+achievement_weight = 0
      or abs(school_weight+aptitude_weight+achievement_weight-100) <= .01)
  )
);
alter table public.guide_programs drop constraint if exists guide_program_publication_state;
alter table public.guide_programs add constraint guide_program_publication_state check (not (published and publication_excluded));
alter table public.guide_tracks drop constraint if exists guide_track_publication_state;
alter table public.guide_tracks add constraint guide_track_publication_state check (not (published and publication_excluded));

create index if not exists guide_programs_university on public.guide_programs(university_id);
create index if not exists guide_tracks_university on public.guide_tracks(university_id);
create index if not exists guide_cutoffs_university on public.guide_cutoffs(university_id);

-- وظيفة الصلاحية تقرأ قائمة المحررين من جهة الخادم، لا من متصفح الزائر.
create or replace function public.guide_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.guide_admins
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.guide_is_admin() from public;
grant execute on function public.guide_is_admin() to authenticated;

alter table public.guide_admins enable row level security;
revoke all on public.guide_admins from anon, authenticated;
grant select on public.guide_admins to authenticated;
drop policy if exists "Guide admins read own membership" on public.guide_admins;
create policy "Guide admins read own membership" on public.guide_admins
for select to authenticated using ((select auth.uid()) = user_id);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'guide_universities','guide_programs','guide_tracks','guide_cutoffs'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from anon, authenticated',table_name);
    execute format('grant select on public.%I to anon, authenticated',table_name);
    execute format('grant insert, update, delete on public.%I to authenticated',table_name);
    execute format('drop policy if exists "Guide published read" on public.%I',table_name);
    execute format('drop policy if exists "Guide admin read" on public.%I',table_name);
    execute format('drop policy if exists "Guide admin insert" on public.%I',table_name);
    execute format('drop policy if exists "Guide admin update" on public.%I',table_name);
    execute format('drop policy if exists "Guide admin delete" on public.%I',table_name);
    if table_name = 'guide_universities' then
      execute format('create policy "Guide published read" on public.%I for select to anon, authenticated using (published and deleted_at is null)',table_name);
    else
      execute format('create policy "Guide published read" on public.%I for select to anon, authenticated using (published and deleted_at is null and exists (select 1 from public.guide_universities u where u.id = university_id and u.published and u.deleted_at is null))',table_name);
    end if;
    execute format('create policy "Guide admin read" on public.%I for select to authenticated using ((select public.guide_is_admin()))',table_name);
    execute format('create policy "Guide admin insert" on public.%I for insert to authenticated with check ((select public.guide_is_admin()))',table_name);
    execute format('create policy "Guide admin update" on public.%I for update to authenticated using ((select public.guide_is_admin())) with check ((select public.guide_is_admin()))',table_name);
    execute format('create policy "Guide admin delete" on public.%I for delete to authenticated using ((select public.guide_is_admin()))',table_name);
  end loop;
end $$;

-- حذف جامعة من السلة مع سجلاتها المرتبطة، في عملية واحدة. الإدارة فقط.
create or replace function public.guide_delete_university_permanently(target_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if not (select public.guide_is_admin()) then
    raise exception 'Admins only';
  end if;
  if not exists (select 1 from public.guide_universities where id = target_id and deleted_at is not null) then
    raise exception 'University must be in trash before permanent deletion';
  end if;
  delete from public.guide_cutoffs where university_id = target_id;
  delete from public.guide_tracks where university_id = target_id;
  delete from public.guide_programs where university_id = target_id;
  delete from public.guide_universities where id = target_id;
end;
$$;
revoke all on function public.guide_delete_university_permanently(uuid) from public;
grant execute on function public.guide_delete_university_permanently(uuid) to authenticated;

-- تعديل الحذف والنشر والاستعادة عبر POST عند تعطل PATCH في المتصفح.
-- SECURITY INVOKER يحافظ على صلاحيات الجداول وسياسات RLS الحالية.
create or replace function public.guide_change_record_state(
  target_table text, target_ids uuid[], target_action text
)
returns table(id uuid, deleted_at timestamptz, published boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  update_fields text;
  required_state text;
  parent_check text := '';
  excluded_enabled boolean;
begin
  if not (select public.guide_is_admin()) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if target_table is null or target_table not in (
    'guide_universities', 'guide_programs', 'guide_tracks', 'guide_cutoffs', 'guide_sections'
  ) then
    raise exception 'Invalid guide table';
  end if;
  if target_action is null or target_action not in ('trash', 'restore', 'publish', 'draft', 'include') then
    raise exception 'Invalid state change';
  end if;
  if coalesce(array_length(target_ids, 1), 0) not between 1 and 50
     or array_position(target_ids, null) is not null then
    raise exception 'Choose between 1 and 50 records';
  end if;
  excluded_enabled := target_table in ('guide_programs','guide_tracks','guide_sections')
    and exists (select 1 from pg_catalog.pg_attribute
      where attrelid=pg_catalog.to_regclass('public.'||target_table)
        and attname='publication_excluded' and not attisdropped);
  if target_action='include' and not excluded_enabled then
    raise exception 'Including content requires the full database update';
  end if;

  case target_action
    when 'trash' then
      update_fields := 'deleted_at = now(), published = false';
      required_state := 'null';
    when 'restore' then
      update_fields := 'deleted_at = null, published = false';
      if excluded_enabled then update_fields := update_fields || ', publication_excluded = true'; end if;
      required_state := 'not null';
    when 'publish' then
      update_fields := 'published = true';
      if excluded_enabled then update_fields := update_fields || ', publication_excluded = false'; end if;
      required_state := 'null';
      if target_table <> 'guide_universities' then
        parent_check := ' and exists (select 1 from public.guide_universities u where u.id = university_id and u.published and u.deleted_at is null)';
      end if;
    when 'draft' then
      update_fields := 'published = false';
      if excluded_enabled then update_fields := update_fields || ', publication_excluded = true'; end if;
      required_state := 'null';
    when 'include' then
      update_fields := 'published = false, publication_excluded = false';
      required_state := 'null';
  end case;

  return query execute format(
    'update public.%I set %s where id = any($1) and deleted_at is %s%s returning id, deleted_at, published',
    target_table, update_fields, required_state, parent_check
  ) using target_ids;
end;
$$;
revoke all on function public.guide_change_record_state(text, uuid[], text) from public;
grant execute on function public.guide_change_record_state(text, uuid[], text) to authenticated;
-- صلاحيات المالك والفريق (ضمن نفس المعاملة)
alter table public.guide_admins add column if not exists is_owner boolean not null default false;
alter table public.guide_admins add column if not exists is_enabled boolean not null default true;
alter table public.guide_admins add column if not exists can_edit boolean not null default false;
alter table public.guide_admins add column if not exists can_publish boolean not null default false;
alter table public.guide_admins add column if not exists can_delete boolean not null default false;
do $$ begin
  if not exists(select 1 from public.guide_admins where is_owner) then
    if (select count(*) from public.guide_admins) > 1 then
      raise exception 'يجب وجود حساب إداري واحد فقط قبل تعيين المالك. راجع guide_admins يدويًا.';
    end if;
    update public.guide_admins set is_owner=true,can_edit=true,can_publish=true,can_delete=true where (select count(*) from public.guide_admins)=1;
  end if;
end $$;
create unique index if not exists guide_one_owner on public.guide_admins((is_owner)) where is_owner;
create table if not exists public.guide_assignments (
 user_id uuid not null references public.guide_admins(user_id) on delete cascade,
 university_id uuid not null references public.guide_universities(id) on delete cascade,
 primary key(user_id,university_id)
);
create or replace function public.guide_is_owner() returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.guide_admins where user_id=auth.uid() and is_owner and is_enabled) $$;
revoke all on function public.guide_is_owner() from public;
grant execute on function public.guide_is_owner() to authenticated;
create or replace function public.guide_is_admin() returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.guide_admins where user_id=auth.uid() and is_enabled) $$;
revoke all on function public.guide_is_admin() from public;
grant execute on function public.guide_is_admin() to authenticated;
create or replace function public.guide_allowed(target_id uuid, action text) returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.guide_admins a where a.user_id=auth.uid() and a.is_enabled and
 (a.is_owner or (action in ('read','edit','publish','delete') and exists(select 1 from public.guide_assignments s where s.user_id=a.user_id and s.university_id=target_id)
 and (action='read' or action='edit' and a.can_edit or action='publish' and a.can_publish or action='delete' and a.can_delete)))) $$;
revoke all on function public.guide_allowed(uuid,text) from public;
grant execute on function public.guide_allowed(uuid,text) to authenticated;

alter table public.guide_assignments enable row level security;
revoke all on public.guide_assignments from anon,authenticated;
grant select on public.guide_assignments to authenticated;
drop policy if exists "Guide assignment read" on public.guide_assignments;
create policy "Guide assignment read" on public.guide_assignments for select to authenticated using (user_id=auth.uid() or (select public.guide_is_owner()));
drop policy if exists "Guide admins read own membership" on public.guide_admins;
create policy "Guide admins read own membership" on public.guide_admins for select to authenticated using (user_id=auth.uid() or (select public.guide_is_owner()));

-- أبقِ القراءة العامة للمنشور، لكن احصر المسودات والتعديل بالجامعات المسندة.
do $$ declare t text; key_expression text; begin
 foreach t in array array['guide_universities','guide_programs','guide_tracks','guide_cutoffs'] loop
  key_expression:=case when t='guide_universities' then 'id' else 'university_id' end;
  execute format('drop policy if exists "Guide admin read" on public.%I',t);
  execute format('drop policy if exists "Guide admin insert" on public.%I',t);
  execute format('drop policy if exists "Guide admin update" on public.%I',t);
  execute format('drop policy if exists "Guide admin delete" on public.%I',t);
  execute format('create policy "Guide admin read" on public.%I for select to authenticated using (public.guide_allowed(%s,''read''))',t,key_expression);
  execute format('create policy "Guide admin insert" on public.%I for insert to authenticated with check (public.guide_allowed(%s,''edit'') and (not published or public.guide_allowed(%s,''publish'')) and deleted_at is null)',t,key_expression,key_expression);
  execute format('create policy "Guide admin update" on public.%I for update to authenticated using (public.guide_allowed(%s,''edit'') or public.guide_allowed(%s,''delete'')) with check ((public.guide_allowed(%s,''edit'') or public.guide_allowed(%s,''delete'')) and (not published or public.guide_allowed(%s,''publish'')))',t,key_expression,key_expression,key_expression,key_expression,key_expression);
  execute format('create policy "Guide admin delete" on public.%I for delete to authenticated using (public.guide_is_owner())',t);
 end loop;
end $$;
-- Trigger compares old/new state because RLS alone cannot see which columns changed.
create or replace function public.guide_guard_write() returns trigger language plpgsql security invoker set search_path=''
as $$ declare uid uuid; begin
 if TG_TABLE_NAME='guide_universities' then
   uid:=new.id;
 else
   uid:=(to_jsonb(new)->>'university_id')::uuid;
 end if;
 if TG_OP='INSERT' then
   if not public.guide_allowed(uid,'edit') or (new.published and not public.guide_allowed(uid,'publish')) then raise exception 'لا تملك صلاحية إضافة السجل' using errcode='42501'; end if;
 else
   if (to_jsonb(new)-'published'-'deleted_at'-'publication_excluded') is distinct from (to_jsonb(old)-'published'-'deleted_at'-'publication_excluded') and not public.guide_allowed(uid,'edit') then raise exception 'لا تملك صلاحية تعديل المحتوى' using errcode='42501'; end if;
   if to_jsonb(new)->>'publication_excluded' is distinct from to_jsonb(old)->>'publication_excluded' and not public.guide_allowed(uid,'publish')
     and not (old.deleted_at is not null and new.deleted_at is null and not new.published
       and to_jsonb(new)->>'publication_excluded'='true' and public.guide_allowed(uid,'delete'))
     then raise exception 'لا تملك صلاحية إخفاء المحتوى' using errcode='42501'; end if;
   if new.published is distinct from old.published and not public.guide_allowed(uid,'publish') then
     if not (old.published and not new.published and new.deleted_at is distinct from old.deleted_at and public.guide_allowed(uid,'delete')) then raise exception 'لا تملك صلاحية النشر' using errcode='42501'; end if;
   end if;
   if new.deleted_at is distinct from old.deleted_at and not public.guide_allowed(uid,'delete') then raise exception 'لا تملك صلاحية الحذف أو الاستعادة' using errcode='42501'; end if;
   if new.id is distinct from old.id or (TG_TABLE_NAME <> 'guide_universities' and to_jsonb(new)->>'university_id' is distinct from to_jsonb(old)->>'university_id') then raise exception 'لا يمكن نقل السجل لجامعة أخرى' using errcode='42501'; end if;
 end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['guide_universities','guide_programs','guide_tracks','guide_cutoffs'] loop
  execute format('drop trigger if exists guide_write_guard on public.%I',t);
  execute format('create trigger guide_write_guard before insert or update on public.%I for each row execute function public.guide_guard_write()',t);
 end loop;
end $$;

create or replace function public.guide_set_member(target_email text, allow_edit boolean, allow_publish boolean, allow_delete boolean, active boolean, assigned_ids uuid[])
returns uuid language plpgsql security definer set search_path=''
as $$ declare member_id uuid; begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير الفريق' using errcode='42501'; end if;
 select id into member_id from auth.users where lower(email)=lower(trim(target_email)) limit 1;
 if member_id is null then raise exception 'البريد غير موجود في Authentication > Users'; end if;
 if exists(select 1 from public.guide_admins where user_id=member_id and is_owner) then raise exception 'لا يمكن تعديل حساب المالك'; end if;
 if (allow_publish or allow_delete) and not allow_edit then raise exception 'النشر والحذف يتطلبان صلاحية التعديل'; end if;
 if coalesce(array_length(assigned_ids,1),0)>100 or array_position(assigned_ids,null) is not null then raise exception 'قائمة جامعات غير صالحة'; end if;
 if (select count(distinct id) from public.guide_universities where id=any(coalesce(assigned_ids,array[]::uuid[]))) <> (select count(distinct x) from unnest(coalesce(assigned_ids,array[]::uuid[])) x) then raise exception 'جامعة غير موجودة'; end if;
 insert into public.guide_admins(user_id,is_enabled,can_edit,can_publish,can_delete)
 values(member_id,active,allow_edit,allow_publish,allow_delete)
 on conflict(user_id) do update set is_enabled=excluded.is_enabled,can_edit=excluded.can_edit,can_publish=excluded.can_publish,can_delete=excluded.can_delete;
 delete from public.guide_assignments where user_id=member_id;
 insert into public.guide_assignments(user_id,university_id) select member_id,x from (select distinct unnest(coalesce(assigned_ids,array[]::uuid[])) x) q;
 return member_id;
end $$;
revoke all on function public.guide_set_member(text,boolean,boolean,boolean,boolean,uuid[]) from public;
grant execute on function public.guide_set_member(text,boolean,boolean,boolean,boolean,uuid[]) to authenticated;
create or replace function public.guide_remove_member(target_id uuid) returns void language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير الفريق' using errcode='42501'; end if;
 update public.guide_admins set is_enabled=false,can_edit=false,can_publish=false,can_delete=false
 where user_id=target_id and not is_owner;
 if not found then raise exception 'المساهم غير موجود أو هو المالك'; end if;
 delete from public.guide_assignments where user_id=target_id;
end $$;
revoke all on function public.guide_remove_member(uuid) from public;
grant execute on function public.guide_remove_member(uuid) to authenticated;
create or replace function public.guide_list_team()
returns table(user_id uuid,email text,is_enabled boolean,can_edit boolean,can_publish boolean,can_delete boolean,university_ids uuid[])
language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير الفريق' using errcode='42501'; end if;
 return query select a.user_id,u.email::text,a.is_enabled,a.can_edit,a.can_publish,a.can_delete,
 coalesce(array_agg(s.university_id) filter(where s.university_id is not null),array[]::uuid[])
 from public.guide_admins a join auth.users u on u.id=a.user_id
 left join public.guide_assignments s on s.user_id=a.user_id where not a.is_owner
 group by a.user_id,u.email,a.is_enabled,a.can_edit,a.can_publish,a.can_delete order by u.email;
end $$;
revoke all on function public.guide_list_team() from public;
grant execute on function public.guide_list_team() to authenticated;

-- أسماء الفريق وطلبات التسجيل؛ بيانات Authentication لا يقرأها إلا المالك عبر هذه الدوال.
create table if not exists public.guide_member_profiles (
 user_id uuid primary key references public.guide_admins(user_id) on delete cascade,
 display_name text not null check(length(trim(display_name)) between 2 and 100)
);
alter table public.guide_member_profiles enable row level security;
revoke all on public.guide_member_profiles from anon,authenticated;
grant select on public.guide_member_profiles to authenticated;
drop policy if exists "Guide owner profile read" on public.guide_member_profiles;
create policy "Guide owner profile read" on public.guide_member_profiles for select to authenticated using (public.guide_is_owner() or user_id=auth.uid());

create or replace function public.guide_set_member_details(
 target_email text, display_name text, allow_edit boolean, allow_publish boolean,
 allow_delete boolean, active boolean, assigned_ids uuid[]
) returns uuid language plpgsql security definer set search_path=''
as $$ declare member_id uuid; begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير الفريق' using errcode='42501'; end if;
 if display_name is null or length(trim(display_name)) not between 2 and 100 then raise exception 'الاسم يجب أن يكون من 2 إلى 100 حرف'; end if;
 member_id:=public.guide_set_member(target_email,allow_edit,allow_publish,allow_delete,active,assigned_ids);
 insert into public.guide_member_profiles(user_id,display_name) values(member_id,trim(display_name))
 on conflict(user_id) do update set display_name=excluded.display_name;
 return member_id;
end $$;
revoke all on function public.guide_set_member_details(text,text,boolean,boolean,boolean,boolean,uuid[]) from public;
grant execute on function public.guide_set_member_details(text,text,boolean,boolean,boolean,boolean,uuid[]) to authenticated;

create or replace function public.guide_team_directory()
returns table(user_id uuid,email text,display_name text,is_enabled boolean,can_edit boolean,can_publish boolean,can_delete boolean,university_ids uuid[])
language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يدير الفريق' using errcode='42501'; end if;
 return query select a.user_id,u.email::text,
 coalesce(nullif(trim(p.display_name),''),nullif(trim(u.raw_user_meta_data->>'guide_name'),''),u.email)::text,
 a.is_enabled,a.can_edit,a.can_publish,a.can_delete,
 coalesce(array_agg(s.university_id) filter(where s.university_id is not null),array[]::uuid[])
 from public.guide_admins a join auth.users u on u.id=a.user_id
 left join public.guide_member_profiles p on p.user_id=a.user_id
 left join public.guide_assignments s on s.user_id=a.user_id where not a.is_owner
 group by a.user_id,u.email,u.raw_user_meta_data,p.display_name,a.is_enabled,a.can_edit,a.can_publish,a.can_delete
 order by u.email;
end $$;
revoke all on function public.guide_team_directory() from public;
grant execute on function public.guide_team_directory() to authenticated;

create or replace function public.guide_pending_signups()
returns table(user_id uuid,email text,display_name text,registered_at timestamptz,email_confirmed boolean)
language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يرى طلبات التسجيل' using errcode='42501'; end if;
 return query select u.id,u.email::text,coalesce(nullif(trim(u.raw_user_meta_data->>'guide_name'),''),'اسم غير محدد')::text,
 u.created_at,u.email_confirmed_at is not null
 from auth.users u
 where u.raw_user_meta_data->>'guide_signup'='true'
 and not exists(select 1 from public.guide_admins a where a.user_id=u.id)
 order by u.created_at desc limit 100;
end $$;
revoke all on function public.guide_pending_signups() from public;
grant execute on function public.guide_pending_signups() to authenticated;

create table if not exists public.guide_audit_log (
 id bigint generated always as identity primary key,
 changed_at timestamptz not null default now(), actor_id uuid, actor_email text,
 table_name text not null, row_id uuid not null, action text not null,
 before_data jsonb, after_data jsonb
);
alter table public.guide_audit_log add column if not exists actor_email text;
create index if not exists guide_audit_recent on public.guide_audit_log(changed_at desc);
alter table public.guide_audit_log enable row level security;
revoke all on public.guide_audit_log from anon,authenticated;
grant select on public.guide_audit_log to authenticated;
drop policy if exists "Guide owner audit read" on public.guide_audit_log;
create policy "Guide owner audit read" on public.guide_audit_log for select to authenticated using ((select public.guide_is_owner()));
create or replace function public.guide_record_audit() returns trigger language plpgsql security definer set search_path=''
as $$ begin
 insert into public.guide_audit_log(actor_id,actor_email,table_name,row_id,action,before_data,after_data)
 values(auth.uid(),(select email from auth.users where id=auth.uid()),TG_TABLE_NAME,case when TG_OP='DELETE' then old.id else new.id end,TG_OP,
 case when TG_OP='INSERT' then null else to_jsonb(old) end,
 case when TG_OP='DELETE' then null else to_jsonb(new) end);
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['guide_universities','guide_programs','guide_tracks','guide_cutoffs'] loop
  execute format('drop trigger if exists guide_audit_change on public.%I',t);
  execute format('create trigger guide_audit_change after insert or update or delete on public.%I for each row execute function public.guide_record_audit()',t);
 end loop;
end $$;
-- إعداد الأقسام المرنة والتحليلات ضمن تشغيل واحد للملف الكامل.
create table if not exists public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.guide_universities(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  content text not null check (length(trim(content)) between 2 and 10000),
  display_order integer not null default 0,
  source_url text not null default '',
  verified_on date,
  published boolean not null default false,
  publication_excluded boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint guide_section_publication_state check (not (published and publication_excluded))
);
alter table public.guide_sections add column if not exists publication_excluded boolean not null default false;
alter table public.guide_sections drop constraint if exists guide_section_publication_state;
alter table public.guide_sections add constraint guide_section_publication_state check (not (published and publication_excluded));
create index if not exists guide_sections_university_order on public.guide_sections(university_id,display_order,created_at);
alter table public.guide_sections enable row level security;
revoke all on public.guide_sections from anon,authenticated;
grant select on public.guide_sections to anon,authenticated;
grant insert,update,delete on public.guide_sections to authenticated;
drop policy if exists "Guide section published read" on public.guide_sections;
create policy "Guide section published read" on public.guide_sections for select to anon,authenticated
using (published and deleted_at is null and exists (
  select 1 from public.guide_universities u where u.id=university_id and u.published and u.deleted_at is null
));
drop policy if exists "Guide section team read" on public.guide_sections;
create policy "Guide section team read" on public.guide_sections for select to authenticated
using (public.guide_allowed(university_id,'read'));
drop policy if exists "Guide section team insert" on public.guide_sections;
create policy "Guide section team insert" on public.guide_sections for insert to authenticated
with check (public.guide_allowed(university_id,'edit') and (not published or public.guide_allowed(university_id,'publish')) and deleted_at is null);
drop policy if exists "Guide section team update" on public.guide_sections;
create policy "Guide section team update" on public.guide_sections for update to authenticated
using (public.guide_allowed(university_id,'edit') or public.guide_allowed(university_id,'delete'))
with check ((public.guide_allowed(university_id,'edit') or public.guide_allowed(university_id,'delete'))
 and (not published or public.guide_allowed(university_id,'publish')));
drop policy if exists "Guide section owner delete" on public.guide_sections;
create policy "Guide section owner delete" on public.guide_sections for delete to authenticated
using ((select public.guide_is_owner()));
drop trigger if exists guide_write_guard on public.guide_sections;
create trigger guide_write_guard before insert or update on public.guide_sections
for each row execute function public.guide_guard_write();
drop trigger if exists guide_audit_change on public.guide_sections;
create trigger guide_audit_change after insert or update or delete on public.guide_sections
for each row execute function public.guide_record_audit();

-- نشر الجامعة ومحتواها المتاح في عملية واحدة. الإخفاء اليدوي يبقى محفوظًا.
create or replace function public.guide_publish_university_with_content(target_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  programs_count integer := 0;
  tracks_count integer := 0;
  sections_count integer := 0;
  pending_tracks integer := 0;
  hidden_count integer := 0;
begin
  if not public.guide_allowed(target_id,'edit') or not public.guide_allowed(target_id,'publish') then
    raise exception 'لا تملك صلاحية نشر الجامعة ومحتواها' using errcode='42501';
  end if;
  perform 1 from public.guide_universities where id=target_id and deleted_at is null for update;
  if not found then raise exception 'الجامعة غير موجودة أو في السلة'; end if;
  update public.guide_universities set published=true where id=target_id and not published;

  update public.guide_programs set published=true
    where university_id=target_id and deleted_at is null and not published and not publication_excluded;
  get diagnostics programs_count=row_count;

  update public.guide_tracks set published=true
    where university_id=target_id and deleted_at is null and not published and not publication_excluded
      and length(trim(source_url))>0 and verified_on is not null
      and (abs(school_weight+aptitude_weight+achievement_weight-100)<=.01
        or (school_weight+aptitude_weight+achievement_weight=0 and length(trim(requirements))>0));
  get diagnostics tracks_count=row_count;

  update public.guide_sections set published=true
    where university_id=target_id and deleted_at is null and not published and not publication_excluded;
  get diagnostics sections_count=row_count;

  select count(*) into pending_tracks from public.guide_tracks
    where university_id=target_id and deleted_at is null and not published and not publication_excluded;
  select (select count(*) from public.guide_programs where university_id=target_id and deleted_at is null and publication_excluded)
       + (select count(*) from public.guide_tracks where university_id=target_id and deleted_at is null and publication_excluded)
       + (select count(*) from public.guide_sections where university_id=target_id and deleted_at is null and publication_excluded)
    into hidden_count;
  return pg_catalog.jsonb_build_object('programs',programs_count,'tracks',tracks_count,
    'sections',sections_count,'pending_tracks',pending_tracks,'hidden',hidden_count);
end $$;
revoke all on function public.guide_publish_university_with_content(uuid) from public;
grant execute on function public.guide_publish_university_with_content(uuid) to authenticated;

create table if not exists public.guide_daily_interest (
  event_day date not null default current_date,
  event_kind text not null check (event_kind in ('university','program')),
  entity_id uuid not null,
  hits bigint not null default 1 check (hits >= 0),
  primary key (event_day,event_kind,entity_id)
);
create index if not exists guide_interest_entity on public.guide_daily_interest(event_kind,entity_id,event_day);

create table if not exists public.guide_daily_missing_search (
  event_day date not null default current_date,
  search_term text not null check (char_length(search_term) between 3 and 80),
  hits bigint not null default 1 check (hits >= 0),
  primary key (event_day,search_term)
);

alter table public.guide_daily_interest enable row level security;
alter table public.guide_daily_missing_search enable row level security;
revoke all on public.guide_daily_interest, public.guide_daily_missing_search from anon,authenticated;
grant select on public.guide_daily_interest, public.guide_daily_missing_search to authenticated;
drop policy if exists "Guide owner interest" on public.guide_daily_interest;
create policy "Guide owner interest" on public.guide_daily_interest for select to authenticated using ((select public.guide_is_owner()));
drop policy if exists "Guide owner missing searches" on public.guide_daily_missing_search;
create policy "Guide owner missing searches" on public.guide_daily_missing_search for select to authenticated using ((select public.guide_is_owner()));

create or replace function public.guide_record_interest(event_kind text, record_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$ begin
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
as $$ declare term text; begin
  term:=lower(trim(regexp_replace(coalesce(search_term,''),'\s+',' ','g')));
  if char_length(term) not between 3 and 80 or term ~ '[@/:\\]' or term ~ '[0-9]{6,}' then return; end if;
  -- حد أعلى للمصطلحات المختلفة في اليوم؛ يمنع تضخم الجدول بسبب إدخال آلي.
  if not exists(select 1 from public.guide_daily_missing_search where event_day=current_date and search_term=term)
    and (select count(*) from public.guide_daily_missing_search where event_day=current_date)>=500 then return; end if;
  insert into public.guide_daily_missing_search(event_day,search_term,hits) values(current_date,term,1)
  on conflict (event_day,search_term) do update set hits=public.guide_daily_missing_search.hits+1;
end $$;
revoke all on function public.guide_record_missing_search(text) from public;
grant execute on function public.guide_record_missing_search(text) to anon,authenticated;

create or replace function public.guide_analytics_size()
returns bigint language plpgsql stable security definer set search_path = ''
as $$ begin
  if not public.guide_is_owner() then raise exception 'المالك فقط يرى التحليلات' using errcode='42501'; end if;
  return pg_catalog.pg_database_size(current_database());
end $$;
revoke all on function public.guide_analytics_size() from public;
grant execute on function public.guide_analytics_size() to authenticated;

create or replace function public.guide_delete_archived_analytics(before_day date, expected_interest bigint, expected_searches bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $$ declare interest_count bigint; search_count bigint; begin
  if not public.guide_is_owner() then raise exception 'المالك فقط يحذف التحليلات' using errcode='42501'; end if;
  if before_day is null or before_day > current_date-90 or expected_interest < 0 or expected_searches < 0 then
    raise exception 'يمكن أرشفة البيانات التي مضى عليها 90 يومًا فقط';
  end if;
  lock table public.guide_daily_interest,public.guide_daily_missing_search in share row exclusive mode;
  select count(*) into interest_count from public.guide_daily_interest where event_day < before_day;
  select count(*) into search_count from public.guide_daily_missing_search where event_day < before_day;
  if interest_count <> expected_interest or search_count <> expected_searches then
    raise exception 'تغير عدد الصفوف بعد التصدير؛ أعد تنزيل الملف قبل الحذف';
  end if;
  delete from public.guide_daily_interest where event_day < before_day;
  delete from public.guide_daily_missing_search where event_day < before_day;
  return jsonb_build_object('interest_rows',interest_count,'search_rows',search_count);
end $$;
revoke all on function public.guide_delete_archived_analytics(date,bigint,bigint) from public;
grant execute on function public.guide_delete_archived_analytics(date,bigint,bigint) to authenticated;

-- النسب التاريخية تبقى للإدارة فقط؛ لا يكفي إخفاؤها من صفحة الطالب.
drop policy if exists "Guide published read" on public.guide_cutoffs;

-- استبدال صلاحية الحذف النهائي الخاصة بالجامعة؛ تبقى عملية الحذف داخل RLS للمالك.
create or replace function public.guide_delete_university_permanently(target_id uuid)
returns void language plpgsql security invoker set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يحذف نهائيًا' using errcode='42501'; end if;
 if not exists(select 1 from public.guide_universities where id=target_id and deleted_at is not null) then raise exception 'انقل الجامعة للسلة أولًا'; end if;
 delete from public.guide_cutoffs where university_id=target_id;
 delete from public.guide_tracks where university_id=target_id;
 delete from public.guide_programs where university_id=target_id;
 delete from public.guide_universities where id=target_id;
end $$;
revoke all on function public.guide_delete_university_permanently(uuid) from public;
grant execute on function public.guide_delete_university_permanently(uuid) to authenticated;
-- تبقى النسب السابقة خارج واجهة الزائر وقراءة API العامة حتى تفعيلها لاحقًا.
drop policy if exists "Guide published read" on public.guide_cutoffs;
-- أعداد التخصصات المنشورة للصفحة الرئيسية، بدل تنزيل كل تخصص عند كل زيارة.
create or replace function public.guide_public_program_counts()
returns table(university_id uuid, program_count bigint)
language sql stable security definer set search_path = ''
as $$
  select p.university_id, count(*)::bigint
  from public.guide_programs p join public.guide_universities u on u.id=p.university_id
  where p.published and p.deleted_at is null and u.published and u.deleted_at is null
  group by p.university_id
$$;
revoke all on function public.guide_public_program_counts() from public;
grant execute on function public.guide_public_program_counts() to anon, authenticated;
-- عند إعادة تشغيل المخطط بعد تحديث بلس، حافظ على حماية أقسام نسب القبول.
do $$ begin
 if to_regprocedure('public.guide_feature_state(text)') is not null then
  drop policy if exists "Guide section published read" on public.guide_sections;
  create policy "Guide section published read" on public.guide_sections for select to anon,authenticated
   using (published and deleted_at is null and exists (
    select 1 from public.guide_universities u where u.id=university_id and u.published and u.deleted_at is null
   ) and ((feature_key<>'historical_cutoffs' and title !~* '(نسب(ة|ه)?[[:space:]]*القبول|معدلات?[[:space:]]*القبول|[اأ]قل[[:space:]]*موزون|حد[[:space:]]*القبول)')
    or (select public.guide_feature_state('historical_cutoffs')) in ('free','plus')));
 end if;
end $$;
commit;
notify pgrst, 'reload schema';

-- بعد إنشاء حسابك من Authentication > Users شغّل السطر التالي وحده مع بريدك:
-- insert into public.guide_admins(user_id)
-- select id from auth.users where email = 'your-email@example.com'
-- on conflict (user_id) do nothing;
