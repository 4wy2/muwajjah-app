-- Undo 014: remove the read-only health function.
begin;
drop function if exists public.guide_owner_site_health();
commit;
