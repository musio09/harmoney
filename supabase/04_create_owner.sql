-- ============================================================================
--  HARMONY CAFE — QR MENU SYSTEM
--  04_create_owner.sql  •  Promote a user to cafe owner (admin)
--  Run this LAST — AFTER you have created the user in the Supabase dashboard.
--
--  STEP 1 (dashboard, not SQL):
--     Authentication → Users → "Add user" → "Create new user"
--       Email:    owner@harmonycafe.et      (use your real email)
--       Password: <a strong password>
--       ✅ Tick "Auto Confirm User"  ← important, otherwise login fails
--
--  STEP 2: edit the email below to match, then run this file.
-- ============================================================================

insert into public.admin_users (user_id, email, full_name)
select id, email, 'Cafe Owner'
from auth.users
where email = 'owner@harmonycafe.et'      -- 👈 CHANGE THIS to your real email
on conflict (user_id) do nothing;

-- ── Verify: should return exactly one row ───────────────────────────────────
select a.user_id, a.email, a.full_name, a.created_at
from public.admin_users a;

-- ── To REVOKE someone's admin access later ──────────────────────────────────
-- delete from public.admin_users
-- where email = 'someone@example.com';
