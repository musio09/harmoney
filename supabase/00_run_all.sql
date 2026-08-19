-- ============================================================================
--  HARMONY CAFE — COMPLETE DATABASE SETUP  (STEP 1 of 2)
--
--  HOW TO RUN:
--    Supabase Dashboard → SQL Editor → New query
--    → paste this ENTIRE file → press RUN
--
--  Safe to re-run: nothing is duplicated or overwritten.
--  Expected result: "Success. No rows returned"
--
--  ⚠️  AFTER this, create your login in Authentication → Users,
--      then run supabase/04_create_owner.sql  (STEP 2).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN USERS
-- Membership in this table = permission to modify the menu.
-- Rows are created ONLY from the SQL editor (see 04_create_owner.sql), never
-- through the public API, so a customer can never promote themselves.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Allow-list of cafe owners/managers who may modify menu data.';

-- ─────────────────────────────────────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  name_am     text,
  emoji       text default '🍽',
  subtitle    text,                              -- e.g. "Freshly baked"
  icon_bg     text default '#f4f1e9',            -- pastel circle behind the emoji
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists categories_sort_idx on public.categories (sort_order, name);

-- ─────────────────────────────────────────────────────────────────────────────
-- MENU ITEMS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.menu_items (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references public.categories(id) on delete set null,
  name           text not null,
  name_am        text,
  description    text,
  description_am text,
  price          numeric(10,2) not null default 0 check (price >= 0),
  emoji          text default '🍽',
  image_url      text,                           -- Supabase Storage public URL
  badge          text check (badge in ('new','hot')),
  is_available   boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists menu_items_category_idx on public.menu_items (category_id, sort_order);
create index if not exists menu_items_available_idx on public.menu_items (is_available);

-- ─────────────────────────────────────────────────────────────────────────────
-- CAFE / BUSINESS INFO  (single row)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.cafe_info (
  id          integer primary key default 1 check (id = 1),
  name        text not null default 'HARMONY CAFE',
  name_am     text default 'ሃርመኒ ካፌ',
  tagline     text default 'Good Food • Good Coffee • Good Vibes',
  address     text default 'ASTU Gate, Adama',
  phone       text default '+251911903172',
  phone_label text default '+251 911 90 31 72',
  logo_url    text,
  header_emoji text default '🍽',
  currency    text not null default 'ETB',
  footer_text text default 'Harmony Cafe © 2026',
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at maintenance
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists categories_touch  on public.categories;
drop trigger if exists menu_items_touch  on public.menu_items;
drop trigger if exists cafe_info_touch   on public.cafe_info;

create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();
create trigger cafe_info_touch  before update on public.cafe_info
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME  — lets the customer menu update live, with no refresh
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.menu_items'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.categories'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.cafe_info';  exception when duplicate_object then null; end;
end $$;

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


-- ── CAFE INFO ───────────────────────────────────────────────────────────────
insert into public.cafe_info (id, name, name_am, tagline, address, phone, phone_label, header_emoji, currency, footer_text)
values (1, 'HARMONY CAFE', 'ሃርመኒ ካፌ', 'Good Food • Good Coffee • Good Vibes',
        'ASTU Gate, Adama', '+251911903172', '+251 911 90 31 72', '🍽', 'ETB', 'Harmony Cafe © 2026')
on conflict (id) do nothing;

-- ── CATEGORIES (same order and emoji as the current nav tabs) ───────────────
insert into public.categories (slug, name, emoji, subtitle, icon_bg, sort_order) values
  ('pizza',     'Pizza',       '🍕', 'Freshly baked',  '#fff3e0', 1),
  ('burger',    'Burgers',     '🍔', 'Juicy & fresh',  '#fce4ec', 2),
  ('juice',     'Fresh Juice', '🥤', '100% natural',   '#e8f5e9', 3),
  ('coffee',    'Coffee',      '☕', 'Freshly brewed', '#efebe9', 4),
  ('breakfast', 'Breakfast',   '🍳', 'Served all day', '#fff8e1', 5),
  ('main',      'Main Dishes', '🍽', 'Hearty meals',   '#f3e5f5', 6),
  ('fastfood',  'Fast Food',   '🌭', 'Quick bites',    '#e3f2fd', 7)
on conflict (slug) do nothing;

-- ── MENU ITEMS ──────────────────────────────────────────────────────────────
with c as (select slug, id from public.categories)
insert into public.menu_items
  (category_id, name, description, description_am, price, emoji, badge, sort_order)
select c.id, v.name, v.description, v.description_am, v.price, v.emoji, v.badge, v.sort_order
from (values
  -- PIZZA
  ('pizza','Margherita',            'Tomato • Mozzarella • Basil',                null, 450, '🍕', null,  1),
  ('pizza','Pepperoni',             'Pepperoni • Cheese • Tomato Sauce',          null, 520, '🍕', 'new', 2),
  ('pizza','Cheese Lovers',         'Mozzarella • Cheddar • Parmesan',            null, 480, '🧀', 'new', 3),
  ('pizza','Spicy Veggie',          'Bell Peppers • Olives • Onion • Jalapeño',   null, 420, '🌶️', null,  4),
  ('pizza','Chicken BBQ',           'Grilled Chicken • BBQ Sauce • Cheese',       null, 550, '🍗', null,  5),
  -- BURGER
  ('burger','Classic Beef Burger',  'Beef Patty • Lettuce • Tomato • Cheese',     null, 420, '🍔', 'new', 1),
  ('burger','Chicken Crispy Burger','Crispy Chicken • Coleslaw • Mayo',           null, 400, '🐔', null,  2),
  ('burger','Double Cheese Burger', 'Double Beef • Double Cheese • Special Sauce',null, 520, '🧀', 'new', 3),
  ('burger','Veggie Burger',        'Veggie Patty • Lettuce • Tomato • Avocado',  null, 350, '🥬', null,  4),
  ('burger','Spicy BBQ Burger',     'Beef Patty • Pepper Jack • Jalapeño • BBQ',  null, 460, '🔥', 'hot', 5),
  -- JUICE
  ('juice','Fresh Orange Juice',    'Freshly squeezed oranges',                   null, 150, '🍊', null,  1),
  ('juice','Mango Juice',           'Ripe mango blended to perfection',           null, 170, '🥭', null,  2),
  ('juice','Strawberry Smoothie',   'Strawberry • Yogurt • Honey',                null, 200, '🍓', 'new', 3),
  ('juice','Avocado Juice',         'Creamy avocado with milk',                   null, 180, '🥑', null,  4),
  ('juice','Pineapple Punch',       'Pineapple • Lemon • Mint',                   null, 160, '🍍', null,  5),
  ('juice','Mix Fruit Juice',       'Seasonal fruits blended fresh',              null, 200, '🥤', null,  6),
  -- COFFEE
  ('coffee','Espresso',             null, null, 120, '☕', null, 1),
  ('coffee','Cappuccino',           null, null, 150, '☕', null, 2),
  ('coffee','Latte',                null, null, 160, '☕', null, 3),
  ('coffee','Macchiato',            null, null, 140, '🥛', null, 4),
  ('coffee','Iced Coffee',          null, null, 170, '❄️', null, 5),
  -- BREAKFAST
  ('breakfast','Special Breakfast', null, 'እንቁላል • ዳቦ • አቮካዶ', 200, '🍳', null, 1),
  ('breakfast','Fasting Breakfast', null, 'አትክልት • ዳቦ • ልዩ ጎን', 220, '🥗', null, 2),
  -- MAIN
  ('main','Special Pasta',          null, 'ፓስታ',              280, '🍝', null, 1),
  ('main','Chicken Rice',           null, 'ሩዝ • ዶሮ • ሰላጣ',    300, '🍚', null, 2),
  -- FAST FOOD
  ('fastfood','Chicken Sandwich',   null, null, 400, '🥪', null, 1),
  ('fastfood','Fries (ቺፕስ)',        null, null, 250, '🍟', null, 2)
) as v(cat, name, description, description_am, price, emoji, badge, sort_order)
join c on c.slug = v.cat
where not exists (
  select 1 from public.menu_items m where m.name = v.name
);

-- ============================================================================
--  ✅ STEP 1 COMPLETE.
--
--  NEXT: Authentication → Users → Add user → Create new user
--        (tick "Auto Confirm User"), then run 04_create_owner.sql
-- ============================================================================
