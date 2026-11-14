-- 026: fix a mistake in 024. Five Taif business-administration tracks (التسويق، الإدارة، التمويل، المحاسبة، نظم المعلومات الإدارية)
-- were trashed as "duplicates" of themselves. The booklet (p.93) lists all five. Restored, gender set to الجميع like the rest.
-- Rollback: set deleted_at=now(), gender='غير محدد' for the same five ids.
do $c$ declare n int; begin
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.guide_admins where is_owner and is_enabled limit 1),true);
  update public.guide_programs set deleted_at=null, gender='الجميع'
   where deleted_at is not null and gender='غير محدد' and id in ('5be3e9c5-8541-43c7-932e-dc0bc162c43f','83d82722-9f8b-4616-bac9-60dea0cdedef','54395f4d-373a-4482-8925-744918a61da1','3554ec71-ddc6-42e4-81a5-6bccfeb93085','d9c40d09-14d5-4f30-b136-6569ffa08d13');
  get diagnostics n=row_count;
  if n<>5 then raise exception 'unexpected restore count %', n; end if;
end $c$;
