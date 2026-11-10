-- 009 data fixes (approved by the owner on 2026-11-10).
-- 1) Backup of every row touched, in schema backup (not exposed to the API).
-- 2) Housing status per university from the text already stored for it.
-- 3) Housing note emptied where a housing section already holds the details,
--    or rewritten without "يذكر الدليل"/"بحسب الدليل".
-- 4) Program names/colleges broken by PDF extraction (لا / الأ / الإ).
-- aeb63deb (أشباه الموصلات, KFUPM) is skipped: a trashed copy already holds
-- the correct name, so renaming would collide with the unique key.
-- Run as the owner (guard trigger) in one transaction.
begin;
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.universities_20261110 as
  select * from public.guide_universities where deleted_at is null;
create table if not exists backup.programs_20261110 as
  select * from public.guide_programs where id in (
    '5faf02f6-e58e-4fd3-9e76-029984081679','13b1a37a-4bc7-4642-bef0-e6c7e5391deb','35f4e92a-90fb-4c2f-8ae3-ea49e8c24b56','01dbcf03-2a79-4852-ac97-8314087152f5','31ae3568-acab-4735-a07c-2f50d82215bb','92ade480-14f5-47f1-a270-b106b4f9cb7e','a766296f-ea70-477d-9626-707f85edbcbd','1580f628-faf5-4c63-8d8d-274360aadd7c','b98d2fde-6e2b-4880-a7ac-a3ea3177611b','be8c11c0-1eb9-45ee-aa87-dafd3f4bd8bf','fa7cef7a-cdb1-4a93-ad84-b0dd12435bf0','019d6f0b-ac48-4cf6-82d8-c0228513d245','9d465eca-6ce1-4c99-b368-49bb48fa15f9','d90fb946-e300-4e54-9a69-9cc35b847a34','822cd9a3-8b25-4893-a8ad-6006aad4d6ef','37708765-36ee-4431-a265-d89fd7299824','952e3e62-b9db-4b1c-8a48-2db474ef00dd','5d852368-f881-418f-a45b-b14bb22d1a46','4d12aee8-1bd9-421c-9d1b-98a81e51eed8','ce71063f-5e2a-4352-a5f3-89e80115f6d8','aeb63deb-2875-473f-99a3-0675897d6893','5be3e9c5-8541-43c7-932e-dc0bc162c43f','d9c40d09-14d5-4f30-b136-6569ffa08d13','641c3fbe-2d25-444a-9921-2181601d55bc','f8332431-2132-469a-9617-c1e222c3d5d2','797585b1-2fae-4710-8be6-ca1482d20f67','44b6c71a-56e3-4124-b15b-cf049578128f','7e2dbad6-b715-42bb-be39-ee4e6a4b0f8e','77b5759d-70ab-419e-b928-1cdfc601add7','8f003f07-e8b8-49e9-97de-16cf8b526bb3')
  or college in (')علوم األغذية والزراعة (طالب فقط كلية','العلوم الطبية التطبيقية كلية','كلية ادارة االعمال','كلية طب األسنان','القران الكريم كلية','اإلعالم واالتصال كلية');
revoke all on all tables in schema backup from public, anon, authenticated;

-- Housing status
update public.guide_universities u set housing_status = v.s from (values
 ('19c0ce0e-f306-4142-933a-5282c9243a86','male_only'),
 ('17fcda78-bd4d-46ca-8053-2ce520ebbb54','unavailable'),
 ('1de7f6ac-ab81-448a-a3f2-dfd3de45c688','available'),
 ('c7e2c20b-7954-4800-ba14-9ee0f00ebfcc','both'),
 ('e9d71a4c-eb24-42d5-8467-e050d97dbad2','male_only'),
 ('4bb818c6-7e6c-4015-8437-718bc0b07ef6','unavailable'),
 ('994d6d7f-6ca1-4937-bb42-f6f38331f661','unavailable'),
 ('b38fe65a-ff2c-46ae-ba72-58740de10413','unavailable'),
 ('9c694645-cc61-4fdc-8104-0ca9c39bce25','male_only'),
 ('9d11e8fd-bb18-4e93-b48d-747f4e15a8de','male_only'),
 ('b3636ec4-26d3-463b-b747-c0546e189778','unavailable'),
 ('a74d008f-5bf0-42d2-82d0-b815a6cd3de9','male_only'),
 ('0a8486d3-14d3-4edc-927d-6c0a1dde1bab','both'),
 ('26c314cd-eef6-413b-821e-b89a93114241','unavailable'),
 ('98ce3485-90f1-44f6-82a0-83a7946a9792','both'),
 ('9a866659-e5cc-4bf1-aa56-35d51ef8ff3d','both'),
 ('8de6475a-14b5-46c8-814c-5483daf129f1','both'),
 ('fb5cd107-70dc-4fe7-af0e-bd1bad0d453a','unavailable'),
 ('2b9e5037-6f58-4396-9a11-e31427552316','both'),
 ('159249fc-c4b0-43a7-ab9b-2339d1d5b532','male_only'),
 ('cdea64bc-df30-4bdb-a725-1c284f08f28a','unavailable'),
 ('8e246dc1-ba4e-457d-89e3-679431da043f','unavailable'),
 ('f3dd108b-22ff-4130-9a70-362679cb3951','unavailable'),
 ('0bec42de-02fa-45cb-ae16-30066ba66fd2','both'),
 ('59fc7597-2e5e-424b-86a3-3cbd440787a9','both'),
 ('c0c3a057-c9ab-45e3-8f18-f444045f2289','male_only')
) v(id,s) where u.id = v.id::uuid;

-- Housing note: details live in the housing section, or the status says it all.
update public.guide_universities set housing_note = ''
 where deleted_at is null and published and id <> '159249fc-c4b0-43a7-ab9b-2339d1d5b532'
   and coalesce(housing_note,'') <> '';
update public.guide_universities set housing_note =
 'يوجد سكن داخل الحرم الجامعي للطلاب فقط. من الشروط: الانتظام في الدراسة، والخلو من الأمراض المعدية، وعدم إنهاء عقد سكن سابق لأسباب أمنية أو أخلاقية، ودفع الأجرة والتأمين، واستكمال النماذج المطلوبة.'
 where id = '159249fc-c4b0-43a7-ab9b-2339d1d5b532';

-- Program names
update public.guide_programs p set name = v.n from (values
 ('5faf02f6-e58e-4fd3-9e76-029984081679','الأحياء الدقيقة'),
 ('13b1a37a-4bc7-4642-bef0-e6c7e5391deb','الإحصاء'),
 ('35f4e92a-90fb-4c2f-8ae3-ea49e8c24b56','الإنتاج الحيواني'),
 ('01dbcf03-2a79-4852-ac97-8314087152f5','الاقتصاد التطبيقي'),
 ('31ae3568-acab-4735-a07c-2f50d82215bb','الرياضيات الاكتوارية والمالية'),
 ('92ade480-14f5-47f1-a270-b106b4f9cb7e','علوم الأغذية وتغذية الإنسان'),
 ('a766296f-ea70-477d-9626-707f85edbcbd','علوم الإنتاج النباتي'),
 ('1580f628-faf5-4c63-8d8d-274360aadd7c','علوم وهندسة الحاسب الآلي'),
 ('b98d2fde-6e2b-4880-a7ac-a3ea3177611b','هندسة الاتصالات'),
 ('be8c11c0-1eb9-45ee-aa87-dafd3f4bd8bf','هندسة الاتصالات'),
 ('fa7cef7a-cdb1-4a93-ad84-b0dd12435bf0','الحديث الشريف والدراسات الإسلامية'),
 ('019d6f0b-ac48-4cf6-82d8-c0228513d245','القرآن الكريم والدراسات الإسلامية'),
 ('9d465eca-6ce1-4c99-b368-49bb48fa15f9','ذكاء الأعمال وتحليل البيانات'),
 ('d90fb946-e300-4e54-9a69-9cc35b847a34','طب الأسنان وجراحتها'),
 ('822cd9a3-8b25-4893-a8ad-6006aad4d6ef','علوم المختبرات الإكلينيكية'),
 ('37708765-36ee-4431-a265-d89fd7299824','الإدارة'),
 ('952e3e62-b9db-4b1c-8a48-2db474ef00dd','التغذية الإكلينيكية'),
 ('5d852368-f881-418f-a45b-b14bb22d1a46','شبكات الحاسب والاتصالات'),
 ('4d12aee8-1bd9-421c-9d1b-98a81e51eed8','نظم المعلومات الإدارية'),
 ('ce71063f-5e2a-4352-a5f3-89e80115f6d8','المختبرات الإكلينيكية'),
 ('5be3e9c5-8541-43c7-932e-dc0bc162c43f','إدارة الأعمال تخصص الإدارة'),
 ('d9c40d09-14d5-4f30-b136-6569ffa08d13','إدارة الأعمال تخصص نظم المعلومات الإدارية'),
 ('641c3fbe-2d25-444a-9921-2181601d55bc','تقنية الأشعة'),
 ('f8332431-2132-469a-9617-c1e222c3d5d2','الأسنان'),
 ('797585b1-2fae-4710-8be6-ca1482d20f67','طب الأسنان'),
 ('44b6c71a-56e3-4124-b15b-cf049578128f','طب الأسنان'),
 ('7e2dbad6-b715-42bb-be39-ee4e6a4b0f8e','علوم الحاسب الآلي'),
 ('77b5759d-70ab-419e-b928-1cdfc601add7','هندسة الحاسب الآلي'),
 ('8f003f07-e8b8-49e9-97de-16cf8b526bb3','العلاقات العامة والاتصال التسويقي')
) v(id,n) where p.id = v.id::uuid;

-- College names
update public.guide_programs set college = 'كلية علوم الأغذية والزراعة (طلاب فقط)' where college = ')علوم األغذية والزراعة (طالب فقط كلية';
update public.guide_programs set college = 'كلية العلوم الطبية التطبيقية' where college = 'العلوم الطبية التطبيقية كلية';
update public.guide_programs set college = 'كلية إدارة الأعمال' where college = 'كلية ادارة االعمال';
update public.guide_programs set college = 'كلية طب الأسنان' where college = 'كلية طب األسنان';
update public.guide_programs set college = 'كلية القرآن الكريم' where college = 'القران الكريم كلية';
update public.guide_programs set college = 'كلية الإعلام والاتصال' where college = 'اإلعالم واالتصال كلية';
commit;

-- RESTORE (only if needed):
-- update public.guide_universities u set housing_status=b.housing_status, housing_note=b.housing_note from backup.universities_20261110 b where u.id=b.id;
-- update public.guide_programs p set name=b.name, college=b.college from backup.programs_20261110 b where p.id=b.id;
