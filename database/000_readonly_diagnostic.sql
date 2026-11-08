-- مُوجّه — فحص قراءة فقط لحالة قاعدة الإنتاج (لا يعدّل أي شيء)
-- شغّله في Supabase > SQL Editor ثم انسخ النتائج (أو صدّرها CSV) وأرسلها.
-- كل الأعداد هنا count(*) فعلي، لا تقديرات pg_class/pg_stat.

-- 1) الجداول والأعمدة الموجودة فعلًا في public وتبدأ بـ guide_ أو أسماء الجداول القديمة
select table_name, string_agg(column_name, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public'
  and (table_name like 'guide\_%' or table_name in ('universities','majors','admission_tracks','colleges','cutoffs'))
group by table_name order by table_name;

-- 2) الدوال المتوقعة: موجودة أم لا
select f.name, to_regprocedure(f.sig) is not null as exists
from (values
  ('guide_change_record_state','public.guide_change_record_state(text,uuid[],text)'),
  ('guide_publish_university_with_content','public.guide_publish_university_with_content(uuid)'),
  ('guide_feature_state','public.guide_feature_state(text)'),
  ('guide_owner_set_feature (3 args)','public.guide_owner_set_feature(text,text,boolean)'),
  ('guide_allowed','public.guide_allowed(uuid,text)'),
  ('guide_guard_write','public.guide_guard_write()'),
  ('guide_team_directory','public.guide_team_directory()'),
  ('guide_pending_signups','public.guide_pending_signups()'),
  ('guide_set_member_details','public.guide_set_member_details(text,text,boolean,boolean,boolean,boolean,uuid[])'),
  ('guide_delete_archived_analytics','public.guide_delete_archived_analytics(date,bigint,bigint)'),
  ('guide_analytics_size','public.guide_analytics_size()'),
  ('guide_validate_student_score','public.guide_validate_student_score()')
) as f(name, sig);

-- 3) أعداد فعلية لجداول الدليل حسب الحالة
select 'guide_universities' t, count(*) total,
  count(*) filter (where published and deleted_at is null) published,
  count(*) filter (where not published and deleted_at is null) draft,
  count(*) filter (where deleted_at is not null) trashed
from public.guide_universities
union all select 'guide_programs', count(*), count(*) filter (where published and deleted_at is null),
  count(*) filter (where not published and deleted_at is null), count(*) filter (where deleted_at is not null) from public.guide_programs
union all select 'guide_tracks', count(*), count(*) filter (where published and deleted_at is null),
  count(*) filter (where not published and deleted_at is null), count(*) filter (where deleted_at is not null) from public.guide_tracks
union all select 'guide_cutoffs', count(*), count(*) filter (where published and deleted_at is null),
  count(*) filter (where not published and deleted_at is null), count(*) filter (where deleted_at is not null) from public.guide_cutoffs
union all select 'guide_sections', count(*), count(*) filter (where published and deleted_at is null),
  count(*) filter (where not published and deleted_at is null), count(*) filter (where deleted_at is not null) from public.guide_sections;

-- 4) هل التخصصات/المسارات/الأقسام المخفية يدويًا موجودة؟
select 'programs' t, count(*) filter (where publication_excluded) excluded from public.guide_programs
union all select 'tracks', count(*) filter (where publication_excluded) from public.guide_tracks
union all select 'sections', count(*) filter (where publication_excluded) from public.guide_sections;

-- 5) المسارات: موزونة صحيحة / نصية (أوزان صفر) / أوزان غير صالحة
select
  count(*) filter (where abs(school_weight+aptitude_weight+achievement_weight-100) <= .01) weighted_ok,
  count(*) filter (where school_weight+aptitude_weight+achievement_weight = 0) textual,
  count(*) filter (where school_weight+aptitude_weight+achievement_weight <> 0
                    and abs(school_weight+aptitude_weight+achievement_weight-100) > .01) invalid_weights
from public.guide_tracks where deleted_at is null;

-- 6) إعداد الميزات الحالي
select feature_key, access_mode, show_offer, updated_at from public.guide_feature_flags order by feature_key;

-- 7) هل طُبقت إضافة الطالب؟
select to_regclass('public.guide_student_favorites') is not null as favorites_table,
       to_regclass('public.guide_student_scores') is not null as scores_table;

-- 8) السياسات على جداول الدليل (للتأكد من مطابقتها للمرجع)
select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public' and tablename like 'guide\_%'
order by tablename, policyname;

-- 9) المشغلات على جداول الدليل
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public' and event_object_table like 'guide\_%'
order by 1, 2;

-- 10) حجم القاعدة الحالي (للمقارنة مع عتبتي 300/400 MB)
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- 11) هل تُسجَّل التحليلات فعلًا؟ (أصفار مع موقع عليه زيارات = الدوال تفشل؛ انظر 003)
select (select count(*) from public.guide_daily_interest) interest_rows,
       (select max(event_day) from public.guide_daily_interest) last_interest_day,
       (select count(*) from public.guide_daily_missing_search) missing_search_rows;

-- 12) قيود CHECK على المسارات (لمعرفة اسم قيد العام الأكاديمي قبل 002)
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.guide_tracks'::regclass and contype = 'c';

-- 13) هل دوال التسجيل تحتوي إصلاح التعارض؟
select proname, prosrc ilike '%variable_conflict%' as has_fix
from pg_proc where proname in ('guide_record_interest','guide_record_missing_search');
