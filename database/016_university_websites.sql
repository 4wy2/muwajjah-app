-- 016: official website links for 26 universities, from the Ministry of
-- Education directory (moe.gov.sa/ar/contact-and-participation/directories,
-- checked 13 Nov 2026). Only fills links that are empty today; matches by the
-- exact published name. كلية الجبيل وينبع الصناعية links to Jubail Industrial
-- College on the Royal Commission site (owner's choice). Backup first;
-- rollback restores the old values.
begin;
create schema if not exists backup;
create table if not exists backup.university_websites_016 as
  select id, website_url from public.guide_universities;
revoke all on backup.university_websites_016 from anon, authenticated;

-- Run as the owner so the write guard and the change log see the owner.
select set_config('request.jwt.claim.sub',
  (select user_id::text from public.guide_admins where is_owner and is_enabled limit 1), true);

update public.guide_universities u
   set website_url = v.url
  from (values
  ('جامعة أم القرى', 'https://uqu.edu.sa'),
  ('الجامعة الإسلامية بالمدينة المنورة', 'https://iu.edu.sa'),
  ('جامعة الإمام محمد بن سعود الإسلامية', 'https://imamu.edu.sa'),
  ('جامعة الملك سعود', 'https://ksu.edu.sa'),
  ('جامعة الملك عبدالعزيز', 'https://www.kau.edu.sa'),
  ('جامعة الملك فيصل', 'https://www.kfu.edu.sa'),
  ('جامعة الملك خالد', 'https://www.kku.edu.sa'),
  ('جامعة القصيم', 'https://www.qu.edu.sa'),
  ('جامعة طيبة', 'https://www.taibahu.edu.sa'),
  ('جامعة الطائف', 'https://www.tu.edu.sa'),
  ('جامعة حائل', 'https://www.uoh.edu.sa'),
  ('جامعة جازان', 'https://www.jazanu.edu.sa'),
  ('جامعة الجوف', 'https://www.ju.edu.sa'),
  ('جامعة الباحة', 'https://bu.edu.sa'),
  ('جامعة تبوك', 'https://www.ut.edu.sa'),
  ('جامعة نجران', 'https://www.nu.edu.sa'),
  ('جامعة الحدود الشمالية', 'https://www.nbu.edu.sa'),
  ('جامعة الملك سعود بن عبدالعزيز للعلوم الصحية', 'https://www.ksau-hs.edu.sa'),
  ('جامعة الإمام عبدالرحمن بن فيصل', 'https://www.iau.edu.sa'),
  ('جامعة الأمير سطام بن عبدالعزيز', 'https://www.psau.edu.sa'),
  ('جامعة شقراء', 'https://www.su.edu.sa'),
  ('جامعة المجمعة', 'https://www.mu.edu.sa'),
  ('جامعة جدة', 'https://www.uj.edu.sa'),
  ('جامعة بيشة', 'https://www.ub.edu.sa'),
  ('جامعة حفر الباطن', 'https://www.uhb.edu.sa'),
  ('كلية الجبيل وينبع الصناعية', 'https://rcjy.edu.sa/en/colleges-and-institutes-in-jubail/jubail-industrial-college/home-jic')
  ) as v(name, url)
 where u.name = v.name
   and u.deleted_at is null
   and coalesce(u.website_url, '') = '';
commit;
