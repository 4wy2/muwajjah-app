-- Undo 016: put back every university's website link as it was before.
begin;
update public.guide_universities u
   set website_url = b.website_url
  from backup.university_websites_016 b
 where b.id = u.id
   and u.website_url is distinct from b.website_url;
commit;
