-- Rollback for 024: restore every touched row from backup.guide_programs_024.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.guide_admins where is_owner and is_enabled limit 1),true);
update public.guide_programs g set name=b.name, college=b.college, degree=b.degree, gender=b.gender, deleted_at=b.deleted_at from backup.guide_programs_024 b where g.id=b.id;
commit;
