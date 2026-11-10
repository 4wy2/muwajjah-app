-- 009: housing status says who it is for.
-- Adds male_only / female_only / both. Old values stay valid so nothing breaks
-- and the rollback is safe. Data changes are applied separately (see
-- 009_data_fixes.sql), after backing the affected rows up into schema backup.
begin;
alter table public.guide_universities
  drop constraint if exists guide_universities_housing_status_check;
alter table public.guide_universities
  add constraint guide_universities_housing_status_check
  check (housing_status in ('unknown','available','limited','unavailable','male_only','female_only','both'));
commit;
