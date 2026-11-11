-- 010 (PREPARED, NOT APPLIED): defence in depth for admin/owner RPCs.
-- Every function below already refuses non-owners inside its body (checked
-- 2026-11-11). This also stops visitors (anon) from calling them at all, so a
-- future mistake inside one of them cannot be reached without signing in.
-- Public functions (feature state, program search, interest, compare,
-- missing-search, google-enabled, program counts) are NOT touched.
-- Verify after applying: Supabase Advisors → anon_security_definer_function_executable
-- should list only the public functions. Rollback: 010_revoke_anon_admin_rpc_rollback.sql
begin;
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('guide_set_member','guide_set_member_details','guide_remove_member',
        'guide_list_team','guide_team_directory','guide_pending_signups',
        'guide_delete_archived_analytics','guide_analytics_size','guide_is_admin',
        'guide_is_owner','guide_allowed','guide_record_audit')
  loop
    execute format('revoke execute on function %s from anon, public', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
commit;
