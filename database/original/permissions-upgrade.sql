-- مُوجّه: صلاحيات الفريق على قاعدة البيانات نفسها. شغّل مرة واحدة أو أعد التشغيل بأمان.
begin;
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
commit;
notify pgrst, 'reload schema';
