-- مُوجّه: شغّل هذا التحديث مرة واحدة في Supabase SQL Editor إذا منع المتصفح طلبات PATCH.
-- لا يغيّر أي سجل موجود؛ يضيف طريقة POST محمية بصلاحيات الإدارة الحالية.
begin;

create or replace function public.guide_change_record_state(
  target_table text, target_ids uuid[], target_action text
)
returns table(id uuid, deleted_at timestamptz, published boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  update_fields text;
  required_state text;
  parent_check text := '';
  excluded_enabled boolean;
begin
  if not (select public.guide_is_admin()) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if target_table is null or target_table not in (
    'guide_universities', 'guide_programs', 'guide_tracks', 'guide_cutoffs', 'guide_sections'
  ) then
    raise exception 'Invalid guide table';
  end if;
  if target_action is null or target_action not in ('trash', 'restore', 'publish', 'draft', 'include') then
    raise exception 'Invalid state change';
  end if;
  if coalesce(array_length(target_ids, 1), 0) not between 1 and 50
     or array_position(target_ids, null) is not null then
    raise exception 'Choose between 1 and 50 records';
  end if;
  excluded_enabled := target_table in ('guide_programs','guide_tracks','guide_sections')
    and exists (select 1 from pg_catalog.pg_attribute
      where attrelid=pg_catalog.to_regclass('public.'||target_table)
        and attname='publication_excluded' and not attisdropped);
  if target_action='include' and not excluded_enabled then
    raise exception 'Including content requires the full database update';
  end if;

  case target_action
    when 'trash' then
      update_fields := 'deleted_at = now(), published = false';
      required_state := 'null';
    when 'restore' then
      update_fields := 'deleted_at = null, published = false';
      if excluded_enabled then update_fields := update_fields || ', publication_excluded = true'; end if;
      required_state := 'not null';
    when 'publish' then
      update_fields := 'published = true';
      if excluded_enabled then update_fields := update_fields || ', publication_excluded = false'; end if;
      required_state := 'null';
      if target_table <> 'guide_universities' then
        parent_check := ' and exists (select 1 from public.guide_universities u where u.id = university_id and u.published and u.deleted_at is null)';
      end if;
    when 'draft' then
      update_fields := 'published = false';
      if excluded_enabled then update_fields := update_fields || ', publication_excluded = true'; end if;
      required_state := 'null';
    when 'include' then
      update_fields := 'published = false, publication_excluded = false';
      required_state := 'null';
  end case;

  -- SECURITY INVOKER keeps table grants and row-level security active.
  return query execute format(
    'update public.%I set %s where id = any($1) and deleted_at is %s%s returning id, deleted_at, published',
    target_table, update_fields, required_state, parent_check
  ) using target_ids;
end;
$$;

revoke all on function public.guide_change_record_state(text, uuid[], text) from public;
grant execute on function public.guide_change_record_state(text, uuid[], text) to authenticated;
commit;
notify pgrst, 'reload schema';
