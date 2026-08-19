-- ============================================================================
--  HARMONY CAFE — QR MENU SYSTEM
--  04_create_owner.sql  •  Promote a user to cafe owner (admin)
--
--  ⚠️  BEFORE RUNNING THIS FILE you must create the login in the dashboard:
--
--      Authentication → Users → "Add user" → "Create new user"
--        Email:    your real email
--        Password: a strong password
--        ✅ TICK "Auto Confirm User"   ← skip this and login will fail
--
--  Then change the email on the line marked 👇 below and press Run.
-- ============================================================================

do $$
declare
  -- 👇 CHANGE THIS to the email you just created in the dashboard
  target_email text := 'owner@harmonycafe.et';

  found_id   uuid;
  confirmed  timestamptz;
begin
  select id, email_confirmed_at
    into found_id, confirmed
    from auth.users
   where lower(email) = lower(target_email);

  -- Guard 1: the user does not exist yet
  if found_id is null then
    raise exception
      E'\n\n  ❌ No user found with email "%".\n'
       '  → Create it first: Authentication → Users → Add user → Create new user\n'
       '     (and tick "Auto Confirm User"), then run this file again.\n',
      target_email;
  end if;

  -- Guard 2: created but never confirmed — login would silently fail
  if confirmed is null then
    raise warning
      E'\n\n  ⚠️  User "%" exists but is NOT confirmed.\n'
       '  → Authentication → Users → click the user → Confirm email,\n'
       '     otherwise logging in to /admin will fail.\n',
      target_email;
  end if;

  insert into public.admin_users (user_id, email, full_name)
  values (found_id, target_email, 'Cafe Owner')
  on conflict (user_id) do update set email = excluded.email;

  raise notice E'\n\n  ✅ "%" is now a cafe owner. You can log in at /admin/\n', target_email;
end $$;

-- ── Verify: this should list your email ─────────────────────────────────────
select email, full_name, created_at
from public.admin_users
order by created_at;

-- ============================================================================
--  To ADD another manager later:
--    change target_email above and run this file again.
--
--  To REVOKE someone's access:
--    delete from public.admin_users where lower(email) = lower('them@example.com');
--
--  To LIST everyone who can edit the menu:
--    select email from public.admin_users;
-- ============================================================================
