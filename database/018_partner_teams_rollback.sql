-- Undo 018. Partners' team members are disabled first (their access depended
-- on their partner), then the partner functions and the two columns go, and
-- guide_allowed returns to its previous text.
begin;
update public.guide_admins set is_enabled=false,can_edit=false,can_publish=false,can_delete=false
 where managed_by is not null;
delete from public.guide_assignments s using public.guide_admins a
 where a.user_id=s.user_id and a.managed_by is not null;

drop function if exists public.guide_partner_remove_member(uuid);
drop function if exists public.guide_partner_set_member(text,text,boolean,boolean,uuid[]);
drop function if exists public.guide_partner_team();
drop function if exists public.guide_owner_set_partner(uuid,boolean);
drop function if exists public.guide_is_partner();

create or replace function public.guide_allowed(target_id uuid, action text) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.guide_admins a where a.user_id=auth.uid() and a.is_enabled and
 (a.is_owner or (action in ('read','edit','publish','delete') and exists(select 1 from public.guide_assignments s where s.user_id=a.user_id and s.university_id=target_id)
 and (action='read' or action='edit' and a.can_edit or action='publish' and a.can_publish or action='delete' and a.can_delete)))) $$;
revoke all on function public.guide_allowed(uuid,text) from public;
grant execute on function public.guide_allowed(uuid,text) to authenticated;

drop index if exists public.guide_admins_managed_by;
alter table public.guide_admins drop column if exists managed_by;
alter table public.guide_admins drop column if exists is_partner;
commit;
