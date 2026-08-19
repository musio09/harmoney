/* ============================================================================
 *  DEV ONLY — Minimal in-memory Supabase/PostgREST mock.
 *  Lets us run the real supabase-js client against a fake backend so the
 *  customer menu and admin dashboard can be tested without a cloud project.
 *  Never used in production; not referenced by index.html or admin/index.html.
 * ==========================================================================*/
'use strict';

const http = require('http');
const { randomUUID } = require('crypto');

const ADMIN_EMAIL = 'owner@harmonycafe.et';
const ADMIN_PASSWORD = 'test-password-123';
const ADMIN_TOKEN = 'mock-admin-access-token';

function seed() {
  const cats = [
    ['pizza', 'Pizza', '🍕', 'Freshly baked', '#fff3e0', 1],
    ['burger', 'Burgers', '🍔', 'Juicy & fresh', '#fce4ec', 2],
    ['juice', 'Fresh Juice', '🥤', '100% natural', '#e8f5e9', 3],
    ['coffee', 'Coffee', '☕', 'Freshly brewed', '#efebe9', 4],
    ['breakfast', 'Breakfast', '🍳', 'Served all day', '#fff8e1', 5],
    ['main', 'Main Dishes', '🍽', 'Hearty meals', '#f3e5f5', 6],
    ['fastfood', 'Fast Food', '🌭', 'Quick bites', '#e3f2fd', 7],
  ].map(([slug, name, emoji, subtitle, icon_bg, sort_order]) => ({
    id: randomUUID(), slug, name, name_am: null, emoji, subtitle, icon_bg,
    sort_order, is_active: true,
  }));

  const bySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

  const rawItems = [
    ['pizza', 'Margherita', 'Tomato • Mozzarella • Basil', null, 450, '🍕', null, 1],
    ['pizza', 'Pepperoni', 'Pepperoni • Cheese • Tomato Sauce', null, 520, '🍕', 'new', 2],
    ['pizza', 'Cheese Lovers', 'Mozzarella • Cheddar • Parmesan', null, 480, '🧀', 'new', 3],
    ['pizza', 'Spicy Veggie', 'Bell Peppers • Olives • Onion • Jalapeño', null, 420, '🌶️', null, 4],
    ['pizza', 'Chicken BBQ', 'Grilled Chicken • BBQ Sauce • Cheese', null, 550, '🍗', null, 5],
    ['burger', 'Classic Beef Burger', 'Beef Patty • Lettuce • Tomato • Cheese', null, 420, '🍔', 'new', 1],
    ['burger', 'Chicken Crispy Burger', 'Crispy Chicken • Coleslaw • Mayo', null, 400, '🐔', null, 2],
    ['burger', 'Double Cheese Burger', 'Double Beef • Double Cheese • Special Sauce', null, 520, '🧀', 'new', 3],
    ['burger', 'Veggie Burger', 'Veggie Patty • Lettuce • Tomato • Avocado', null, 350, '🥬', null, 4],
    ['burger', 'Spicy BBQ Burger', 'Beef Patty • Pepper Jack • Jalapeño • BBQ', null, 460, '🔥', 'hot', 5],
    ['juice', 'Fresh Orange Juice', 'Freshly squeezed oranges', null, 150, '🍊', null, 1],
    ['juice', 'Mango Juice', 'Ripe mango blended to perfection', null, 170, '🥭', null, 2],
    ['juice', 'Strawberry Smoothie', 'Strawberry • Yogurt • Honey', null, 200, '🍓', 'new', 3],
    ['juice', 'Avocado Juice', 'Creamy avocado with milk', null, 180, '🥑', null, 4],
    ['juice', 'Pineapple Punch', 'Pineapple • Lemon • Mint', null, 160, '🍍', null, 5],
    ['juice', 'Mix Fruit Juice', 'Seasonal fruits blended fresh', null, 200, '🥤', null, 6],
    ['coffee', 'Espresso', null, null, 120, '☕', null, 1],
    ['coffee', 'Cappuccino', null, null, 150, '☕', null, 2],
    ['coffee', 'Latte', null, null, 160, '☕', null, 3],
    ['coffee', 'Macchiato', null, null, 140, '🥛', null, 4],
    ['coffee', 'Iced Coffee', null, null, 170, '❄️', null, 5],
    ['breakfast', 'Special Breakfast', null, 'እንቁላል • ዳቦ • አቮካዶ', 200, '🍳', null, 1],
    ['breakfast', 'Fasting Breakfast', null, 'አትክልት • ዳቦ • ልዩ ጎን', 220, '🥗', null, 2],
    ['main', 'Special Pasta', null, 'ፓስታ', 280, '🍝', null, 1],
    ['main', 'Chicken Rice', null, 'ሩዝ • ዶሮ • ሰላጣ', 300, '🍚', null, 2],
    ['fastfood', 'Chicken Sandwich', null, null, 400, '🥪', null, 1],
    ['fastfood', 'Fries (ቺፕስ)', null, null, 250, '🍟', null, 2],
  ];

  const items = rawItems.map(([cat, name, description, description_am, price, emoji, badge, sort_order]) => ({
    id: randomUUID(),
    category_id: bySlug[cat],
    name, name_am: null, description, description_am,
    price, emoji, image_url: null, badge,
    is_available: true, sort_order,
  }));

  const cafe = {
    id: 1, name: 'HARMONY CAFE', name_am: 'ሃርመኒ ካፌ',
    tagline: 'Good Food • Good Coffee • Good Vibes',
    address: 'ASTU Gate, Adama', phone: '+251911903172',
    phone_label: '+251 911 90 31 72', logo_url: null,
    header_emoji: '🍽', currency: 'ETB', footer_text: 'Harmony Cafe © 2026',
  };

  return { categories: cats, menu_items: items, cafe_info: [cafe], admin_users: [] };
}

function createServer() {
  let db = seed();

  /** PostgREST returns a bare object (not an array) when the client asks for
   *  `Accept: application/vnd.pgrst.object+json` — that is what .single() does. */
  const singleWanted = (req) =>
    String(req.headers.accept || '').includes('vnd.pgrst.object');

  const sendRows = (req, res, code, rows) => {
    if (singleWanted(req)) {
      if (!rows.length) {
        return send(res, 406, {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
        });
      }
      return send(res, code, rows[0]);
    }
    return send(res, code, rows);
  };

  const send = (res, code, body) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Expose-Headers': 'Content-Range',
    });
    res.end(payload);
  };

  const isAdminReq = (req) => {
    const auth = req.headers.authorization || '';
    return auth.includes(ADMIN_TOKEN);
  };

  const rlsError = (res) =>
    send(res, 403, {
      code: '42501',
      message: 'new row violates row-level security policy',
      details: null, hint: null,
    });

  /** Apply PostgREST-ish filters: col=eq.value */
  function applyFilters(rows, params) {
    let out = rows.slice();
    for (const [key, raw] of params.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
      const [op, ...rest] = String(raw).split('.');
      const value = rest.join('.');
      if (op === 'eq') out = out.filter((r) => String(r[key]) === value);
      else if (op === 'neq') out = out.filter((r) => String(r[key]) !== value);
      else if (op === 'is') out = out.filter((r) => String(r[key]) === value || (value === 'null' && r[key] == null));
    }
    const order = params.get('order');
    if (order) {
      const [col, dir] = order.split('.');
      out.sort((a, b) => {
        const av = a[col], bv = b[col];
        const cmp = av === bv ? 0 : (av > bv ? 1 : -1);
        return dir === 'desc' ? -cmp : cmp;
      });
    }
    return out;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'OPTIONS') return send(res, 200, {});

    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let json = null;
      try { json = body ? JSON.parse(body) : null; } catch (_) {}

      // ── TEST CONTROL: reset the database ──────────────────────────────────
      if (path === '/__reset') { db = seed(); return send(res, 200, { ok: true }); }

      // ── AUTH ──────────────────────────────────────────────────────────────
      if (path === '/auth/v1/token') {
        const { email, password } = json || {};
        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
          return send(res, 200, {
            access_token: ADMIN_TOKEN,
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: 'mock-refresh',
            user: { id: 'admin-uuid', email: ADMIN_EMAIL, aud: 'authenticated', role: 'authenticated' },
          });
        }
        return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      }

      if (path === '/auth/v1/logout') return send(res, 204);
      if (path === '/auth/v1/user') {
        if (!isAdminReq(req)) return send(res, 401, { message: 'invalid token' });
        return send(res, 200, { id: 'admin-uuid', email: ADMIN_EMAIL });
      }

      // ── RPC ───────────────────────────────────────────────────────────────
      if (path === '/rest/v1/rpc/is_admin') return send(res, 200, isAdminReq(req));

      // ── STORAGE (list) ────────────────────────────────────────────────────
      if (path.startsWith('/storage/v1/object/list/')) {
        return send(res, 200, []);
      }

      // ── STORAGE (upload) ──────────────────────────────────────────────────
      if (path.startsWith('/storage/v1/object/')) {
        if (!isAdminReq(req)) return send(res, 403, { message: 'permission denied' });
        const key = path.replace('/storage/v1/object/', '');
        return send(res, 200, { Key: key });
      }

      // ── REST TABLES ───────────────────────────────────────────────────────
      const m = path.match(/^\/rest\/v1\/(\w+)$/);
      if (m) {
        const table = m[1];
        if (!db[table]) return send(res, 404, { message: 'table not found: ' + table });

        if (req.method === 'GET') {
          return sendRows(req, res, 200, applyFilters(db[table], url.searchParams));
        }

        if (req.method === 'POST') {
          if (!isAdminReq(req)) return rlsError(res);
          const rows = Array.isArray(json) ? json : [json];
          const created = rows.map((r) => {
            const existingIdx = table === 'cafe_info' && r.id != null
              ? db[table].findIndex((x) => String(x.id) === String(r.id))
              : -1;
            if (existingIdx > -1) {            // upsert
              Object.assign(db[table][existingIdx], r);
              return db[table][existingIdx];
            }
            const row = Object.assign(
              { id: randomUUID(), is_available: true, is_active: true, sort_order: 0 },
              r
            );
            db[table].push(row);
            return row;
          });
          return sendRows(req, res, 201, created);
        }

        if (req.method === 'PATCH') {
          if (!isAdminReq(req)) return rlsError(res);
          const targets = applyFilters(db[table], url.searchParams);
          targets.forEach((t) => Object.assign(t, json));
          return sendRows(req, res, 200, targets);
        }

        if (req.method === 'DELETE') {
          if (!isAdminReq(req)) return rlsError(res);
          const targets = applyFilters(db[table], url.searchParams);
          const ids = new Set(targets.map((t) => String(t.id)));
          db[table] = db[table].filter((r) => !ids.has(String(r.id)));
          if (table === 'categories') {
            db.menu_items.forEach((i) => { if (ids.has(String(i.category_id))) i.category_id = null; });
          }
          return sendRows(req, res, 200, targets);
        }
      }

      return send(res, 404, { message: 'not found: ' + path });
    });
  });

  return server;
}

module.exports = { createServer, ADMIN_EMAIL, ADMIN_PASSWORD };

if (require.main === module) {
  const port = process.env.PORT || 54321;
  createServer().listen(port, '0.0.0.0', () => {
    console.log('Mock Supabase listening on http://0.0.0.0:' + port);
  });
}
