-- 028: weighted-score tracks checked against the booklet (agent extraction weights.csv) — all 58 existing
-- unpublished tracks matched; published them. Added Umm Al-Qura's two tracks (booklet p.56: 40/30/30 and 50/20/30).
-- Backup: backup.guide_tracks_028. Rollback: delete the two Umm Al-Qura rows created here; restore published from backup.
create table backup.guide_tracks_028 as select * from public.guide_tracks;
do $c$ declare n int; begin
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.guide_admins where is_owner and is_enabled limit 1),true);
  insert into public.guide_tracks(university_id,name,academic_year,gender,school_weight,aptitude_weight,achievement_weight,requirements,source_url,published,publication_excluded)
  select id,'التخصصات العلمية','غير مذكور في المصدر','',40,30,30,'','',true,false from public.guide_universities where name='جامعة أم القرى'
  union all
  select id,'التخصصات النظرية والإدارية','غير مذكور في المصدر','',50,20,30,'','',true,false from public.guide_universities where name='جامعة أم القرى';
  get diagnostics n=row_count; if n<>2 then raise exception 'insert %',n; end if;
  update public.guide_tracks set published=true where deleted_at is null and not published and not publication_excluded;
  get diagnostics n=row_count; if n<>58 then raise exception 'publish %',n; end if;
end $c$;
