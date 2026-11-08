-- مُوجّه v2: إضافة ميزات الطالب فقط، دون تغيير جداول الدليل أو سياساتها الحالية.
-- يراجعها مالك المشروع ويشغّلها مرة واحدة في مشروع Supabase الصحيح.
-- لا توجد مفاتيح service_role أو تغييرات على صلاحيات إدارة المحتوى.
begin;
create table if not exists public.guide_student_favorites (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 university_id uuid references public.guide_universities(id) on delete cascade,
 program_id uuid references public.guide_programs(id) on delete cascade,
 created_at timestamptz not null default now(),
 constraint guide_favorite_one_target check (num_nonnulls(university_id,program_id)=1),
 unique(user_id,university_id),
 unique(user_id,program_id)
);
create index if not exists guide_favorites_user_created on public.guide_student_favorites(user_id,created_at desc);
alter table public.guide_student_favorites enable row level security;
revoke all on public.guide_student_favorites from public,anon,authenticated;
grant select,insert,delete on public.guide_student_favorites to authenticated;
drop policy if exists "Student reads own favorites" on public.guide_student_favorites;
create policy "Student reads own favorites" on public.guide_student_favorites for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Student adds own published favorite" on public.guide_student_favorites;
create policy "Student adds own published favorite" on public.guide_student_favorites for insert to authenticated with check (
 user_id=(select auth.uid()) and (
  (program_id is null and exists(select 1 from public.guide_universities u where u.id=university_id and u.published and u.deleted_at is null))
  or (university_id is null and exists(select 1 from public.guide_programs p join public.guide_universities u on u.id=p.university_id where p.id=program_id and p.published and p.deleted_at is null and u.published and u.deleted_at is null))
 )
);
drop policy if exists "Student removes own favorite" on public.guide_student_favorites;
create policy "Student removes own favorite" on public.guide_student_favorites for delete to authenticated using(user_id=(select auth.uid()));

create table if not exists public.guide_student_scores (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 university_id uuid not null references public.guide_universities(id) on delete cascade,
 track_id uuid not null references public.guide_tracks(id) on delete cascade,
 school numeric(5,2) not null check(school between 0 and 100),
 aptitude numeric(5,2) not null check(aptitude between 0 and 100),
 achievement numeric(5,2) not null check(achievement between 0 and 100),
 result numeric(5,2) not null check(result between 0 and 100),
 school_weight numeric(5,2) not null,
 aptitude_weight numeric(5,2) not null,
 achievement_weight numeric(5,2) not null,
 track_name text not null,
 university_name text not null,
 created_at timestamptz not null default now()
);
create index if not exists guide_scores_user_created on public.guide_student_scores(user_id,created_at desc);
alter table public.guide_student_scores enable row level security;
revoke all on public.guide_student_scores from public,anon,authenticated;
grant select,insert on public.guide_student_scores to authenticated;
drop policy if exists "Student reads own scores" on public.guide_student_scores;
create policy "Student reads own scores" on public.guide_student_scores for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists "Student saves own score" on public.guide_student_scores;
create policy "Student saves own score" on public.guide_student_scores for insert to authenticated with check(user_id=(select auth.uid()));

-- SECURITY INVOKER: التحقق من مسار منشور، مع بقاء RLS وسياسات الدليل فعالة.
create or replace function public.guide_validate_student_score() returns trigger
language plpgsql security invoker set search_path=''
as $$ declare t public.guide_tracks%rowtype; u_name text; begin
 if new.user_id is distinct from auth.uid() then raise exception 'لا يمكن حفظ سجل لحساب آخر' using errcode='42501'; end if;
 select t0.* into t from public.guide_tracks t0
  where t0.id=new.track_id and t0.university_id=new.university_id and t0.published and t0.deleted_at is null;
 if not found then raise exception 'المسار غير متاح'; end if;
 select u.name into u_name from public.guide_universities u where u.id=new.university_id and u.published and u.deleted_at is null;
 if not found then raise exception 'الجامعة غير متاحة'; end if;
 if abs(t.school_weight+t.aptitude_weight+t.achievement_weight-100)>.01 then raise exception 'أوزان المسار غير صالحة'; end if;
 new.school_weight:=t.school_weight; new.aptitude_weight:=t.aptitude_weight; new.achievement_weight:=t.achievement_weight;
 new.result:=round((new.school*t.school_weight+new.aptitude*t.aptitude_weight+new.achievement*t.achievement_weight)/100,2);
 new.track_name:=t.name;new.university_name:=u_name;new.created_at:=now();
 return new;
end $$;
revoke all on function public.guide_validate_student_score() from public,anon,authenticated;
drop trigger if exists guide_student_score_validate on public.guide_student_scores;
create trigger guide_student_score_validate before insert on public.guide_student_scores for each row execute function public.guide_validate_student_score();
commit;
notify pgrst, 'reload schema';
