-- 025: fix a mistake in 024. The diploma rule matched «التطبيقية» inside bachelor college names
-- (كلية العلوم الطبية التطبيقية، كلية التصاميم والفنون التطبيقية، كلية الدراسات التطبيقية وخدمة المجتمع، مسار كلية … التطبيقية).
-- Restores their original degree from backup.guide_programs_024 (139 rows). Rollback: re-run the 024 diploma step for these rows.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.guide_admins where is_owner and is_enabled limit 1),true);
do $c$ declare n int; begin
  update public.guide_programs g set degree=b.degree from backup.guide_programs_024 b
   where g.id=b.id and g.deleted_at is null and b.degree='بكالوريوس' and g.degree='دبلوم'
   and b.college ~ '(العلوم الطبية التطبيقية|الفنون التطبيقية|الدراسات التطبيقية|^مسار كلية)';
  get diagnostics n=row_count;
  if n<>139 then raise exception 'unexpected revert count %', n; end if;
end $c$;
commit;
