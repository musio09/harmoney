-- ============================================================================
--  HARMONY CAFE — QR MENU SYSTEM
--  03_seed_data.sql  •  Your CURRENT menu, transcribed 1:1 from index.html
--  Run this THIRD. Safe to re-run (idempotent on category slug / item name).
--  Amharic names (name_am) for every category and item are filled in at the
--  bottom — the menu shows English + Amharic together, e.g. "burger በርገር".
-- ============================================================================

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
--  AMHARIC NAMES  (name_am)
--  ----------------------------------------------------------------------------
--  The customer menu prints the English name with the Amharic name right
--  below it, so tourists can read the menu and Amharic speakers see the names
--  they actually order with ("burger በርገር", "pizza ፒዛ", "Water ውሃ").
--  These are the everyday Ethiopian restaurant spellings, not word-for-word
--  translations of the English.
--
--  • Nothing is overwritten: only rows whose name_am is still empty are filled.
--    Rename anything in the dashboard afterwards and re-running this file
--    leaves your text alone.
--  • Needs no schema change — name_am already exists on both tables.
-- ============================================================================

-- ── category names ──────────────────────────────────────────────────────────
update public.categories c
   set name_am = v.name_am
  from (values
    ('pizza',     'ፒዛ'),
    ('burger',    'በርገር'),
    ('juice',     'ፍሬሽ ጁስ'),
    ('coffee',    'ቡና'),
    ('breakfast', 'ቁርስ'),
    ('main',      'ዋና ምግቦች'),
    ('fastfood',  'ፈጣን ምግብ')
  ) as v(slug, name_am)
 where c.slug = v.slug
   and c.name_am is null;

-- ── item names ──────────────────────────────────────────────────────────────
update public.menu_items m
   set name_am = v.name_am
  from (values
    -- PIZZA
    ('Margherita',             'ማርጋሪታ'),
    ('Pepperoni',              'ፔፐሮኒ'),
    ('Cheese Lovers',          'ቺዝ ላቨርስ'),
    ('Spicy Veggie',           'ስፒሲ ቨጂ'),
    ('Chicken BBQ',            'የዶሮ ቢቢኪው'),
    -- BURGERS
    ('Classic Beef Burger',    'ክላሲክ ቢፍ በርገር'),
    ('Chicken Crispy Burger',  'ክሪስፒ ቺከን በርገር'),
    ('Double Cheese Burger',   'ዳብል ቺዝ በርገር'),
    ('Veggie Burger',          'የአትክልት በርገር'),
    ('Spicy BBQ Burger',       'ስፒሲ ቢቢኪው በርገር'),
    -- FRESH JUICE
    ('Fresh Orange Juice',     'ትኩስ የብርቱካን ጁስ'),
    ('Mango Juice',            'የማንጎ ጁስ'),
    ('Strawberry Smoothie',    'የስትሮቤሪ ስሙዚ'),
    ('Avocado Juice',          'የአቮካዶ ጁስ'),
    ('Pineapple Punch',        'የአናናስ ፓንች'),
    ('Mix Fruit Juice',        'የተቀላቀለ ፍራፍሬ ጁስ'),
    -- COFFEE
    ('Espresso',               'ኤስፕሬሶ'),
    ('Cappuccino',             'ካፑቺኖ'),
    ('Latte',                  'ላቴ'),
    ('Macchiato',              'ማኪያቶ'),
    ('Iced Coffee',            'የቀዘቀዘ ቡና'),
    -- BREAKFAST
    ('Special Breakfast',      'ልዩ ቁርስ'),
    ('Fasting Breakfast',      'የጾም ቁርስ'),
    -- MAIN DISHES
    ('Special Pasta',          'ልዩ ፓስታ'),
    ('Chicken Rice',           'የዶሮ ሩዝ'),
    -- FAST FOOD
    ('Chicken Sandwich',       'የዶሮ ሳንድዊች'),
    ('Fries (ቺፕስ)',            'የተጠበሰ ድንች')
  ) as v(name, name_am)
 where m.name = v.name
   and m.name_am is null;
