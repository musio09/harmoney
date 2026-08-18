-- ============================================================================
--  HARMONY CAFE — QR MENU SYSTEM
--  01_schema.sql  •  Tables, indexes, triggers
--  Run this FIRST in: Supabase Dashboard → SQL Editor → New query → Run
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
