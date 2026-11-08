-- مُوجّه: تحليلات مجمّعة فقط. شغّل الملف كاملًا في Supabase SQL Editor.
begin;

create table if not exists public.guide_daily_interest (
  event_day date not null default current_date,
  event_kind text not null check (event_kind in ('university','program')),
  entity_id uuid not null,
  hits bigint not null default 1 check (hits >= 0),
  primary key (event_day,event_kind,entity_id)
);
create index if not exists guide_interest_entity on public.guide_daily_interest(event_kind,entity_id,event_day);

create table if not exists public.guide_daily_missing_search (
  event_day date not null default current_date,
  search_term text not null check (char_length(search_term) between 3 and 80),
  hits bigint not null default 1 check (hits >= 0),
  primary key (event_day,search_term)
);

alter table public.guide_daily_interest enable row level security;
alter table public.guide_daily_missing_search enable row level security;
revoke all on public.guide_daily_interest, public.guide_daily_missing_search from anon,authenticated;
grant select on public.guide_daily_interest, public.guide_daily_missing_search to authenticated;
drop policy if exists "Guide owner interest" on public.guide_daily_interest;
create policy "Guide owner interest" on public.guide_daily_interest for select to authenticated using ((select public.guide_is_owner()));
drop policy if exists "Guide owner missing searches" on public.guide_daily_missing_search;
create policy "Guide owner missing searches" on public.guide_daily_missing_search for select to authenticated using ((select public.guide_is_owner()));

create or replace function public.guide_record_interest(event_kind text, record_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$ begin
  if event_kind = 'university' and exists (
    select 1 from public.guide_universities u where u.id=record_id and u.published and u.deleted_at is null
  ) or event_kind = 'program' and exists (
    select 1 from public.guide_programs p join public.guide_universities u on u.id=p.university_id
    where p.id=record_id and p.published and p.deleted_at is null and u.published and u.deleted_at is null
  ) then
    insert into public.guide_daily_interest(event_day,event_kind,entity_id,hits)
    values (current_date,event_kind,record_id,1)
    on conflict (event_day,event_kind,entity_id) do update
      set hits=public.guide_daily_interest.hits+1;
  end if;
end $$;
revoke all on function public.guide_record_interest(text,uuid) from public;
grant execute on function public.guide_record_interest(text,uuid) to anon,authenticated;

create or replace function public.guide_record_missing_search(search_term text)
returns void language plpgsql security definer set search_path = ''
as $$ declare term text; begin
  term:=lower(trim(regexp_replace(coalesce(search_term,''),'\s+',' ','g')));
  if char_length(term) not between 3 and 80 or term ~ '[@/:\\]' or term ~ '[0-9]{6,}' then return; end if;
  -- حد أعلى للمصطلحات المختلفة في اليوم؛ يمنع تضخم الجدول بسبب إدخال آلي.
  if not exists(select 1 from public.guide_daily_missing_search where event_day=current_date and search_term=term)
    and (select count(*) from public.guide_daily_missing_search where event_day=current_date)>=500 then return; end if;
  insert into public.guide_daily_missing_search(event_day,search_term,hits) values(current_date,term,1)
  on conflict (event_day,search_term) do update set hits=public.guide_daily_missing_search.hits+1;
end $$;
revoke all on function public.guide_record_missing_search(text) from public;
grant execute on function public.guide_record_missing_search(text) to anon,authenticated;

create or replace function public.guide_analytics_size()
returns bigint language plpgsql stable security definer set search_path = ''
as $$ begin
  if not public.guide_is_owner() then raise exception 'المالك فقط يرى التحليلات' using errcode='42501'; end if;
  return pg_catalog.pg_database_size(current_database());
end $$;
revoke all on function public.guide_analytics_size() from public;
grant execute on function public.guide_analytics_size() to authenticated;

create or replace function public.guide_delete_archived_analytics(before_day date, expected_interest bigint, expected_searches bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $$ declare interest_count bigint; search_count bigint; begin
  if not public.guide_is_owner() then raise exception 'المالك فقط يحذف التحليلات' using errcode='42501'; end if;
  if before_day is null or before_day > current_date-90 or expected_interest < 0 or expected_searches < 0 then
    raise exception 'يمكن أرشفة البيانات التي مضى عليها 90 يومًا فقط';
  end if;
  lock table public.guide_daily_interest,public.guide_daily_missing_search in share row exclusive mode;
  select count(*) into interest_count from public.guide_daily_interest where event_day < before_day;
  select count(*) into search_count from public.guide_daily_missing_search where event_day < before_day;
  if interest_count <> expected_interest or search_count <> expected_searches then
    raise exception 'تغير عدد الصفوف بعد التصدير؛ أعد تنزيل الملف قبل الحذف';
  end if;
  delete from public.guide_daily_interest where event_day < before_day;
  delete from public.guide_daily_missing_search where event_day < before_day;
  return jsonb_build_object('interest_rows',interest_count,'search_rows',search_count);
end $$;
revoke all on function public.guide_delete_archived_analytics(date,bigint,bigint) from public;
grant execute on function public.guide_delete_archived_analytics(date,bigint,bigint) to authenticated;

-- النسب التاريخية تبقى للإدارة فقط؛ لا يكفي إخفاؤها من صفحة الطالب.
drop policy if exists "Guide published read" on public.guide_cutoffs;

commit;
notify pgrst, 'reload schema';
