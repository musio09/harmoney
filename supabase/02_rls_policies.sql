-- ============================================================================
--  HARMONY CAFE — QR MENU SYSTEM
--  02_rls_policies.sql  •  Row Level Security + Storage rules
--  Run this SECOND (after 01_schema.sql).
--
--  SECURITY MODEL
--    • anon (every customer with the QR code) ....... READ ONLY
--    • authenticated + listed in admin_users ........ FULL WRITE
--    • authenticated but NOT in admin_users ......... READ ONLY (same as anon)
--  The anon key shipped in the frontend can therefore never modify the menu.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: is the current JWT an approved cafe owner?
-- SECURITY DEFINER so it can read admin_users regardless of that table's RLS.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.categories  enable row level security;
alter table public.menu_items  enable row level security;
alter table public.cafe_info   enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- admin_users: an admin may read their own row. NOBODY can write through the
-- API — rows are added only from the SQL editor (service role bypasses RLS).
-- This closes the privilege-escalation hole.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "admin can read own admin row" on public.admin_users;
create policy "admin can read own admin row"
  on public.admin_users for select
  to authenticated
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- categories
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "categories are publicly readable" on public.categories;
create policy "categories are publicly readable"
  on public.categories for select
  to anon, authenticated
  using (is_active or public.is_admin());     -- admins also see hidden ones

drop policy if exists "admins insert categories" on public.categories;
create policy "admins insert categories"
  on public.categories for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins update categories" on public.categories;
create policy "admins update categories"
  on public.categories for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete categories" on public.categories;
create policy "admins delete categories"
  on public.categories for delete
  to authenticated
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- menu_items
-- Unavailable items stay readable so the menu can show a "SOLD OUT" badge.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "menu items are publicly readable" on public.menu_items;
create policy "menu items are publicly readable"
  on public.menu_items for select
  to anon, authenticated
  using (true);

drop policy if exists "admins insert menu items" on public.menu_items;
create policy "admins insert menu items"
  on public.menu_items for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins update menu items" on public.menu_items;
create policy "admins update menu items"
  on public.menu_items for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete menu items" on public.menu_items;
create policy "admins delete menu items"
  on public.menu_items for delete
  to authenticated
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- cafe_info
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "cafe info is publicly readable" on public.cafe_info;
create policy "cafe info is publicly readable"
  on public.cafe_info for select
  to anon, authenticated
  using (true);

drop policy if exists "admins update cafe info" on public.cafe_info;
create policy "admins update cafe info"
  on public.cafe_info for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins insert cafe info" on public.cafe_info;
create policy "admins insert cafe info"
  on public.cafe_info for insert
  to authenticated
  with check (public.is_admin());

-- ============================================================================
--  STORAGE — bucket for menu item photos
--  Public READ (so <img> works for customers), admin-only WRITE.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

drop policy if exists "menu images are publicly readable" on storage.objects;
create policy "menu images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-images');

drop policy if exists "admins upload menu images" on storage.objects;
create policy "admins upload menu images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-images' and public.is_admin());

drop policy if exists "admins update menu images" on storage.objects;
create policy "admins update menu images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'menu-images' and public.is_admin())
  with check (bucket_id = 'menu-images' and public.is_admin());

drop policy if exists "admins delete menu images" on storage.objects;
create policy "admins delete menu images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu-images' and public.is_admin());
