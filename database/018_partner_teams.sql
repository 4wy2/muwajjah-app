-- 018: partners and their own teams.
-- The owner can mark an existing team member as a partner. A partner keeps
-- exactly what they have today, and can also add people who work with them
-- ("their team"), give each one some of the partner's own universities, and
-- decide view-only or edit (edit only if the partner can edit).
-- A partner never sees or changes the owner's team, other partners' teams,
-- or any owner-only page. A team member can never reach a university the
-- partner no longer has, and loses everything if the partner is disabled or
-- stops being a partner.
-- Additive: two new columns (default = today's behaviour), new functions, and
-- guide_allowed gains one extra condition that only applies to rows with
-- managed_by set (none exist today), so current access is unchanged.
-- Backup: backup.guide_admins_018, backup.guide_assignments_018.
-- Rollback: 018_partner_teams_rollback.sql
begin;
create schema if not exists backup;
create table if not exists backup.guide_admins_018 as select * from public.guide_admins;
create table if not exists backup.guide_assignments_018 as select * from public.guide_assignments;
revoke all on backup.guide_admins_018 from anon, authenticated;
revoke all on backup.guide_assignments_018 from anon, authenticated;

alter table public.guide_admins add column if not exists is_partner boolean not null default false;
alter table public.guide_admins add column if not exists managed_by uuid references public.guide_admins(user_id) on delete set null;
create index if not exists guide_admins_managed_by on public.guide_admins(managed_by) where managed_by is not null;

-- Same rule as before, plus: a partner's team member only reaches a
-- university while their partner is enabled, still a partner, and still has
-- that university (and can only edit while the partner can edit).
create or replace function public.guide_allowed(target_id uuid, action text) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.guide_admins a where a.user_id=auth.uid() and a.is_enabled and
 (a.is_owner or (action in ('read','edit','publish','delete') and exists(select 1 from public.guide_assignments s where s.user_id=a.user_id and s.university_id=target_id)
 and (action='read' or action='edit' and a.can_edit or action='publish' and a.can_publish or action='delete' and a.can_delete)
 and (a.managed_by is null or exists(select 1 from public.guide_admins m join public.guide_assignments ms on ms.user_id=m.user_id
   where m.user_id=a.managed_by and m.is_enabled and m.is_partner and ms.university_id=target_id
   and (action='read' or m.can_edit)))))) $$;
revoke all on function public.guide_allowed(uuid,text) from public;
grant execute on function public.guide_allowed(uuid,text) to authenticated;

create or replace function public.guide_is_partner() returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.guide_admins where user_id=auth.uid() and is_enabled and is_partner and not is_owner) $$;
revoke all on function public.guide_is_partner() from public, anon;
grant execute on function public.guide_is_partner() to authenticated;

-- Owner: make a member a partner, or stop it. While a partner is stopped,
-- their team stays linked to them and reaches nothing; making them a
-- partner again brings their team back as it was.
create or replace function public.guide_owner_set_partner(target_id uuid, partner boolean)
returns void language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_owner() then raise exception 'المالك فقط يحدد الشركاء' using errcode='42501'; end if;
 if target_id is null or partner is null then raise exception 'بيانات ناقصة'; end if;
 update public.guide_admins set is_partner=partner, managed_by=case when partner then null else managed_by end
  where user_id=target_id and not is_owner;
 if not found then raise exception 'العضو غير موجود أو هو المالك'; end if;
 insert into public.guide_access_events(actor_id,target_user_id,action,note)
  values(auth.uid(),target_id,case when partner then 'partner_on' else 'partner_off' end,'');
end $$;
revoke all on function public.guide_owner_set_partner(uuid,boolean) from public, anon;
grant execute on function public.guide_owner_set_partner(uuid,boolean) to authenticated;

-- Partner: list my team.
create or replace function public.guide_partner_team()
returns table(user_id uuid, email text, display_name text, is_enabled boolean, can_edit boolean, university_ids uuid[])
language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_partner() then raise exception 'هذه الصفحة للشركاء فقط' using errcode='42501'; end if;
 return query select a.user_id,u.email::text,
  coalesce(nullif(trim(p.display_name),''),nullif(trim(u.raw_user_meta_data->>'guide_name'),''),u.email)::text,
  a.is_enabled,a.can_edit,
  coalesce(array_agg(s.university_id) filter(where s.university_id is not null),array[]::uuid[])
 from public.guide_admins a join auth.users u on u.id=a.user_id
 left join public.guide_member_profiles p on p.user_id=a.user_id
 left join public.guide_assignments s on s.user_id=a.user_id
 where a.managed_by=auth.uid()
 group by a.user_id,u.email,u.raw_user_meta_data,p.display_name,a.is_enabled,a.can_edit
 order by u.email;
end $$;
revoke all on function public.guide_partner_team() from public, anon;
grant execute on function public.guide_partner_team() to authenticated;

-- Partner: add or update someone on my team.
create or replace function public.guide_partner_set_member(target_email text, display_name text, allow_edit boolean, active boolean, assigned_ids uuid[])
returns uuid language plpgsql security definer set search_path=''
as $$ declare me uuid := auth.uid(); member_id uuid; mine public.guide_admins; existing public.guide_admins; ids uuid[];
begin
 if not public.guide_is_partner() then raise exception 'هذه الصفحة للشركاء فقط' using errcode='42501'; end if;
 if display_name is null or length(trim(display_name)) not between 2 and 100 then raise exception 'الاسم يجب أن يكون من 2 إلى 100 حرف'; end if;
 if allow_edit is null or active is null then raise exception 'بيانات ناقصة'; end if;
 select * into mine from public.guide_admins where user_id=me;
 if allow_edit and not mine.can_edit then raise exception 'ما تقدر تعطي تعديل وأنت ما عندك صلاحية تعديل'; end if;
 select id into member_id from auth.users where lower(email)=lower(trim(target_email)) limit 1;
 if member_id is null then raise exception 'هذا الإيميل ما سجّل في الموقع بعد، خله يسجل دخول بـGoogle أول'; end if;
 if member_id=me then raise exception 'ما تقدر تضيف نفسك'; end if;
 select * into existing from public.guide_admins where user_id=member_id;
 if found and (existing.is_owner or existing.is_partner or existing.managed_by is distinct from me) then
  raise exception 'هذا الحساب تابع للإدارة، ما تقدر تعدله'; end if;
 ids := coalesce((select array_agg(distinct x) from unnest(coalesce(assigned_ids,array[]::uuid[])) x where x is not null),array[]::uuid[]);
 if coalesce(array_length(ids,1),0)>100 then raise exception 'قائمة جامعات غير صالحة'; end if;
 if exists(select 1 from unnest(ids) x where not exists(select 1 from public.guide_assignments s where s.user_id=me and s.university_id=x)) then
  raise exception 'تقدر تعطي بس من الجامعات اللي عندك'; end if;
 insert into public.guide_admins(user_id,is_enabled,can_edit,can_publish,can_delete,is_partner,managed_by)
 values(member_id,active,allow_edit,false,false,false,me)
 on conflict(user_id) do update set is_enabled=excluded.is_enabled,can_edit=excluded.can_edit,can_publish=false,can_delete=false;
 delete from public.guide_assignments where user_id=member_id;
 insert into public.guide_assignments(user_id,university_id) select member_id,x from unnest(ids) x;
 insert into public.guide_member_profiles(user_id,display_name) values(member_id,trim(display_name))
  on conflict(user_id) do update set display_name=excluded.display_name;
 insert into public.guide_access_events(actor_id,target_user_id,action,note) values(me,member_id,'partner_member_set','');
 return member_id;
end $$;
revoke all on function public.guide_partner_set_member(text,text,boolean,boolean,uuid[]) from public, anon;
grant execute on function public.guide_partner_set_member(text,text,boolean,boolean,uuid[]) to authenticated;

-- Partner: stop someone on my team (same as the owner's remove: disabled, not deleted).
create or replace function public.guide_partner_remove_member(target_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
 if not public.guide_is_partner() then raise exception 'هذه الصفحة للشركاء فقط' using errcode='42501'; end if;
 update public.guide_admins set is_enabled=false,can_edit=false,can_publish=false,can_delete=false
  where user_id=target_id and managed_by=auth.uid();
 if not found then raise exception 'هذا الشخص مو من فريقك'; end if;
 delete from public.guide_assignments where user_id=target_id;
 insert into public.guide_access_events(actor_id,target_user_id,action,note) values(auth.uid(),target_id,'partner_member_off','');
end $$;
revoke all on function public.guide_partner_remove_member(uuid) from public, anon;
grant execute on function public.guide_partner_remove_member(uuid) to authenticated;
commit;
