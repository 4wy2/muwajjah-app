-- Rollback for 009. First restore the rows from the backup (bottom of
-- 009_data_fixes.sql), then put the old check back.
begin;
alter table public.guide_universities
  drop constraint if exists guide_universities_housing_status_check;
alter table public.guide_universities
  add constraint guide_universities_housing_status_check
  check (housing_status in ('unknown','available','limited','unavailable'));
commit;
