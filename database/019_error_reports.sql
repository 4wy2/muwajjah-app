-- 019: "report an error" on a university page.
-- A signed-in student sends a short note about wrong or missing information
-- on one university. The owner sees every report; a team member sees the
-- reports of the universities they can read, and marks them done when fixed.
-- Students never read reports (not even their own) and can send at most
-- 5 a day. Visitors who are not signed in cannot send or read anything.
-- Additive only: one new table and two functions; nothing existing changes.
-- Rollback: 019_error_reports_rollback.sql (drops the new table and functions).
begin;
create table if not exists public.guide_error_reports (
  id bigint generated always as identity primary key,
  university_id uuid not null references public.guide_universities(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  section text not null default '' check (length(section) <= 40),
  message text not null check (length(trim(message)) between 5 and 1000),
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create index if not exists guide_error_reports_open on public.guide_error_reports(created_at desc) where status='open';
create index if not exists guide_error_reports_user_day on public.guide_error_reports(user_id, created_at);

alter table public.guide_error_reports enable row level security;
revoke all on public.guide_error_reports from public, anon, authenticated;
grant select, insert on public.guide_error_reports to authenticated;
grant usage on sequence public.guide_error_reports_id_seq to authenticated;

drop policy if exists "Error report send" on public.guide_error_reports;
create policy "Error report send" on public.guide_error_reports for insert to authenticated
 with check (user_id = (select auth.uid()) and status = 'open' and resolved_at is null and resolved_by is null);
drop policy if exists "Error report team read" on public.guide_error_reports;
create policy "Error report team read" on public.guide_error_reports for select to authenticated
 using ((select public.guide_is_owner()) or public.guide_allowed(university_id, 'read'));

-- At most 5 reports a day per account, so the inbox stays useful.
create or replace function public.guide_error_report_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.guide_error_reports r
     where r.user_id = new.user_id and r.created_at > now() - interval '1 day') >= 5 then
  raise exception 'وصلت حد البلاغات اليوم، شكرًا لك. جرّب بكرة' using errcode='P0001';
 end if;
 new.message := trim(new.message);
 return new;
end $$;
drop trigger if exists guide_error_report_limit on public.guide_error_reports;
create trigger guide_error_report_limit before insert on public.guide_error_reports
 for each row execute function public.guide_error_report_limit();

-- Mark a report done (or open again). Anyone who can edit that university, or the owner.
create or replace function public.guide_set_error_report(report_id bigint, done boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uni uuid;
begin
 select university_id into uni from public.guide_error_reports where id = report_id;
 if uni is null then raise exception 'البلاغ غير موجود'; end if;
 if not (public.guide_is_owner() or public.guide_allowed(uni, 'edit')) then
  raise exception 'ما عندك صلاحية على هذي الجامعة' using errcode='42501';
 end if;
 update public.guide_error_reports
  set status = case when done then 'done' else 'open' end,
      resolved_at = case when done then now() end,
      resolved_by = case when done then auth.uid() end
  where id = report_id;
end $$;
revoke all on function public.guide_set_error_report(bigint, boolean) from public, anon;
grant execute on function public.guide_set_error_report(bigint, boolean) to authenticated;
revoke all on function public.guide_error_report_limit() from public, anon, authenticated;
commit;
