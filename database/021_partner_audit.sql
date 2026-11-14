-- 021: a partner can read the change log of their own team (and their own
-- changes). Only one new read rule on guide_audit_log and an index; nothing
-- else changes. The owner still reads everything; nobody can write to the log.
-- Rollback: 021_partner_audit_rollback.sql
begin;
create index if not exists guide_audit_log_actor on public.guide_audit_log(actor_id, changed_at desc);
drop policy if exists "Guide partner team audit read" on public.guide_audit_log;
create policy "Guide partner team audit read" on public.guide_audit_log for select to authenticated
 using (
   (select public.guide_is_partner())
   and (actor_id = (select auth.uid())
        or exists (select 1 from public.guide_admins a
                   where a.user_id = guide_audit_log.actor_id and a.managed_by = (select auth.uid())))
 );
commit;
