-- 006: تفعيل الاشتراك من طلبات متجر زد. تستدعيها دالة الخادم zid-webhook فقط
-- (service_role). لا يستطيع الزائر أو الطالب استدعاءها. إضافي وقابل لإعادة التشغيل.
-- الرجوع: drop function public.guide_service_zid_order(text,text,boolean);
begin;

create or replace function public.guide_service_zid_order(order_id text, buyer_email text, paid boolean)
returns text language plpgsql security definer set search_path='' as $$
declare e text := lower(trim(coalesce(buyer_email,''))); season_end date; until timestamptz; uid uuid;
begin
 if coalesce(order_id,'') = '' then raise exception 'رقم الطلب مطلوب'; end if;
 if not paid then
  update public.guide_plus_entitlements set revoked_at=now()
   where source='zid' and external_order_id=order_id and revoked_at is null;
  update public.guide_pending_plus set expires_at=now()
   where source='zid' and external_order_id=order_id and claimed_at is null;
  insert into public.guide_access_events(action,note) values('zid_unpaid',order_id);
  return 'revoked';
 end if;
 if position('@' in e) < 2 then raise exception 'بريد المشتري غير صالح'; end if;
 if exists(select 1 from public.guide_plus_entitlements where source='zid' and external_order_id=order_id)
  or exists(select 1 from public.guide_pending_plus where source='zid' and external_order_id=order_id)
  then return 'duplicate'; end if;
 select s.season_ends_at into season_end from public.guide_offer_settings s where s.singleton;
 if season_end is null or season_end <= current_date then raise exception 'نهاية الموسم غير محددة'; end if;
 until := (season_end + 1)::timestamptz;
 select u.id into uid from auth.users u
  where lower(u.email)=e and u.email_confirmed_at is not null
   and not exists(select 1 from public.guide_admins a where a.user_id=u.id)
  limit 1;
 if uid is not null then
  insert into public.guide_plus_entitlements(user_id,source,external_order_id,starts_at,expires_at,note)
   values(uid,'zid',order_id,now(),until,'تفعيل تلقائي من متجر زد') on conflict do nothing;
  insert into public.guide_access_events(target_user_id,action,note) values(uid,'zid_paid',order_id);
  return 'granted';
 end if;
 insert into public.guide_pending_plus(email,source,external_order_id,expires_at)
  values(e,'zid',order_id,until) on conflict do nothing;
 insert into public.guide_access_events(action,note) values('zid_pending',order_id);
 return 'pending';
end $$;
revoke all on function public.guide_service_zid_order(text,text,boolean) from public,anon,authenticated;
grant execute on function public.guide_service_zid_order(text,text,boolean) to service_role;

commit;
