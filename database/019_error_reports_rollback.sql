-- Undo 019: removes the error-report table (with its reports) and functions.
-- Export the reports first if you want to keep them.
begin;
drop function if exists public.guide_set_error_report(bigint, boolean);
drop table if exists public.guide_error_reports;
drop function if exists public.guide_error_report_limit();
commit;
