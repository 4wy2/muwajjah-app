-- مُوجّه 004: السماح للطالب بحذف نتائج الموزونة المحفوظة في حسابه.
--
-- الأثر:
--   * يمنح دور authenticated صلاحية DELETE على guide_student_scores.
--   * يضيف سياسة RLS تسمح للطالب بحذف صفوفه هو فقط (user_id = auth.uid()).
--   * لا يمس أي بيانات، ولا يسمح بحذف نتائج طالب آخر.
-- يتطلب تطبيق database/001_student_features.sql مسبقًا. قابل لإعادة التشغيل.
begin;
grant delete on public.guide_student_scores to authenticated;
drop policy if exists "Student removes own score" on public.guide_student_scores;
create policy "Student removes own score" on public.guide_student_scores
  for delete to authenticated using (user_id = (select auth.uid()));
commit;
notify pgrst, 'reload schema';

-- الاسترجاع:
-- drop policy if exists "Student removes own score" on public.guide_student_scores;
-- revoke delete on public.guide_student_scores from authenticated;
