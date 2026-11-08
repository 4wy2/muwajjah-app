-- مُوجّه 002: السماح بمسار قبول نصي بلا عام أكاديمي (SAT، أولمبياد، قبول بشروط).
--
-- الأثر:
--   * يستبدل قيد «العام الأكاديمي إلزامي» في guide_tracks بقيد أضيق:
--     العام إلزامي للمسار الموزون، واختياري فقط للمسار النصي (مجموع الأوزان = 0).
--   * لا يحذف ولا يعدّل أي صف. لا يمس النسب السابقة (تبقى السنة إلزامية لها).
--   * لا يغيّر شروط النشر: نشر أي مسار ما زال يتطلب رابط مصدر وتاريخ تحقق،
--     والمسار النصي يحتاج نص شروط ليُنشر عبر «نشر الجامعة ومحتواها».
--
-- قبل التشغيل: خذ نسخة احتياطية (Database > Backups أو pg_dump).
-- قابل لإعادة التشغيل. الاسترجاع في آخر الملف.
begin;
do $$
declare c record;
begin
  -- اسم القيد في الإنتاج قد يختلف؛ احذف فقط قيود CHECK التي تذكر academic_year
  -- وليست قيد النشر guide_track_publish_valid.
  for c in
    select conname from pg_catalog.pg_constraint
    where conrelid = 'public.guide_tracks'::regclass and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) ilike '%academic_year%'
      and conname not in ('guide_track_publish_valid', 'guide_track_year_rule')
  loop
    raise notice 'dropping constraint %', c.conname;
    execute format('alter table public.guide_tracks drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.guide_tracks drop constraint if exists guide_track_year_rule;
alter table public.guide_tracks add constraint guide_track_year_rule check (
  length(trim(academic_year)) > 0
  or school_weight + aptitude_weight + achievement_weight = 0
);
commit;
notify pgrst, 'reload schema';

-- الاسترجاع (يفشل عمدًا إذا وُجدت مسارات نصية بلا سنة؛ أضف لها سنة أو احذفها أولًا):
-- begin;
-- alter table public.guide_tracks drop constraint if exists guide_track_year_rule;
-- alter table public.guide_tracks add constraint guide_tracks_academic_year_check
--   check (length(trim(academic_year)) > 0);
-- commit;
