-- Undo 021: partners stop seeing the change log; the owner is unaffected.
begin;
drop policy if exists "Guide partner team audit read" on public.guide_audit_log;
drop index if exists public.guide_audit_log_actor;
commit;
