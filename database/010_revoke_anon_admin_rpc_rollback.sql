begin;
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('guide_set_member','guide_set_member_details','guide_remove_member',
        'guide_list_team','guide_team_directory','guide_pending_signups',
        'guide_delete_archived_analytics','guide_analytics_size','guide_record_audit')
  loop
    execute format('grant execute on function %s to anon', f.sig);
  end loop;
end $$;
commit;
